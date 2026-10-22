import { createHash } from 'node:crypto';
import { PDFDocument } from '@cantoo/pdf-lib';
import { prisma } from '@e-sign/prisma';
import type { Prisma } from '@prisma/client';
import { catalogueActions, requireCatalogueAction } from '../../universal/apps/catalogue';
import { emailDeliveryTrackable } from '../../universal/email/tracking';
import { getFileServerSide } from '../../universal/upload/get-file.server';
import { getEnvelopeById } from '../envelope/get-envelope-by-id';
import { pramaanConfigured, readPramaanJob } from '../pramaan';
import { getTeamById } from '../team/get-team';
import { actionInputSchema, executeAction } from './actions';
import type { CataloguePage, CatalogueSession } from './catalogue-search';
import { DocumentExtractionError } from './extract';
import { PramaanSchemaError } from './json-schema';
import {
  estimateReminder,
  type ReminderPlan,
  ReminderReapproval,
  ReminderTryLater,
  ReminderUnavailable,
  reminderReport,
  runReminder,
} from './outcomes';

const retryableExtraction = new Set(['extract-document', 'extract-contract', 'extract-signatures']);
function referenceFrom(result: unknown): string | undefined {
  return result && typeof result === 'object' && 'ref' in result && typeof result.ref === 'string'
    ? result.ref
    : undefined;
}
export async function runOwnedOperation(
  raw: unknown,
  userId: number,
  teamId: number,
  returnUrl: string,
  catalogueSession?: CatalogueSession,
) {
  const input = actionInputSchema.parse(raw);
  if (!pramaanConfigured()) {
    throw new Error('Add the workspace connection key to enable actions.');
  }
  const team = await getTeamById({ userId, teamId });
  if (!['ADMIN', 'MANAGER'].includes(team.currentTeamRole)) {
    throw new Error('Ask a workspace manager to run this action.');
  }
  const { confirm: _confirm, approveOutcome: _approve, ...hashInput } = input;
  const hash = createHash('sha256')
    .update(JSON.stringify(input.action === 'sms-reminder' ? hashInput : input))
    .digest('hex');
  const existing = await prisma.capabilityOperation.findUnique({ where: { id: input.operationId } });
  if (existing) {
    if (existing.userId !== userId || existing.teamId !== teamId || existing.inputHash !== hash) {
      throw new Error('Request is unavailable.');
    }
    if (
      input.action !== 'sms-reminder' ||
      !['planned', 'waiting'].includes(existing.state) ||
      (existing.state === 'planned' && !input.approveOutcome)
    ) {
      if (!(existing.state === 'failed' && retryableExtraction.has(input.action))) {
        return existing; // Never replay an uncertain action.
      }
    }
  }
  const operation =
    existing ||
    (await prisma.capabilityOperation.create({
      data: {
        id: input.operationId,
        userId,
        teamId,
        action: input.action,
        inputHash: hash,
        envelopeId: input.envelopeId,
        recipientId: input.recipientId,
        sourceOperationId: input.sourceOperationId,
      },
    }));
  if (existing?.state === 'failed' && retryableExtraction.has(input.action)) {
    const claim = await prisma.capabilityOperation.updateMany({
      where: { id: existing.id, userId, teamId, state: 'failed' },
      data: { state: 'working', error: null },
    });
    if (claim.count !== 1) {
      return prisma.capabilityOperation.findUniqueOrThrow({ where: { id: existing.id } });
    }
  }
  const owned = async (id: string, actions: readonly string[]) => {
    const row = await prisma.capabilityOperation.findFirst({
      where: { id, userId, teamId, action: { in: [...actions] }, state: 'done' },
    });
    if (!row) {
      throw new Error('Choose a saved request from this workspace.');
    }
    return row;
  };
  try {
    if (input.action === 'sms-reminder') {
      if (!existing || existing.state === 'waiting') {
        if (existing) {
          const claim = await prisma.capabilityOperation.updateMany({
            where: { id: existing.id, userId, teamId, state: 'waiting' },
            data: { state: 'working' },
          });
          if (claim.count !== 1) {
            return prisma.capabilityOperation.findUniqueOrThrow({ where: { id: existing.id } });
          }
        }
        const plan = await estimateReminder(input);
        return await prisma.capabilityOperation.update({
          where: { id: operation.id },
          data: { state: 'planned', result: plan as unknown as Prisma.InputJsonValue, error: null },
        });
      }
      if (!input.confirm) {
        return prisma.capabilityOperation.update({
          where: { id: operation.id },
          data: { error: 'Confirm the displayed message before approving.' },
        });
      }
      const claim = await prisma.capabilityOperation.updateMany({
        where: { id: operation.id, userId, teamId, state: 'planned' },
        data: { state: 'working' },
      });
      if (claim.count !== 1) {
        return prisma.capabilityOperation.findUniqueOrThrow({ where: { id: operation.id } });
      }
      try {
        const result = await runReminder(input, existing.result as unknown as ReminderPlan, async (job) => {
          await prisma.capabilityOperation.update({
            where: { id: operation.id },
            data: {
              result: { outcome: 'notify.send', jobId: job.id, status: 'running' },
              error: 'Your run is saved. Check or cancel it from Saved requests.',
            },
          });
        });
        const failed = (result as { runStatus?: string }).runStatus;
        const needsCheck = (result as { needsCheck?: boolean }).needsCheck === true;
        const timedOut = (result as { timedOut?: boolean }).timedOut === true;
        return await prisma.capabilityOperation.update({
          where: { id: operation.id },
          data: {
            state: needsCheck || (failed && failed !== 'done') ? 'blocked' : 'done',
            result: result as Prisma.InputJsonValue,
            resourceRef: referenceFrom(result) ?? null,
            error: timedOut
              ? 'The run ended after its time limit. Check the recorded effects before retrying.'
              : needsCheck || (failed && failed !== 'done')
                ? 'The run did not finish. Check the recorded effects before retrying.'
                : null,
          },
        });
      } catch (error) {
        if (!(error instanceof ReminderReapproval)) {
          throw error;
        }
        const plan = await estimateReminder(input, true);
        return await prisma.capabilityOperation.update({
          where: { id: operation.id },
          data: {
            state: 'planned',
            result: plan as unknown as Prisma.InputJsonValue,
            error: 'The earlier plan was refused or expired. Review and approve this new estimate.',
          },
        });
      }
    }
    if (input.action === 'sms-status' && input.sourceOperationId) {
      const source = await owned(input.sourceOperationId, ['sms-reminder']);
      const saved = source.result as { outcome?: string; delivery?: string; observedAt?: string } | null;
      if (!source.resourceRef && saved?.outcome === 'notify.send') {
        return await prisma.capabilityOperation.update({
          where: { id: operation.id },
          data: {
            state: 'done',
            result: {
              status: saved.delivery || 'unknown',
              observedAt: saved.observedAt || null,
              message: 'This is the delivery state recorded when sent. A later lookup is unavailable for this request.',
            },
          },
        });
      }
    }
    let result = await executeAction(input, {
      catalogueSession,
      previousCatalogue: async (id) => (await owned(id, ['list-app-actions'])).result as unknown as CataloguePage,
      persistAppResult: async (result) => {
        await prisma.capabilityOperation.update({
          where: { id: operation.id },
          data: { result: result as Prisma.InputJsonValue },
        });
      },
      userId,
      teamId,
      returnUrl,
      reference: async (id, actions) => {
        const row = await owned(id, actions);
        if (input.action === 'email-status' && !emailDeliveryTrackable(row.result)) {
          throw new Error('Delivery tracking is not available for this email.');
        }
        if (!row.resourceRef) {
          throw new Error('Request has no reference yet.');
        }
        return row.resourceRef;
      },
      approvedAppAction: async (id, action) => {
        const row = await owned(id, ['list-app-actions']);
        return requireCatalogueAction(row.result, action);
      },
      envelope: async (id) => {
        const document = await getEnvelopeById({ id: { type: 'envelopeId', id }, userId, teamId, type: null });
        if (
          ['send-signature', 'create-template', 'send-template'].includes(input.action) &&
          document.status !== 'DRAFT'
        ) {
          throw new Error('Choose a draft document.');
        }
        const documents = await Promise.all(
          document.envelopeItems.map(async (item) => ({
            id: item.id,
            filename: item.title.endsWith('.pdf') ? item.title : `${item.title}.pdf`,
            bytes: await getFileServerSide(item.documentData),
          })),
        );
        if (!documents.length) {
          throw new Error('Add a PDF to this document.');
        }
        const signers = document.recipients
          .filter((r) => r.role === 'SIGNER')
          .map((r) => ({
            id: String(r.id),
            name: r.name,
            email: r.email,
            order: r.signingOrder || undefined,
            role: `Signer_${document.recipients.filter((r) => r.role === 'SIGNER').findIndex((s) => s.id === r.id) + 1}`,
          }));
        const dimensions = new Map<string, { width: number; height: number }[]>();
        for (const file of documents) {
          const pdf = await PDFDocument.load(file.bytes);
          dimensions.set(
            file.id,
            pdf.getPages().map((page) => ({ width: page.getWidth(), height: page.getHeight() })),
          );
        }
        const supportedFields = ['SIGNATURE', 'INITIALS', 'DATE', 'TEXT', 'NAME', 'EMAIL', 'NUMBER'];
        if (
          ['send-signature', 'create-template'].includes(input.action) &&
          document.fields.some((f) => !supportedFields.includes(f.type))
        ) {
          throw new Error(
            'Hosted copies support signature, initials, date and text fields. Use local signing for other fields.',
          );
        }
        const fields = document.fields
          .filter((f) => supportedFields.includes(f.type))
          .map((f) => {
            const size = dimensions.get(f.envelopeItemId)?.[f.page - 1];
            if (!size) {
              throw new Error('Signing field page is unavailable.');
            }
            return {
              name: f.id.toString(),
              type: (['NAME', 'EMAIL', 'NUMBER'].includes(f.type) ? 'text' : f.type.toLowerCase()) as
                | 'signature'
                | 'initials'
                | 'date'
                | 'text',
              documentId: f.envelopeItemId,
              signerId: String(f.recipientId),
              page: f.page,
              x: (Number(f.positionX) * size.width) / 100,
              y: (Number(f.positionY) * size.height) / 100,
              required: true,
            };
          });
        return { title: document.title, documents, signers, fields };
      },
    });
    if (
      input.sourceOperationId &&
      ['signature-status', 'identity-status', 'sms-status', 'email-status', 'template-status'].includes(input.action)
    ) {
      const source = await prisma.capabilityOperation.findFirst({
        where: { id: input.sourceOperationId, userId, teamId },
      });
      if (source && result && typeof result === 'object' && !Array.isArray(result)) {
        const prior =
          source.result && typeof source.result === 'object' && !Array.isArray(source.result) ? source.result : {};
        await prisma.capabilityOperation.update({
          where: { id: source.id },
          data: { result: { ...prior, ...result } as Prisma.InputJsonValue },
        });
      }
    }
    if (input.action === 'list-app-actions' && input.cursor && input.sourceOperationId) {
      const previous = await owned(input.sourceOperationId, ['list-app-actions']);
      const page = result as CataloguePage;
      const merged = new Map(catalogueActions(previous.result).map((item) => [`${item.app}:${item.action}`, item]));
      for (const item of catalogueActions(page)) {
        merged.set(`${item.app}:${item.action}`, item);
      }
      result = { ...page, results: [...merged.values()] };
      await prisma.capabilityOperation.update({
        where: { id: previous.id },
        data: { result: result as Prisma.InputJsonValue },
      });
    }
    return await prisma.capabilityOperation.update({
      where: { id: operation.id },
      data: { state: 'done', result: result as Prisma.InputJsonValue, resourceRef: referenceFrom(result) },
    });
  } catch (error) {
    if (error instanceof ReminderTryLater) {
      return prisma.capabilityOperation.update({
        where: { id: operation.id },
        data: { state: 'waiting', error: 'The service is busy. Try again later to review a new estimate.' },
      });
    }
    return await prisma.capabilityOperation.update({
      where: { id: operation.id },
      data: {
        state: retryableExtraction.has(input.action) ? 'failed' : 'blocked',
        error:
          error instanceof ReminderUnavailable
            ? error.message
            : (error as { code?: string }).code === 'upstream_unavailable'
              ? 'This feature is not available yet. Check its status before trying again.'
              : retryableExtraction.has(input.action)
                ? error instanceof PramaanSchemaError || error instanceof DocumentExtractionError
                  ? error.message
                  : `Extraction failed${(error as { code?: string }).code && /^[a-z_]+$/.test((error as { code: string }).code) ? ` (${(error as { code: string }).code})` : ''}. Try again.`
                : (error as { code?: string }).code === 'upstream_timeout'
                  ? 'The run timed out. Check the recorded effects before retrying.'
                  : 'This action could not be completed. Check its status before trying again.',
      },
    });
  }
}

