import { IS_BILLING_ENABLED, NEXT_PUBLIC_WEBAPP_URL } from '@e-sign/lib/constants/app';
import { ORGANISATION_MEMBER_ROLE_PERMISSIONS_MAP } from '@e-sign/lib/constants/organisations';
import { AppError, AppErrorCode } from '@e-sign/lib/errors/app-error';
import { buildOrganisationWhereQuery } from '@e-sign/lib/utils/organisations';
import { prisma } from '@e-sign/prisma';

import { authenticatedProcedure } from '../trpc';
import { ZCreateSubscriptionRequestSchema } from './create-subscription.types';

export const createSubscriptionRoute = authenticatedProcedure
  .input(ZCreateSubscriptionRequestSchema)
  .mutation(async (): Promise<never> => { throw new Error('Subscription billing is unavailable.'); });
