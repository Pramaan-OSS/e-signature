import { IS_BILLING_ENABLED } from '@e-sign/lib/constants/app';
import { ORGANISATION_MEMBER_ROLE_PERMISSIONS_MAP } from '@e-sign/lib/constants/organisations';
import { AppError, AppErrorCode } from '@e-sign/lib/errors/app-error';
import { buildBrandingLogoData } from '@e-sign/lib/server-only/branding/store-branding-logo';
import { getOrganisationClaim } from '@e-sign/lib/server-only/organisation/get-organisation-claims';
import { buildOrganisationWhereQuery } from '@e-sign/lib/utils/organisations';
import { prisma } from '@e-sign/prisma';

import { authenticatedProcedure } from '../trpc';
import {
  ZUpdateOrganisationBrandingLogoRequestSchema,
  ZUpdateOrganisationBrandingLogoResponseSchema,
} from './update-organisation-branding-logo.types';

export const updateOrganisationBrandingLogoRoute = authenticatedProcedure
  .input(ZUpdateOrganisationBrandingLogoRequestSchema)
  .output(ZUpdateOrganisationBrandingLogoResponseSchema)
  .mutation(async ({ ctx, input }) => {
    const { user } = ctx;
    const { payload, brandingLogo } = input;
    const { organisationId } = payload;

    ctx.logger.info({
      input: {
        organisationId,
      },
    });

    const organisation = await prisma.organisation.findFirst({
      where: buildOrganisationWhereQuery({
        organisationId,
        userId: user.id,
        roles: ORGANISATION_MEMBER_ROLE_PERMISSIONS_MAP['MANAGE_ORGANISATION'],
      }),
    });

    if (!organisation) {
      throw new AppError(AppErrorCode.UNAUTHORIZED, {
        message: 'You do not have permission to update this organisation.',
      });
    }

    // Setting a logo requires the custom-branding entitlement; clearing it is
    // always allowed so a downgraded organisation can still remove its logo.
    if (brandingLogo && IS_BILLING_ENABLED()) {
      const claim = await getOrganisationClaim({ organisationId });

      if (claim.flags?.allowCustomBranding !== true) {
        throw new AppError(AppErrorCode.UNAUTHORIZED, {
          message: 'Your plan does not allow custom branding.',
        });
      }
    }

    const brandingLogoValue = brandingLogo ? await buildBrandingLogoData(brandingLogo) : '';

    await prisma.organisation.update({
      where: {
        id: organisation.id,
      },
      data: {
        organisationGlobalSettings: {
          update: {
            brandingLogo: brandingLogoValue,
          },
        },
      },
    });
  });
