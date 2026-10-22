import { AppError, AppErrorCode } from '@e-sign/lib/errors/app-error';
import { disableUser } from '@e-sign/lib/server-only/user/disable-user';
import { getUserById } from '@e-sign/lib/server-only/user/get-user-by-id';

import { adminProcedure } from '../trpc';
import { ZDisableUserRequestSchema, ZDisableUserResponseSchema } from './disable-user.types';

export const disableUserRoute = adminProcedure
  .input(ZDisableUserRequestSchema)
  .output(ZDisableUserResponseSchema)
  .mutation(async ({ input, ctx }) => {
    const { id } = input;

    ctx.logger.info({
      input: {
        id,
      },
    });

    const user = await getUserById({ id }).catch(() => null);

    if (!user) {
      throw new AppError(AppErrorCode.NOT_FOUND, {
        message: 'User not found',
      });
    }

    await disableUser({ id });
  });
