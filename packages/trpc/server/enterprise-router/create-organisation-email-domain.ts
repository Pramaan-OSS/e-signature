import { createEmailDomain } from '@e-sign/lib/server-only/pramaan/email-domains';
import { pramaanConfigured } from '@e-sign/lib/server-only/pramaan';
import { ORGANISATION_MEMBER_ROLE_PERMISSIONS_MAP } from '@e-sign/lib/constants/organisations';
import { AppError, AppErrorCode } from '@e-sign/lib/errors/app-error';
import { buildOrganisationWhereQuery } from '@e-sign/lib/utils/organisations';
import { prisma } from '@e-sign/prisma';

import { authenticatedProcedure } from '../trpc';
import {
  ZCreateOrganisationEmailDomainRequestSchema,
  ZCreateOrganisationEmailDomainResponseSchema,
} from './create-organisation-email-domain.types';

export const createOrganisationEmailDomainRoute = authenticatedProcedure
  .input(ZCreateOrganisationEmailDomainRequestSchema)
  .output(ZCreateOrganisationEmailDomainResponseSchema)
  .mutation(async ({ input, ctx }) => {
    const { organisationId, domain } = input;
    const { user } = ctx;

    ctx.logger.info({
      input: {
        organisationId,
        domain,
      },
    });

    if (!pramaanConfigured()) {
      throw new AppError(AppErrorCode.INVALID_REQUEST, {
        message: 'Add the workspace connection key to enable this action.',
      });
    }

    const organisation = await prisma.organisation.findFirst({
      where: buildOrganisationWhereQuery({
        organisationId,
        userId: user.id,
        roles: ORGANISATION_MEMBER_ROLE_PERMISSIONS_MAP['MANAGE_ORGANISATION'],
      }),
      include: {
        emailDomains: true,
        organisationClaim: true,
      },
    });

    if (!organisation) {
      throw new AppError(AppErrorCode.UNAUTHORIZED);
    }


    if (organisation.emailDomains.length >= 100) {
      throw new AppError(AppErrorCode.INVALID_BODY, {
        message: 'You have reached the maximum number of email domains',
      });
    }

    return await createEmailDomain({
      domain,
      organisationId,
    });
  });
