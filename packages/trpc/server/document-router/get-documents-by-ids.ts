import { getMultipleEnvelopeWhereInput } from '@e-sign/lib/server-only/envelope/get-envelopes-by-ids';
import { mapEnvelopesToDocumentMany } from '@e-sign/lib/utils/document';
import { prisma } from '@e-sign/prisma';
import { EnvelopeType } from '@prisma/client';

import { authenticatedProcedure } from '../trpc';
import {
  getDocumentsByIdsMeta,
  ZGetDocumentsByIdsRequestSchema,
  ZGetDocumentsByIdsResponseSchema,
} from './get-documents-by-ids.types';

export const getDocumentsByIdsRoute = authenticatedProcedure
  .meta(getDocumentsByIdsMeta)
  .input(ZGetDocumentsByIdsRequestSchema)
  .output(ZGetDocumentsByIdsResponseSchema)
  .mutation(async ({ input, ctx }) => {
    const { teamId, user } = ctx;
    const { documentIds } = input;

    ctx.logger.info({
      input: {
        documentIds,
      },
    });

    const { envelopeWhereInput } = await getMultipleEnvelopeWhereInput({
      ids: {
        type: 'documentId',
        ids: documentIds,
      },
      userId: user.id,
      teamId,
      type: EnvelopeType.DOCUMENT,
    });

    const envelopes = await prisma.envelope.findMany({
      where: envelopeWhereInput,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        recipients: {
          orderBy: {
            id: 'asc',
          },
        },
        team: {
          select: {
            id: true,
            url: true,
          },
        },
      },
    });

    return {
      data: envelopes.map((envelope) => mapEnvelopesToDocumentMany(envelope)),
    };
  });
