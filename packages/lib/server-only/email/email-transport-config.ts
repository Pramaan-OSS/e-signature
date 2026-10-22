import { z } from 'zod';
export const EMAIL_TRANSPORT_SECRET_KEYS: readonly string[] = [];
export const ZEmailTransportConfigSchema = z.object({ type: z.literal('PRAMAAN') });
export const ZEmailTransportPublicConfigSchema = ZEmailTransportConfigSchema;
export type TEmailTransportConfig = z.infer<typeof ZEmailTransportConfigSchema>;
export type TEmailTransportPublicConfig = TEmailTransportConfig;
export const toPublicEmailTransportConfig = (_config: unknown): TEmailTransportConfig => ({ type: 'PRAMAAN' });
export const encryptEmailTransportConfig = (_config: TEmailTransportConfig) => JSON.stringify({ type: 'PRAMAAN' });
export const decryptEmailTransportConfig = (_stored: string): TEmailTransportConfig => ({ type: 'PRAMAAN' });
