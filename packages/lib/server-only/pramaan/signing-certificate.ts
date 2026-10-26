import { createPublicKey, X509Certificate } from 'node:crypto';
import { readConnectedSigningCertificate } from '../pramaan';

export type PublicSigningCertificate = {
  fingerprint: string;
  validFrom: string;
  validTo: string;
  withinValidityPeriod: boolean;
  chainLength: number;
  pem: string;
};
export type CertificateRead =
  | { status: 'ready'; certificate: PublicSigningCertificate; message: string }
  | { status: 'unavailable' | 'refused' | 'failed' | 'unconfigured'; message: string };
const invalid = () => new Error('The public certificate could not be confirmed.');
function decode(value: unknown, limit: number) {
  if (typeof value !== 'string' || value.length < 4 || value.length > limit) {
    throw invalid();
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value) {
    throw invalid();
  }
  return bytes;
}
export function validateSigningCertificate(value: unknown): PublicSigningCertificate {
  if (!value || typeof value !== 'object') {
    throw invalid();
  }
  const result = value as Record<string, unknown>;
  const leafBytes = decode(result.certificateBase64, 32768);
  const chain = result.certificateChainBase64;
  if (!Array.isArray(chain) || !chain.length || chain.length > 8) {
    throw invalid();
  }
  const certificates = chain.map((item) => {
    const bytes = decode(item, 32768);
    const certificate = new X509Certificate(bytes);
    if (!certificate.raw.equals(bytes)) {
      throw invalid();
    }
    return certificate;
  });
  const leaf = certificates[0];
  if (!leaf.raw.equals(leafBytes)) {
    throw invalid();
  }
  const spki = decode(result.publicKeySpkiBase64, 16384);
  const publicKey = createPublicKey({ key: spki, type: 'spki', format: 'der' });
  if (
    !publicKey.export({ type: 'spki', format: 'der' }).equals(spki) ||
    !leaf.publicKey.export({ type: 'spki', format: 'der' }).equals(spki)
  ) {
    throw invalid();
  }
  for (let index = 0; index + 1 < certificates.length; index++) {
    if (
      !certificates[index].checkIssued(certificates[index + 1]) ||
      !certificates[index].verify(certificates[index + 1].publicKey)
    ) {
      throw invalid();
    }
  }
  const now = Date.now();
  return {
    fingerprint: leaf.fingerprint256,
    validFrom: new Date(leaf.validFrom).toISOString(),
    validTo: new Date(leaf.validTo).toISOString(),
    withinValidityPeriod: certificates.every(
      (cert) => Date.parse(cert.validFrom) <= now && now <= Date.parse(cert.validTo),
    ),
    chainLength: certificates.length,
    pem: certificates.map((cert) => cert.toString()).join('\n'),
  };
}
export async function readSigningCertificate(): Promise<CertificateRead> {
  const account = process.env.PRAMAAN_SIGNING_ACCOUNT;
  if (!account) {
    return { status: 'unconfigured', message: 'Configure the selected signing connection first.' };
  }
  try {
    const certificate = validateSigningCertificate(await readConnectedSigningCertificate(account));
    return {
      status: 'ready',
      certificate,
      message: 'Public certificate read. Trust and revocation have not been checked.',
    };
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    if (['not_found', 'upstream_unavailable', 'unavailable'].includes(code)) {
      return { status: 'unavailable', message: 'This feature is not available yet.' };
    }
    if (['forbidden', 'unauthorized', 'invalid_request', 'connection_required'].includes(code)) {
      return { status: 'refused', message: 'The certificate read was refused. Check the selected signing connection.' };
    }
    return {
      status: 'failed',
      message: 'The public certificate could not be confirmed. Check the connection before trying again.',
    };
  }
}
