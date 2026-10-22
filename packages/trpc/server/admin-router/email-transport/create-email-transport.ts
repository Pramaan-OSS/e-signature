import { encryptEmailTransportConfig } from '@e-sign/lib/server-only/email/email-transport-config';
import { generateDatabaseId } from '@e-sign/lib/universal/id';
import { prisma } from '@e-sign/prisma';

import { adminProcedure } from '../../trpc';
import {
  ZCreateEmailTransportRequestSchema,
  ZCreateEmailTransportResponseSchema,
} from './create-email-transport.types';

export const createEmailTransportRoute = adminProcedure
  .input(ZCreateEmailTransportRequestSchema)
  .output(ZCreateEmailTransportResponseSchema)
  .mutation(async ({ input }) => {
    const { name, fromName, fromAddress, config } = input;

    const transport = await prisma.emailTransport.create({
      data: {
        id: generateDatabaseId('email_transport'),
        name,
        type: config.type,
        fromName,
        fromAddress,
        config: encryptEmailTransportConfig(config),
      },
      select: { id: true },
    });

    return {
      id: transport.id,
    };
  });
