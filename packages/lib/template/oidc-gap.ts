const unavailable = async (..._args: unknown[]): Promise<never> => { throw new Error('External organisation sign-in is unavailable. Use email sign-in.'); };
export const sendOrganisationAccountLinkConfirmationEmail = unavailable;
export const linkOrganisationAccount = unavailable;
