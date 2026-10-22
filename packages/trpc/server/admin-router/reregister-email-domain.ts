import { reregisterEmailDomain } from '@e-sign/lib/server-only/pramaan/email-domains';

import { adminProcedure } from '../trpc';
import {
  ZReregisterEmailDomainRequestSchema,
  ZReregisterEmailDomainResponseSchema,
} from './reregister-email-domain.types';

export const reregisterEmailDomainRoute = adminProcedure
  .input(ZReregisterEmailDomainRequestSchema)
  .output(ZReregisterEmailDomainResponseSchema)
  .mutation(async ({ input, ctx }) => {
    const { emailDomainId } = input;

    ctx.logger.info({
      input: {
        emailDomainId,
      },
    });

    await reregisterEmailDomain({ emailDomainId });
  });
