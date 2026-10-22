import { PDF_SIZE_A4_72PPI } from '@e-sign/lib/constants/pdf';
import { AppError, AppErrorCode } from '@e-sign/lib/errors/app-error';
import { getEnvelopeById } from '@e-sign/lib/server-only/envelope/get-envelope-by-id';
import { generateAuditLogPdf } from '@e-sign/lib/server-only/pdf/generate-audit-log-pdf';
import { EnvelopeType } from '@prisma/client';

import { authenticatedProcedure } from '../trpc';
import {
  ZDownloadDocumentAuditLogsRequestSchema,
  ZDownloadDocumentAuditLogsResponseSchema,
} from './download-document-audit-logs.types';

export const downloadDocumentAuditLogsRoute = authenticatedProcedure
  .input(ZDownloadDocumentAuditLogsRequestSchema)
  .output(ZDownloadDocumentAuditLogsResponseSchema)
  .mutation(async ({ input, ctx }) => {
    const { teamId } = ctx;
    const { envelopeId } = input;

    ctx.logger.info({
      input: {
        envelopeId,
      },
    });

    const envelope = await getEnvelopeById({
      id: {
        type: 'envelopeId',
        id: envelopeId,
      },
      type: EnvelopeType.DOCUMENT,
      userId: ctx.user.id,
      teamId,
    }).catch(() => null);

    if (!envelope) {
      throw new AppError(AppErrorCode.UNAUTHORIZED, {
        message: 'You do not have access to this document.',
      });
    }

    const certificatePdf = await generateAuditLogPdf({
      envelope,
      recipients: envelope.recipients,
      fields: envelope.fields,
      language: envelope.documentMeta.language,
      envelopeOwner: {
        email: envelope.user.email,
        name: envelope.user.name || '',
      },
      envelopeItems: envelope.envelopeItems.map((item) => item.title),
      pageWidth: PDF_SIZE_A4_72PPI.width,
      pageHeight: PDF_SIZE_A4_72PPI.height,
    });

    const result = await certificatePdf.save();

    return {
      data: Buffer.from(result).toString('base64'),
      envelopeTitle: envelope.title,
    };
  });