/** Only the owner of a saved reminder may read or cancel its accepted job. */
export async function manageOwnedOutcome(id: string, userId: number, teamId: number, cancel = false) {
  const team = await getTeamById({ userId, teamId });
  if (!['ADMIN', 'MANAGER'].includes(team.currentTeamRole)) {
    throw new Error('Request is unavailable.');
  }
  const row = await prisma.capabilityOperation.findUnique({ where: { id } });
  const saved = row?.result as { jobId?: unknown } | null;
  if (
    !row ||
    row.userId !== userId ||
    row.teamId !== teamId ||
    row.action !== 'sms-reminder' ||
    typeof saved?.jobId !== 'string'
  ) {
    throw new Error('Request is unavailable.');
  }
  try {
    const job = await readPramaanJob(saved.jobId, cancel);
    if (job.status === 'running') {
      return row;
    }
    const report = job.result as Parameters<typeof reminderReport>[0] | undefined;
    const result =
      report?.outcome === 'notify.send'
        ? reminderReport(report)
        : {
            status: job.status,
            needsCheck: true,
            message: 'The result could not be recovered. Check before retrying.',
          };
    return await prisma.capabilityOperation.update({
      where: { id },
      data: {
        state: job.status === 'done' && report?.status === 'done' && !result.needsCheck ? 'done' : 'blocked',
        result: { ...result, jobId: job.id, jobStatus: job.status } as Prisma.InputJsonValue,
        error:
          job.error?.code === 'upstream_timeout' || report?.error?.code === 'upstream_timeout'
            ? 'The run ended after its time limit. Check the recorded effects before retrying.'
            : result.needsCheck
              ? 'A step may have acted. Check before retrying.'
              : job.status !== 'done' || report?.status !== 'done'
                ? 'The run stopped. Check the recorded effects before retrying.'
                : null,
      },
    });
  } catch {
    return prisma.capabilityOperation.update({
      where: { id },
      data: { error: 'The saved run could not be checked. Check before retrying; no new message was sent.' },
    });
  }
}
