import { adminProcedure } from '../trpc';
import {
  ZCreateBillingCustomerRequestSchema,
  ZCreateBillingCustomerResponseSchema,
} from './create-billing-customer.types';

export const createBillingCustomerRoute = adminProcedure
  .input(ZCreateBillingCustomerRequestSchema)
  .output(ZCreateBillingCustomerResponseSchema)
  .mutation(async (): Promise<never> => {
    throw new Error('Subscription billing is unavailable.');
  });
