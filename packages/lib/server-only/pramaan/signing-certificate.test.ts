import { generateKeyPairSync } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { fakePramaan } from '../../../../scripts/testing/fake-pramaan';
import { signingCertificateFixture } from '../../../../scripts/testing/signing-certificate';
import { setPramaanClientForTests } from '../pramaan';
import { readSigningCertificate, validateSigningCertificate } from './signing-certificate';

afterEach(() => {
  setPramaanClientForTests(undefined);
  vi.unstubAllEnvs();
});
it('reads the selected account through the single client and returns checked public details', async () => {
  vi.stubEnv('PRAMAAN_SIGNING_ACCOUNT', 'owned-signing-account');
  const fake = fakePramaan();
  const call = vi.fn(fake.call);
  setPramaanClientForTests({ ...fake, call });
  const result = await readSigningCertificate();
  expect(result.status).toBe('ready');
  if (result.status !== 'ready') {
    throw new Error('Expected public certificate');
  }
  expect(result.certificate.chainLength).toBe(1);
  expect(result.certificate.fingerprint).toMatch(/^([A-F0-9]{2}:){31}[A-F0-9]{2}$/);
  expect(result.certificate.pem).toContain('BEGIN CERTIFICATE');
  expect(JSON.stringify(result)).not.toContain('owned-signing-account');
  expect(call).toHaveBeenCalledWith('signature.certificate.get', {}, { account: 'owned-signing-account' });
});
it.each([
  'unavailable',
  'refused',
  'mismatch',
] as const)('fake %s never returns usable certificate data', async (fault) => {
  vi.stubEnv('PRAMAAN_SIGNING_ACCOUNT', 'owned-signing-account');
  setPramaanClientForTests(fakePramaan({ certificateRead: fault }));
  const result = await readSigningCertificate();
  expect(result.status).toBe(fault === 'mismatch' ? 'failed' : fault);
  expect(result).not.toHaveProperty('certificate');
  if (fault === 'unavailable') {
    expect(result.message).toContain('not available yet');
  }
});
it('without a selected account makes no capability call', async () => {
  vi.stubEnv('PRAMAAN_SIGNING_ACCOUNT', '');
  const call = vi.fn();
  setPramaanClientForTests({ call } as never);
  expect((await readSigningCertificate()).status).toBe('unconfigured');
  expect(call).not.toHaveBeenCalled();
});
it('rejects malformed encodings, inconsistent leaf/chain and a mismatched public key', () => {
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 })
    .publicKey.export({ type: 'spki', format: 'der' })
    .toString('base64');
  for (const extra of [
    { certificateBase64: 'not-a-certificate' },
    { certificateChainBase64: [] },
    { certificateChainBase64: Array(9).fill(signingCertificateFixture.certificateBase64) },
    { certificateChainBase64: ['AAAA'] },
    { certificateBase64: `${signingCertificateFixture.certificateBase64}\n` },
    { publicKeySpkiBase64: other },
  ]) {
    expect(() => validateSigningCertificate({ ...signingCertificateFixture, ...extra })).toThrow();
  }
});
