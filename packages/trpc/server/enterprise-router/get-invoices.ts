import { authenticatedProcedure } from '../trpc';
import { ZGetInvoicesRequestSchema } from './get-invoices.types';
export const getInvoicesRoute = authenticatedProcedure.input(ZGetInvoicesRequestSchema).query(() => []);
