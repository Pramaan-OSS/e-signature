import { createPramaanTimestampAuthority, type SigningContext } from '@e-sign/lib/server-only/pramaan/pdf-evidence';
export const getTimestampAuthority = (context?: SigningContext) => {
  if (process.env.PRAMAAN_SIGNING_TIMESTAMP !== 'true') {
    return null;
  }
  if (!context) {
    throw new Error('Trusted timestamping requires a saved signing operation.');
  }
  return createPramaanTimestampAuthority(context);
};
