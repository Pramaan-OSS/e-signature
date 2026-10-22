import { AppError, AppErrorCode } from '@e-sign/lib/errors/app-error';
import { computeQuotaFlags } from '@e-sign/lib/server-only/rate-limit/compute-quota-flags';
import { currentMonthlyPeriod } from '@e-sign/lib/universal/monthly-period';
import { buildOrganisationWhereQuery } from '@e-sign/lib/utils/organisations';
import { prisma } from '@e-sign/prisma';
import { authenticatedProcedure } from '../trpc';
import {
  ZGetOrganisationQuotaFlagsRequestSchema,
  ZGetOrganisationQuotaFlagsResponseSchema,
} from './get-organisation-quota-flags.types';

export const getOrganisationQuotaFlagsRoute = authenticatedProcedure
  .input(ZGetOrganisationQuotaFlagsRequestSchema)
  .output(ZGetOrganisationQuotaFlagsResponseSchema)
  .query(async ({ input, ctx }) => {
    const { organisationId } = input;
    const userId = ctx.user.id;

    ctx.logger.info({
      input: {
        organisationId,
      },
    });

    // Any member of the organisation may view quota usage flags.
    const organisation = await prisma.organisation.findFirst({
      where: buildOrganisationWhereQuery({
        organisationId,
        userId,
      }),
      include: {
        organisationClaim: true,
        monthlyStats: {
          where: {
            period: currentMonthlyPeriod(),
          },
        },
      },
    });

    if (!organisation) {
      throw new AppError(AppErrorCode.NOT_FOUND, {
        message: 'Organisation not found',
      });
    }

    return computeQuotaFlags({
      quotas: {
        documentQuota: organisation.organisationClaim.documentQuota,
        emailQuota: organisation.organisationClaim.emailQuota,
        apiQuota: organisation.organisationClaim.apiQuota,
      },
      usage: organisation.monthlyStats[0] ?? undefined,
    });
  });
