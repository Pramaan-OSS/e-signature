import { ZDocumentEmailSettingsSchema } from '@e-sign/lib/types/document-email';
import { zEmail } from '@e-sign/lib/utils/zod';
import { DocumentDistributionMethod } from '@prisma/client';
import { z } from 'zod';

export const ZAddSubjectFormSchema = z.object({
  meta: z.object({
    emailId: z.string().nullable(),
    emailReplyTo: z.preprocess((val) => (val === '' ? undefined : val), zEmail().optional()),
    // emailReplyName: z.string().optional(),
    subject: z.string(),
    message: z.string(),
    distributionMethod: z.nativeEnum(DocumentDistributionMethod).optional().default(DocumentDistributionMethod.EMAIL),
    emailSettings: ZDocumentEmailSettingsSchema,
  }),
});

export type TAddSubjectFormSchema = z.infer<typeof ZAddSubjectFormSchema>;
