import type { Requests } from '@pramaan/sdk';
import { z } from 'zod';
import type { CataloguedAction } from '../../universal/apps/catalogue';
import { callPramaan, uploadPramaanFile } from '../pramaan';
import { readAppFileText } from './app-file-text';
import { type CataloguePage, type CatalogueSession, searchCatalogue } from './catalogue-search';
import { requireCompleteExtraction } from './extract';

export const actionNames = [
  'send-signature',
  'signature-status',
  'signature-download',
  'signature-audit',
  'signature-remind',
  'signature-cancel',
  'create-template',
  'template-status',
  'send-template',
  'verify-identity',
  'identity-status',
  'sms-reminder',
  'sms-status',
  'email-status',
  'extract-document',
  'extract-contract',
  'extract-signatures',
  'connect-app',
  'list-app-connections',
  'revoke-app-connection',
  'list-app-actions',
  'run-app-action',
  'upload-storage',
  'abort-upload',
] as const;
export const actionInputSchema = z.object({
  action: z.enum(actionNames),
  operationId: z.string().uuid(),
  envelopeId: z.string().optional(),
  sourceOperationId: z.string().uuid().optional(),
  recipientId: z.number().int().positive().optional(),
  title: z.string().trim().max(200).optional(),
  subject: z.string().trim().max(200).optional(),
  message: z.string().max(1600).optional(),
  email: z.string().email().optional(),
  phone: z
    .string()
    .regex(/^\+[1-9]\d{7,14}$/)
    .optional(),
  query: z.string().trim().min(1).max(200).optional(),
  app: z
    .string()
    .regex(/^[a-z0-9_-]{1,64}$/)
    .optional(),
  cursor: z.string().min(1).max(4096).optional(),
  readDownloadedFiles: z.boolean().optional(),
  appAction: z.string().max(200).optional(),
  arguments: z.record(z.unknown()).optional(),
  approveOutcome: z.boolean().optional(),
  confirm: z.boolean().optional(),
  consent: z.boolean().optional(),
});
export type ActionInput = z.infer<typeof actionInputSchema>;
export type ActionContext = {
  userId: number;
  teamId: number;
  returnUrl: string;
  // Both callbacks enforce ownership before returning sensitive bytes or references.
  envelope(id: string): Promise<{
    title: string;
    documents: Array<{ id: string; filename: string; bytes: Uint8Array }>;
    signers: Requests['signature.request.send']['signers'];
    fields: Requests['signature.request.send']['fields'];
  }>;
  reference(id: string, actions: readonly string[]): Promise<string>;
  catalogueSession?: CatalogueSession;
  previousCatalogue?(id: string): Promise<CataloguePage>;
  persistAppResult?(result: unknown): Promise<void>;
  approvedAppAction(id: string, action: string): Promise<CataloguedAction>;
};
export async function executeAction(input: ActionInput, context: ActionContext): Promise<unknown> {
  const options = { idempotencyKey: input.operationId };
  const ref = (allowed: readonly string[]) => {
    if (!input.sourceOperationId) {
      throw new Error('Choose a saved request.');
    }
    return context.reference(input.sourceOperationId, allowed);
  };
  const envelope = async () => {
    if (!input.envelopeId) {
      throw new Error('Choose a document.');
    }
    return context.envelope(input.envelopeId);
  };
  const confirmed = () => {
    if (!input.confirm) {
      throw new Error('Confirm this action first.');
    }
  };
  const signedSources = ['send-signature', 'send-template'];
  switch (input.action) {
    case 'send-signature': {
      confirmed();
      const draft = await envelope();
      if (
        draft.documents.length > 10 ||
        draft.documents.reduce((n, d) => n + d.bytes.length, 0) > 10_000_000 ||
        draft.signers.length > 20 ||
        !draft.signers.length ||
        (draft.fields?.length || 0) > 200
      ) {
        throw new Error('Document exceeds hosted signing limits.');
      }
      const documents = await Promise.all(
        draft.documents.map(async (d) => ({
          id: d.id,
          filename: d.filename,
          fileId: (await uploadPramaanFile(d.bytes, 'application/pdf')).fileId,
        })),
      );
      return callPramaan(
        'signature.request.send',
        {
          title: draft.title,
          subject: input.subject || draft.title,
          message: input.message,
          documents,
          signers: draft.signers,
          fields: draft.fields,
          delivery: 'email',
        },
        options,
      );
    }
    case 'signature-status':
      return callPramaan('signature.request.get', { ref: await ref(signedSources), includeSigners: true });
    case 'signature-download':
      return callPramaan('signature.request.download', {
        ref: await ref(signedSources),
        format: 'pdf',
        completedOnly: true,
      });
    case 'signature-audit': {
      const requestRef = await ref(signedSources);
      const status = await callPramaan('signature.request.get', { ref: requestRef, includeSigners: true });
      const certificate = await callPramaan('signature.request.download', {
        ref: requestRef,
        format: 'pdf',
        completedOnly: true,
        includeCertificate: true,
      });
      return { status, certificate };
    }
    case 'signature-remind':
      confirmed();
      if (!input.email) {
        throw new Error('Choose a signer email.');
      }
      return callPramaan(
        'signature.request.remind',
        { ref: await ref(signedSources), signerEmail: input.email, confirm: true },
        options,
      );
    case 'signature-cancel':
      confirmed();
      return callPramaan(
        'signature.request.cancel',
        { ref: await ref(signedSources), reason: input.message, confirm: true },
        options,
      );
    case 'create-template': {
      const draft = await envelope();
      if (
        !draft.signers.length ||
        draft.signers.length > 20 ||
        draft.documents.length > 10 ||
        draft.documents.reduce((n, d) => n + d.bytes.length, 0) > 10_000_000 ||
        (draft.fields?.length || 0) > 200
      ) {
        throw new Error('Document exceeds hosted template limits.');
      }
      const documents = await Promise.all(
        draft.documents.map(async (d) => ({
          id: d.id,
          filename: d.filename,
          fileId: (await uploadPramaanFile(d.bytes, 'application/pdf')).fileId,
        })),
      );
      return callPramaan(
        'signature.template.create',
        {
          title: input.title || draft.title,
          message: input.message,
          documents,
          roles: draft.signers.map((s) => ({ name: s.role || s.id, order: s.order })),
          fields: draft.fields?.map((f) => ({
            ...f,
            signerId: draft.signers.find((s) => s.id === f.signerId)?.role || f.signerId,
          })),
        },
        options,
      );
    }
    case 'template-status':
      return callPramaan('signature.template.get', { ref: await ref(['create-template']) });
    case 'send-template': {
      confirmed();
      const draft = await envelope();
      return callPramaan(
        'signature.request.send-template',
        {
          ref: await ref(['create-template']),
          title: draft.title,
          subject: input.subject || draft.title,
          message: input.message,
          signers: draft.signers.map((s) => ({ ...s, role: s.role || s.id })),
          delivery: 'email',
        },
        options,
      );
    }
    case 'verify-identity': {
      if (!input.consent || !input.recipientId) {
        throw new Error('Choose a consenting signer.');
      }
      const draft = await envelope();
      if (!draft.signers.some((s) => s.id === String(input.recipientId))) {
        throw new Error('Signer is not on this document.');
      }
      return callPramaan(
        'identity.verification.create',
        { endUserId: `team_${context.teamId}.recipient_${input.recipientId}` },
        options,
      );
    }
    case 'identity-status':
      return callPramaan('identity.verification.get', { ref: await ref(['verify-identity']) });
    case 'sms-reminder':
      confirmed();
      if (!input.consent || !input.phone || !input.message) {
        throw new Error('Add a phone number, message and consent.');
      }
      return callPramaan('sms.send', { to: input.phone, body: input.message }, options);
    case 'sms-status':
      return callPramaan('sms.status', { ref: await ref(['sms-reminder']) });
    case 'email-status':
      return callPramaan('email.status', { ref: await ref(['email-notification']) });
    case 'extract-document': {
      const draft = await envelope();
      return requireCompleteExtraction(
        await callPramaan('document.extract', {
          content: Buffer.from(draft.documents[0].bytes).toString('base64'),
          extension: 'pdf',
          prompt: input.message || 'Extract the parties, dates and obligations.',
        }),
      );
    }
    case 'extract-contract': {
      const draft = await envelope();
      const { pdfToContractText } = await import('../ai/pdf-to-images');
      return callPramaan('document.contract.extract', {
        text: await pdfToContractText(draft.documents[0].bytes),
      });
    }
    case 'extract-signatures': {
      if (!input.consent) {
        throw new Error('Confirm permission to extract signatures.');
      }
      const draft = await envelope();
      const { pdfToImages } = await import('../ai/pdf-to-images');
      const pages = await pdfToImages(draft.documents[0].bytes);
      const results = [];
      for (const page of pages.slice(0, 10)) {
        const file = await uploadPramaanFile(page.image, 'image/jpeg', 'image');
        results.push(
          await callPramaan(
            'document.signature.extract',
            { file: file.fileId, limit: 10 },
            { idempotencyKey: `${input.operationId}:page:${page.pageNumber}` },
          ),
        );
      }
      return { pages: results, truncated: pages.length > 10 };
    }
    case 'connect-app':
      if (!input.app) {
        throw new Error('Choose an app.');
      }
      return {
        ...(await callPramaan(
          'apps.connection.start',
          { endUserRef: `user_${context.userId}`, app: input.app, redirectUrl: context.returnUrl },
          options,
        )),
        app: input.app,
      };
    case 'list-app-connections':
      return callPramaan('apps.connections.list', { endUserRef: `user_${context.userId}`, app: input.app });
    case 'revoke-app-connection':
      confirmed();
      if (!input.app) {
        throw new Error('Choose a connected app.');
      }
      return callPramaan('apps.connection.revoke', { endUserRef: `user_${context.userId}`, app: input.app }, options);
    case 'list-app-actions': {
      if (!input.query?.trim()) {
        throw new Error('Enter a keyword to search for app actions.');
      }
      if (input.cursor) {
        if (!input.sourceOperationId || !context.previousCatalogue) {
          throw new Error('Choose the saved search to load more actions.');
        }
        const previous = await context.previousCatalogue(input.sourceOperationId);
        if (
          previous.discovery !== 'catalogue-search' ||
          previous.nextCursor !== input.cursor ||
          previous.query !== input.query.trim() ||
          (previous.app || '') !== (input.app || '') ||
          previous.limit !== 50 ||
          previous.cursorExpiresAt <= Date.now()
        ) {
          throw new Error('Keep the same search when loading more actions.');
        }
      }
      return searchCatalogue(input.query, input.app, input.cursor, context.catalogueSession);
    }
    case 'run-app-action': {
      confirmed();
      if (!input.appAction || !input.sourceOperationId) {
        throw new Error('Choose an available app action.');
      }
      const selected = await context.approvedAppAction(input.sourceOperationId, input.appAction);
      const result = await callPramaan(
        'apps.action.execute',
        { endUserRef: `user_${context.userId}`, action: selected.action, input: input.arguments || {} },
        options,
      );
      await context.persistAppResult?.(result);
      if (input.readDownloadedFiles && result.status === 'succeeded') {
        return { ...result, fileTexts: await readAppFileText(result.output) };
      }
      return result;
    }
    case 'upload-storage': {
      const draft = await envelope();
      const { putMultipartObject, putObject } = await import('./storage');
      const file = draft.documents[0];
      const path = `user_${context.userId}/${input.operationId}/${file.filename}`;
      if (file.bytes.length > 25_000_000) {
        return putMultipartObject(path, file.bytes, 'application/pdf', input.operationId);
      }
      await putObject(path, file.bytes, 'application/pdf');
      return { stored: true, path };
    }
    case 'abort-upload':
      confirmed();
      return callPramaan('storage.upload.abort', { ref: await ref(['upload-storage']), confirm: true }, options);
  }
}
