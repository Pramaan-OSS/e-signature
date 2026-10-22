import { z } from 'zod';

export const ZCreateBillingCustomerRequestSchema = z.object({
  organisationId: z.string().describe('The organisation to attach the customer to'),
});

export const ZCreateBillingCustomerResponseSchema = z.void();

export type TCreateBillingCustomerRequest = z.infer<typeof ZCreateBillingCustomerRequestSchema>;
