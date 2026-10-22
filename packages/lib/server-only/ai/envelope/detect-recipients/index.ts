import { DocumentStatus } from '@prisma/client';
import { AppError, AppErrorCode } from '../../../../errors/app-error';
import { getFileServerSide } from '../../../../universal/upload/get-file.server';
import { getEnvelopeById } from '../../../envelope/get-envelope-by-id';
import { extractDocument } from '../../../pramaan/extract';

import type { TDetectedRecipientSchema } from './schema';

export type DetectRecipientsProgress = {
  pagesProcessed: number;
  totalPages: number;
  recipientsDetected: number;
};

export type DetectRecipientsFromEnvelopeOptions = {
  envelopeId: string;
  userId: number;
  teamId: number;
  onProgress?: (progress: DetectRecipientsProgress) => void;
};

export const detectRecipientsFromEnvelope = async ({
  envelopeId,
  userId,
  teamId,
  onProgress,
}: DetectRecipientsFromEnvelopeOptions) => {
  const envelope = await getEnvelopeById({
    id: {
      type: 'envelopeId',
      id: envelopeId,
    },
    userId,
    teamId,
    type: null,
  });

  if (envelope.status === DocumentStatus.COMPLETED) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'Cannot detect recipients for a completed envelope',
    });
  }

  let allRecipients: TDetectedRecipientSchema[] = [];

  for (const item of envelope.envelopeItems) {
    const pdfBytes = await getFileServerSide(item.documentData);
    const recipients = await detectRecipientsFromPdf({ pdfBytes, onProgress });

    allRecipients = mergeRecipients(allRecipients, recipients);
  }

  return allRecipients;
};

export type DetectRecipientsFromPdfOptions = {
  pdfBytes: Uint8Array;
  onProgress?: (progress: DetectRecipientsProgress) => void;
};

export const detectRecipientsFromPdf = async ({ pdfBytes, onProgress }: DetectRecipientsFromPdfOptions) => {
  const result = await extractDocument(
    pdfBytes,
    'pdf',
    'recipient-detection',
    'Extract people who sign, approve or receive this document. Never invent names or emails.',
  );
  onProgress?.({ pagesProcessed: 1, totalPages: 1, recipientsDetected: result.recipients.length });
  return result.recipients;
};

const isDuplicateRecipient = (recipient: TDetectedRecipientSchema, existing: TDetectedRecipientSchema) => {
  if (recipient.email && existing.email) {
    return recipient.email.toLowerCase() === existing.email.toLowerCase();
  }

  if (recipient.name && existing.name) {
    return recipient.name.toLowerCase() === existing.name.toLowerCase();
  }

  return false;
};

const mergeRecipients = (existingRecipients: TDetectedRecipientSchema[], newRecipients: TDetectedRecipientSchema[]) => {
  const merged = [...existingRecipients];

  for (const recipient of newRecipients) {
    const isDuplicate = merged.some((existing) => isDuplicateRecipient(recipient, existing));

    if (!isDuplicate) {
      merged.push(recipient);
    }
  }

  return merged;
};
