import type { User } from '@prisma/client';

import { E_SIGN_ENCRYPTION_KEY } from '../../constants/crypto';

type IsTwoFactorAuthenticationEnabledOptions = {
  user: User;
};

export const isTwoFactorAuthenticationEnabled = ({ user }: IsTwoFactorAuthenticationEnabledOptions) => {
  return user.twoFactorEnabled && typeof E_SIGN_ENCRYPTION_KEY === 'string';
};
