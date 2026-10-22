import { IS_BILLING_ENABLED } from '@e-sign/lib/constants/app';
import { ORGANISATION_MEMBER_ROLE_PERMISSIONS_MAP } from '@e-sign/lib/constants/organisations';
import { AppError, AppErrorCode } from '@e-sign/lib/errors/app-error';
import { assertRateLimit } from '@e-sign/lib/server-only/rate-limit/rate-limit-middleware';
import { syncSubscriptionRateLimit } from '@e-sign/lib/server-only/rate-limit/rate-limits';
import { buildOrganisationWhereQuery } from '@e-sign/lib/utils/organisations';
import { prisma } from '@e-sign/prisma';

import { authenticatedProcedure } from '../trpc';
import { ZSyncSubscriptionRequestSchema, ZSyncSubscriptionResponseSchema } from './sync-subscription.types';

export const syncSubscriptionRoute = authenticatedProcedure
  .input(ZSyncSubscriptionRequestSchema)
  .output(ZSyncSubscriptionResponseSchema)
  .mutation(async (): Promise<never> => { throw new Error('Subscription billing is unavailable.'); });
