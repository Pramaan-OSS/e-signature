import { z } from 'zod';
import { authenticatedProcedure } from '../trpc';
export const getSubscriptionRoute = authenticatedProcedure
  .input(z.object({ organisationId: z.string() }))
  .query(() => ({ subscription: null, billingSubscription: null, plans: {}, claim: null }));
