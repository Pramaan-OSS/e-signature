import {
  NEXT_PRIVATE_SIGNING_REASON,
  NEXT_PRIVATE_SIGNING_TRANSPORT,
  NEXT_PRIVATE_USE_LEGACY_SIGNING_SUBFILTER,
  NEXT_PUBLIC_SIGNING_CONTACT_INFO,
  NEXT_PUBLIC_WEBAPP_URL,
} from '@e-sign/lib/constants/app';
import type { SigningContext } from '@e-sign/lib/server-only/pramaan/pdf-evidence';
import { PDF, type Signer } from '@libpdf/core';
import { match } from 'ts-pattern';
import { getTimestampAuthority } from './helpers/tsa';
import { createLocalSigner } from './transports/local';
import { createPramaanSigner } from './transports/pramaan';

export type SignOptions = {
  pdf: PDF;
  context?: SigningContext;
};

let signer: Signer | null = null;

const getSigner = async (context?: SigningContext) => {
  const transport = NEXT_PRIVATE_SIGNING_TRANSPORT();
  if (transport === 'pramaan') {
    if (!context) {
      throw new Error('Remote signing requires a saved signing operation.');
    }
    return createPramaanSigner(context);
  }
  if (transport !== 'local') {
    throw new Error('Unsupported signing transport.');
  }
  if (signer) {
    return signer;
  }

  // eslint-disable-next-line require-atomic-updates
  signer = await match(transport)
    .with('local', async () => await createLocalSigner())
    .otherwise(() => {
      throw new Error(`Unsupported signing transport: ${transport}`);
    });

  return signer;
};

export const signPdf = async ({ pdf, context }: SignOptions) => {
  const signer = await getSigner(context);
  const tsa = getTimestampAuthority(context);

  const { bytes } = await pdf.sign({
    signer,
    reason: NEXT_PRIVATE_SIGNING_REASON(),
    location: NEXT_PUBLIC_WEBAPP_URL(),
    contactInfo: NEXT_PUBLIC_SIGNING_CONTACT_INFO(),
    subFilter: NEXT_PRIVATE_USE_LEGACY_SIGNING_SUBFILTER() ? 'adbe.pkcs7.detached' : 'ETSI.CAdES.detached',
  });

  if (!tsa) {
    return bytes;
  }
  // Add a document timestamp in a separate incremental revision after the PDF is signed.
  // No certificate fetching or revocation network path is enabled.
  const signedPdf = await PDF.load(bytes);
  const timestamped = await signedPdf.addTimestamp({
    timestampAuthority: tsa,
    digestAlgorithm: 'SHA-256',
    longTermValidation: false,
    estimatedSize: 65536,
  });
  return timestamped.bytes;
};
