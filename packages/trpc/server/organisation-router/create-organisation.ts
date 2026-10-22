import { IS_BILLING_ENABLED, NEXT_PUBLIC_WEBAPP_URL } from '@e-sign/lib/constants/app';
import { AppError, AppErrorCode } from '@e-sign/lib/errors/app-error';
import { createOrganisation } from '@e-sign/lib/server-only/organisation/create-organisation';
import { getSubscriptionClaim } from '@e-sign/lib/server-only/subscription/get-subscription-claim';
import { INTERNAL_CLAIM_ID } from '@e-sign/lib/types/subscription';
import { prisma } from '@e-sign/prisma';
import { OrganisationType, SubscriptionStatus } from '@prisma/client';
import { authenticatedProcedure } from '../trpc';
import { ZCreateOrganisationRequestSchema, ZCreateOrganisationResponseSchema } from './create-organisation.types';

export const createOrganisationRoute = authenticatedProcedure
  // .meta(createOrganisationMeta)
  .input(ZCreateOrganisationRequestSchema)
  .output(ZCreateOrganisationResponseSchema)
  .mutation(async ({ input, ctx }) => {
    const { name, priceId } = input;
    const { user } = ctx;

    // Free organisations should be Personal by default.
    const organisationType = IS_BILLING_ENABLED() ? OrganisationType.PERSONAL : OrganisationType.ORGANISATION;

    const freeSubscriptionClaim = await getSubscriptionClaim(INTERNAL_CLAIM_ID.FREE);

    await createOrganisation({
      userId: user.id,
      name,
      type: organisationType,
      claim: freeSubscriptionClaim,
    });

    return {
      paymentRequired: false,
    };
  });
