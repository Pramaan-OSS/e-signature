import { ZDocumentManySchema } from '@e-sign/lib/types/document';
import { z } from 'zod';

import type { TrpcRouteMeta } from '../trpc';

export const getDocumentsByIdsMeta: TrpcRouteMeta = {
  openapi: {
    method: 'POST',
    path: '/document/get-many',
    summary: 'Get multiple documents',
    description:
      'Deprecated: this endpoint is being replaced by the Envelope API. See /help for the migration guide. Retrieve multiple documents by their IDs',
    tags: ['Document'],
    deprecated: true,
  },
};

export const ZGetDocumentsByIdsRequestSchema = z.object({
  documentIds: z.array(z.number()).min(1),
});

export const ZGetDocumentsByIdsResponseSchema = z.object({
  data: z.array(ZDocumentManySchema),
});

export type TGetDocumentsByIdsRequest = z.infer<typeof ZGetDocumentsByIdsRequestSchema>;
export type TGetDocumentsByIdsResponse = z.infer<typeof ZGetDocumentsByIdsResponseSchema>;
