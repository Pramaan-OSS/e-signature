import { ZEmailTransportConfigSchema } from '@e-sign/lib/server-only/email/email-transport-config';
import { ZNameSchema } from '@e-sign/lib/types/name';
import { z } from 'zod';

export const ZUpdateEmailTransportRequestSchema = z.object({
  id: z.string(),
  data: z.object({
    name: ZNameSchema,
    fromName: ZNameSchema,
    fromAddress: z.string().email(),
    config: ZEmailTransportConfigSchema,
  }),
});

export const ZUpdateEmailTransportResponseSchema = z.void();

export type TUpdateEmailTransportRequest = z.infer<typeof ZUpdateEmailTransportRequestSchema>;
