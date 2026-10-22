import { createHash } from 'node:crypto';
import { MANAGED_EMAIL_ADDRESS, MANAGED_EMAIL_DOMAIN, MANAGED_EMAIL_FROM } from '@e-sign/lib/constants/email';
import type { TEmailTransportConfig } from '@e-sign/lib/server-only/email/email-transport-config';
import { callPramaan, uploadPramaanFile } from '@e-sign/lib/server-only/pramaan';
import { capabilityJobContext } from '@e-sign/lib/server-only/pramaan/job-context';
import { prisma } from '@e-sign/prisma';
import { createTransport } from 'nodemailer';

const configuredReplyAddress = (value?: string) => {
  if (!value) {
    return undefined;
  }
  const address = value.trim().match(/<([^<>]+)>$/)?.[1] || value.trim();
  const domain = address.split('@').at(-1)?.toLowerCase();
  if (
    !domain ||
    !domain.includes('.') ||
    /\s/.test(domain) ||
    ['example.test', 'example.com', 'test', 'invalid', 'localhost'].some(
      (reserved) => domain === reserved || domain.endsWith(`.${reserved}`),
    )
  ) {
    return undefined;
  }
  return value;
};

/** Nodemailer formats local messages; its only sending transport is Pramaan. */
export const buildTransport = (_config?: TEmailTransportConfig) =>
  createTransport({
    name: 'pramaan',
    version: '1',
    send(mail, callback) {
      void (async () => {
        const envelope = mail.message.getEnvelope();
        const data = mail.data;
        const asText = (value: unknown) =>
          typeof value === 'string' ? value : Buffer.isBuffer(value) ? value.toString('utf8') : undefined;
        const attachments = (data.attachments ?? []).map((a) => {
          if (a.path || !a.content || (!Buffer.isBuffer(a.content) && typeof a.content !== 'string')) {
            throw new Error('Email attachments must use local bytes.');
          }
          const bytes = Buffer.isBuffer(a.content)
            ? a.content
            : Buffer.from(a.content, (a.encoding as BufferEncoding) || 'utf8');
          return {
            filename: a.filename || 'document.pdf',
            content: bytes.toString('base64'),
            mimeType: a.contentType,
            contentId: a.cid,
            inline: a.contentDisposition === 'inline',
          };
        });
        const addressList = (value: unknown): string[] =>
          value == null
            ? []
            : (Array.isArray(value) ? value : [value]).flatMap((v) =>
                typeof v === 'string' ? [v] : v && typeof v === 'object' && 'address' in v ? [String(v.address)] : [],
              );
        const messageId = mail.message.messageId();
        const logicalKey = capabilityJobContext.getStore();
        const hash = createHash('sha256')
          .update(logicalKey ? `${logicalKey}:${envelope.to.join(',')}` : messageId)
          .digest('hex');
        const idempotencyKey = `email:${hash}`;
        const operationId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
        const headers = data.headers && !Array.isArray(data.headers) ? data.headers : {};
        const userId = Number('X-ESign-Sender-User-Id' in headers ? headers['X-ESign-Sender-User-Id'] : undefined);
        const teamId = Number('X-ESign-Team-Id' in headers ? headers['X-ESign-Team-Id'] : undefined);
        // This transport has no connected sending account. Keep custom addresses for replies.
        const senderAddress = typeof envelope.from === 'string' ? envelope.from : '';
        const managedSender = senderAddress.split('@').at(-1)?.toLowerCase() === MANAGED_EMAIL_DOMAIN;
        const input = {
          from: managedSender
            ? asText(data.from) || (senderAddress === MANAGED_EMAIL_ADDRESS ? MANAGED_EMAIL_FROM : senderAddress)
            : MANAGED_EMAIL_FROM,
          to: addressList(data.to),
          cc: addressList(data.cc),
          bcc: addressList(data.bcc),
          replyTo:
            configuredReplyAddress(addressList(data.replyTo)[0]) ||
            configuredReplyAddress(!managedSender ? senderAddress : undefined),
          inReplyTo: asText(data.inReplyTo),
          references: data.references ? addressList(data.references) : undefined,
          subject: data.subject || '',
          text: asText(data.text),
          html: asText(data.html),
        };
        const completion = 'X-ESign-Completed-Document' in headers && headers['X-ESign-Completed-Document'] === 'true';
        const trackedCompletion =
          completion && Number.isInteger(userId) && userId > 0 && Number.isInteger(teamId) && teamId > 0;
        const prior = trackedCompletion
          ? await prisma.capabilityOperation.findUnique({ where: { id: operationId } })
          : null;
        let result: { status: 'sent' | 'queued'; ref?: string; rfcMessageId?: string; trackable?: boolean };
        if (prior) {
          const receipt = prior.result as { status?: string; rfcMessageId?: string; trackable?: boolean } | null;
          if (
            prior.userId !== userId ||
            prior.teamId !== teamId ||
            prior.state !== 'done' ||
            !receipt ||
            !['sent', 'queued'].includes(receipt.status || '')
          ) {
            throw new Error('Check the saved email before retrying.');
          }
          result = {
            status: receipt.status as 'sent' | 'queued',
            ref: prior.resourceRef || undefined,
            rfcMessageId: receipt.rfcMessageId,
            trackable: receipt.trackable === true,
          };
        } else if (completion) {
          if (trackedCompletion) {
            await prisma.capabilityOperation.create({
              data: {
                id: operationId,
                userId,
                teamId,
                action: 'email-notification',
                inputHash: hash,
                state: 'working',
              },
            });
          }
          const linkedOnly = () => callPramaan('email.send', input, { idempotencyKey: `${idempotencyKey}:link` });
          const size = attachments.reduce((total, a) => total + Buffer.byteLength(a.content, 'base64'), 0);
          if (!attachments.length || attachments.length > 10 || size > 6_000_000) {
            result = await linkedOnly();
          } else {
            let files: { fileId: string; name: string }[] | undefined;
            try {
              files = await Promise.all(
                attachments.map(async (a) => {
                  const uploaded = await uploadPramaanFile(
                    Buffer.from(a.content, 'base64'),
                    'application/pdf',
                    'document',
                    6_000_000,
                  );
                  return { fileId: uploaded.fileId, name: a.filename };
                }),
              );
            } catch {
              /* Uploading cannot send an email; the secure link remains usable. */
            }
            if (!files) {
              result = await linkedOnly();
            } else {
              try {
                result = await callPramaan(
                  'email.send',
                  { ...input, attachments: files },
                  { idempotencyKey: `${idempotencyKey}:attachments` },
                );
              } catch (error) {
                const e = error as { code?: string; effect?: string };
                if (e.code !== 'invalid_request' && !(e.code === 'upstream_unavailable' && e.effect === 'none')) {
                  throw error;
                }
                result = await linkedOnly();
              }
            }
          }
        } else {
          result = attachments.length
            ? await callPramaan('email.message.send', { ...input, attachments }, { idempotencyKey })
            : await callPramaan('email.send', input, { idempotencyKey });
        }
        if (
          (result.ref || trackedCompletion) &&
          Number.isInteger(userId) &&
          userId > 0 &&
          Number.isInteger(teamId) &&
          teamId > 0
        ) {
          await prisma.capabilityOperation.upsert({
            where: { id: operationId },
            create: {
              id: operationId,
              userId,
              teamId,
              action: 'email-notification',
              inputHash: hash,
              state: 'done',
              resourceRef: result.ref,
              result: {
                status: result.status,
                trackable: result.trackable === true,
                ...(result.rfcMessageId ? { rfcMessageId: result.rfcMessageId } : {}),
              },
            },
            update: {
              state: 'done',
              resourceRef: result.ref,
              result: {
                status: result.status,
                trackable: result.trackable === true,
                ...(result.rfcMessageId ? { rfcMessageId: result.rfcMessageId } : {}),
              },
            },
          });
        }
        return {
          envelope,
          messageId: result.rfcMessageId || messageId,
          accepted: envelope.to,
          rejected: [],
          pending: [],
          response: result.status,
          pramaanRef: result.ref,
        };
      })().then(
        (result) => callback(null, result),
        () => callback(new Error('Email could not be sent. Check its status before retrying.'), {} as never),
      );
    },
  });
