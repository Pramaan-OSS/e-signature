import { env } from '../utils/env';

export const MANAGED_EMAIL_DOMAIN = 'updates.pramaan.one';
export const MANAGED_EMAIL_ADDRESS = `noreply@${MANAGED_EMAIL_DOMAIN}`;
export const MANAGED_EMAIL_FROM = `e-sign <${MANAGED_EMAIL_ADDRESS}>`;

export const FROM_ADDRESS = env('NEXT_PRIVATE_SMTP_FROM_ADDRESS') || MANAGED_EMAIL_ADDRESS;
export const FROM_NAME = env('NEXT_PRIVATE_SMTP_FROM_NAME') || 'e-sign';

export const E_SIGN_INTERNAL_EMAIL = {
  name: FROM_NAME,
  address: FROM_ADDRESS,
};

export const EMAIL_VERIFICATION_STATE = {
  NOT_FOUND: 'NOT_FOUND',
  VERIFIED: 'VERIFIED',
  EXPIRED: 'EXPIRED',
  ALREADY_VERIFIED: 'ALREADY_VERIFIED',
} as const;

export const USER_SIGNUP_VERIFICATION_TOKEN_IDENTIFIER = 'confirmation-email';
