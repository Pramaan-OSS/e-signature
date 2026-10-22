import { prisma } from '@e-sign/prisma';

import { adminProcedure } from '../../trpc';
import {
  ZDeleteEmailTransportRequestSchema,
  ZDeleteEmailTransportResponseSchema,
} from './delete-email-transport.types';

export const deleteEmailTransportRoute = adminProcedure
  .input(ZDeleteEmailTransportRequestSchema)
  .output(ZDeleteEmailTransportResponseSchema)
  .mutation(async ({ input, ctx }) => {
    ctx.logger.info({
      input: {
        id: input.id,
      },
    });

    await prisma.emailTransport.delete({
      where: {
        id: input.id,
      },
    });
  });
