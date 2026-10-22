import { getInternalClaimPlans } from '@e-sign/lib/template/removed-billing';
import { IS_BILLING_ENABLED } from '@e-sign/lib/constants/app';
import { prisma } from '@e-sign/prisma';

import { authenticatedProcedure } from '../trpc';

export const getPlansRoute = authenticatedProcedure.query(async ({ ctx }) => {
  const userId = ctx.user.id;

  const plans = await getInternalClaimPlans();

  let canCreateFreeOrganisation = false;

  if (IS_BILLING_ENABLED()) {
    const numberOfFreeOrganisations = await prisma.organisation.count({
      where: {
        ownerUserId: userId,
        subscription: {
          is: null,
        },
      },
    });

    canCreateFreeOrganisation = numberOfFreeOrganisations === 0;
  }

  return {
    plans,
    canCreateFreeOrganisation,
  };
});
