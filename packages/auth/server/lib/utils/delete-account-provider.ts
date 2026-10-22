import { ORGANISATION_USER_ACCOUNT_TYPE } from '@e-sign/lib/constants/organisations';
import { AppError, AppErrorCode } from '@e-sign/lib/errors/app-error';
import { prisma } from '@e-sign/prisma';
import { UserSecurityAuditLogType } from '@prisma/client';
import type { Context } from 'hono';

import { getSession } from './get-session';

export const deleteAccountProvider = async (c: Context, accountId: string): Promise<void> => {
  const { user } = await getSession(c);

  const requestMeta = c.get('requestMetadata');

  await prisma.$transaction(
    async (tx) => {
      const profile = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { password: true, _count: { select: { passkeys: true } } },
      });
      const remaining = await tx.account.count({ where: { userId: user.id, id: { not: accountId } } });
      if (!remaining && !profile.password && !profile._count.passkeys) {
        throw new AppError(AppErrorCode.INVALID_REQUEST, {
          message: 'Add another sign-in method before unlinking your only account.',
          statusCode: 400,
        });
      }
      const deletedAccountProvider = await tx.account.delete({
        where: {
          id: accountId,
          userId: user.id,
        },
        select: {
          type: true,
        },
      });

      await tx.userSecurityAuditLog.create({
        data: {
          userId: user.id,
          ipAddress: requestMeta.ipAddress,
          userAgent: requestMeta.userAgent,
          type:
            deletedAccountProvider.type === ORGANISATION_USER_ACCOUNT_TYPE
              ? UserSecurityAuditLogType.ORGANISATION_SSO_UNLINK
              : UserSecurityAuditLogType.ACCOUNT_SSO_UNLINK,
        },
      });
    },
    { isolationLevel: 'Serializable' },
  );
};
