import { AppError, AppErrorCode } from '../../errors/app-error';
export const submitSupportTicket = async (_options: unknown): Promise<never> => { throw new AppError(AppErrorCode.NOT_SETUP, { message: 'Contact your workspace owner for help.' }); };
