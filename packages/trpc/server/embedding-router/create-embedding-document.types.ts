import { ZDocumentEmailSettingsSchema } from '@e-sign/lib/types/document-email';
import {
  ZDocumentMetaDateFormatSchema,
  ZDocumentMetaDistributionMethodSchema,
  ZDocumentMetaDrawSignatureEnabledSchema,
  ZDocumentMetaLanguageSchema,
  ZDocumentMetaMessageSchema,
  ZDocumentMetaRedirectUrlSchema,
  ZDocumentMetaSubjectSchema,
  ZDocumentMetaTimezoneSchema,
  ZDocumentMetaTypedSignatureEnabledSchema,
  ZDocumentMetaUploadSignatureEnabledSchema,
} from '@e-sign/lib/types/document-meta';
import {
  ZFieldHeightSchema,
  ZFieldPageNumberSchema,
  ZFieldPageXSchema,
  ZFieldPageYSchema,
  ZFieldWidthSchema,
} from '@e-sign/lib/types/field';
import { ZFieldAndMetaSchema } from '@e-sign/lib/types/field-meta';
import { ZRecipientSigningOrderSchema } from '@e-sign/lib/types/recipient';
import { zEmail } from '@e-sign/lib/utils/zod';
import { RecipientRole } from '@e-sign/prisma/client';
import { DocumentSigningOrder } from '@e-sign/prisma/generated/types';
import { z } from 'zod';

import { ZDocumentExternalIdSchema, ZDocumentTitleSchema } from '../document-router/schema';

export const ZCreateEmbeddingDocumentRequestSchema = z.object({
  title: ZDocumentTitleSchema,
  documentDataId: z.string(),
  externalId: ZDocumentExternalIdSchema.optional(),
  recipients: z.array(
    z.object({
      id: z.number().optional(),
      email: zEmail(),
      name: z.string(),
      role: z.nativeEnum(RecipientRole),
      signingOrder: ZRecipientSigningOrderSchema.optional(),
      // We have an any cast so any changes here you need to update it in the embeding document edit page
      // Search: "map<any>" to find it
      fields: ZFieldAndMetaSchema.and(
        z.object({
          pageNumber: ZFieldPageNumberSchema,
          pageX: ZFieldPageXSchema,
          pageY: ZFieldPageYSchema,
          width: ZFieldWidthSchema,
          height: ZFieldHeightSchema,
        }),
      )
        .array()
        .optional(),
    }),
  ),
  meta: z
    .object({
      subject: ZDocumentMetaSubjectSchema.optional(),
      message: ZDocumentMetaMessageSchema.optional(),
      timezone: ZDocumentMetaTimezoneSchema.optional(),
      dateFormat: ZDocumentMetaDateFormatSchema.optional(),
      distributionMethod: ZDocumentMetaDistributionMethodSchema.optional(),
      signingOrder: z.nativeEnum(DocumentSigningOrder).optional(),
      redirectUrl: ZDocumentMetaRedirectUrlSchema.optional(),
      language: ZDocumentMetaLanguageSchema.optional(),
      typedSignatureEnabled: ZDocumentMetaTypedSignatureEnabledSchema.optional(),
      drawSignatureEnabled: ZDocumentMetaDrawSignatureEnabledSchema.optional(),
      uploadSignatureEnabled: ZDocumentMetaUploadSignatureEnabledSchema.optional(),
      emailSettings: ZDocumentEmailSettingsSchema.optional(),
    })
    .optional(),
});

export const ZCreateEmbeddingDocumentResponseSchema = z.object({
  documentId: z.number(),
});

export type TCreateEmbeddingDocumentRequestSchema = z.infer<typeof ZCreateEmbeddingDocumentRequestSchema>;
