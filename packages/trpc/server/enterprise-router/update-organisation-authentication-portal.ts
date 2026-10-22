import { IS_BILLING_ENABLED } from '@e-sign/lib/constants/app';
import { E_SIGN_ENCRYPTION_KEY } from '@e-sign/lib/constants/crypto';
import { ORGANISATION_MEMBER_ROLE_PERMISSIONS_MAP } from '@e-sign/lib/constants/organisations';
import { AppError, AppErrorCode } from '@e-sign/lib/errors/app-error';
import { symmetricEncrypt } from '@e-sign/lib/universal/crypto';
import { buildOrganisationWhereQuery } from '@e-sign/lib/utils/organisations';
import { prisma } from '@e-sign/prisma';

import { authenticatedProcedure } from '../trpc';
import {
  ZUpdateOrganisationAuthenticationPortalRequestSchema,
  ZUpdateOrganisationAuthenticationPortalResponseSchema,
} from './update-organisation-authentication-portal.types';

export const updateOrganisationAuthenticationPortalRoute = authenticatedProcedure
  .input(ZUpdateOrganisationAuthenticationPortalRequestSchema)
  .output(ZUpdateOrganisationAuthenticationPortalResponseSchema)
  .mutation(async (): Promise<never> => { throw new Error('External organisation sign-in is unavailable.'); });
