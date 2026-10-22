/** Unsupported remote signing never falls back silently to a local signature. */
const unavailable = async (..._args: unknown[]): Promise<never> => { throw new Error('Remote certificate signing is unavailable. Use local signing or a hosted signing request.'); };
export const executeTspSign = unavailable;
export const finalizeTspEnvelopeCompletion = unavailable;
export const materializeTspAnchorsForEnvelope = unavailable;
export const prepareCscRecipientSigning = unavailable;
export const assertEmbedCscServiceSession = unavailable;
export const setCscBlockingErrorCookie = unavailable;
export const setCscSadSessionCookie = unavailable;
export const setCscServiceSessionCookie = unavailable;
export const readCscBlockingErrorFromRequest = async (_request: Request): Promise<{ recipientToken: string; code: string } | null> => null;
export const readCscSadSessionFromRequest = async (_request: Request): Promise<string | null> => null;
export const readCscServiceSessionFromRequest = async (_request: Request): Promise<string | null> => null;
export const expiredCscBlockingErrorCookieHeader = () => '';
