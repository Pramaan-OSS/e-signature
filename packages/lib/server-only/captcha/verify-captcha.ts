import { AppError, AppErrorCode } from '../../errors/app-error';
import { callPramaan } from '../pramaan';
/** Off by default until a hosted challenge is available. Server verification is ready. */
export const verifyCaptchaToken = async ({ token, ipAddress }: { token?: string | null; ipAddress?: string | null }) => {
  if (process.env.PRAMAAN_CAPTCHA_ENABLED !== 'true') { return; }
  if (!token) { throw new AppError(AppErrorCode.INVALID_CAPTCHA, { message: 'A verification challenge is required.', statusCode: 400 }); }
  const result = await callPramaan('auth.bot-check.verify', { token, remoteIp: ipAddress || undefined });
  if (!result.passed) { throw new AppError(AppErrorCode.INVALID_CAPTCHA, { message: 'Verification did not pass.', statusCode: 400 }); }
};
