import { execFileSync } from 'node:child_process';
import { createHash, X509Certificate } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PDF } from '@libpdf/core';
import { fromBER } from 'asn1js';
import { ContentInfo, SignedData, TSTInfo } from 'pkijs';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';

const rows = vi.hoisted(() => new Map<string, any>());
vi.mock('@e-sign/prisma', () => ({
  prisma: {
    capabilityOperation: {
      findUnique: vi.fn(async ({ where }: any) => rows.get(where.id)),
      create: vi.fn(async ({ data }: any) => {
        if (rows.has(data.id)) {
          throw new Error('Duplicate');
        }
        rows.set(data.id, data);
        return data;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const row = { ...rows.get(where.id), ...data };
        rows.set(where.id, row);
        return row;
      }),
    },
  },
}));

import { signPdf } from '@e-sign/signing';
import { setPramaanClientForTests } from '../pramaan';
import {
  createPramaanSigner,
  createPramaanTimestampAuthority,
  signingServiceSettings,
  verifyTimestampToken,
} from './pdf-evidence';

let dir: string, cert: X509Certificate, ec: X509Certificate, tsa: X509Certificate;
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest();
const context = { id: 'test_document', userId: 1, teamId: 2, envelopeId: 'test_envelope' };
let fault: string | undefined;
let token: Buffer, metadata: any;
const openssl = (args: string[]) => execFileSync('openssl', args, { cwd: dir, stdio: 'pipe' });
function timestamp(bytes: Buffer) {
  openssl(['ts', '-query', '-digest', bytes.toString('hex'), '-sha256', '-cert', '-out', 'query.tsq']);
  openssl(['ts', '-reply', '-config', 'tsa.cnf', '-queryfile', 'query.tsq', '-out', 'reply.tsr']);
  openssl(['ts', '-reply', '-in', 'reply.tsr', '-token_out', '-out', 'token.der']);
  token = readFileSync(join(dir, 'token.der'));
  const parsed = new SignedData({ schema: new ContentInfo({ schema: fromBER(token).result }).content });
  const info = TSTInfo.fromBER(parsed.encapContentInfo.eContent!.getValue());
  metadata = {
    file: {
      fileId: 'file_timestamp',
      url: 'https://platform.example.test/files/token',
      expiresAt: new Date(Date.now() + 604800000).toISOString(),
      contentType: 'application/timestamp-token',
      sizeBytes: token.length,
    },
    time: info.genTime.toISOString(),
    digest: { algorithm: 'sha256', value: bytes.toString('base64') },
    authority: { certificateSha256: sha(tsa.raw).toString('hex') },
  };
  return metadata;
}
const call = vi.fn(async (id: string, input: any, options: any) => {
  if (fault === 'off') {
    throw { code: 'upstream_unavailable', effect: 'none' };
  }
  if (fault === 'approval') {
    throw { code: 'forbidden', reason: 'approval_required', effect: 'none' };
  }
  if (fault === 'lost') {
    throw { code: 'upstream_error' };
  }
  if (id === 'signature.digest.sign') {
    // Sign the supplied digest once, without hashing it a second time.
    writeFileSync(join(dir, 'digest.bin'), Buffer.from(input.digest.value, 'base64'));
    openssl([
      'pkeyutl',
      '-sign',
      '-inkey',
      input.algorithm === 'ecdsa-sha256' ? 'ec.key' : 'signer.key',
      '-in',
      'digest.bin',
      '-pkeyopt',
      'digest:sha256',
      ...(input.algorithm === 'rsa-pss-sha256'
        ? ['-pkeyopt', 'rsa_padding_mode:pss', '-pkeyopt', 'rsa_pss_saltlen:32']
        : []),
      '-out',
      'signature.bin',
    ]);
    const signature = readFileSync(join(dir, 'signature.bin'));
    if (fault === 'signature') {
      signature[0] ^= 1;
    }
    return {
      signatureBase64: signature.toString('base64'),
      algorithm: input.algorithm,
      encoding: input.algorithm === 'ecdsa-sha256' ? 'der' : 'raw',
      publicKeySpkiBase64: (fault === 'key'
        ? tsa.publicKey
        : input.algorithm === 'ecdsa-sha256'
          ? ec.publicKey
          : cert.publicKey
      )
        .export({ type: 'spki', format: 'der' })
        .toString('base64'),
      certificateChainBase64: [(input.algorithm === 'ecdsa-sha256' ? ec : cert).raw.toString('base64')],
    };
  }
  if (id === 'signature.timestamp.create') {
    return timestamp(Buffer.from(input.digest.value, 'base64'));
  }
  throw new Error('Unexpected capability');
});
const download = vi.fn(async () => {
  const bytes = Buffer.from(token);
  if (fault === 'token') {
    bytes[bytes.length - 1] ^= 1;
  }
  return bytes;
});
beforeAll(() => {
  const base = resolve('../../verification');
  mkdirSync(base, { recursive: true });
  dir = mkdtempSync(join(base, 'synthetic-signing-'));
  openssl([
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    'signer.key',
    '-out',
    'signer.pem',
    '-days',
    '30',
    '-subj',
    '/CN=Synthetic PDF Signer',
    '-addext',
    'keyUsage=critical,digitalSignature',
  ]);
  cert = new X509Certificate(readFileSync(join(dir, 'signer.pem')));
  openssl([
    'req',
    '-x509',
    '-newkey',
    'ec',
    '-pkeyopt',
    'ec_paramgen_curve:prime256v1',
    '-nodes',
    '-keyout',
    'ec.key',
    '-out',
    'ec.pem',
    '-days',
    '30',
    '-subj',
    '/CN=Synthetic EC Signer',
    '-addext',
    'keyUsage=critical,digitalSignature',
  ]);
  ec = new X509Certificate(readFileSync(join(dir, 'ec.pem')));
  openssl([
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    'tsa.key',
    '-out',
    'tsa.pem',
    '-days',
    '30',
    '-subj',
    '/CN=Synthetic Timestamp',
    '-addext',
    'basicConstraints=critical,CA:FALSE',
    '-addext',
    'keyUsage=critical,digitalSignature',
    '-addext',
    'extendedKeyUsage=critical,timeStamping',
  ]);
  tsa = new X509Certificate(readFileSync(join(dir, 'tsa.pem')));
  writeFileSync(join(dir, 'serial'), '01\n');
  writeFileSync(
    join(dir, 'tsa.cnf'),
    '[tsa]\ndefault_tsa=authority\n[authority]\nserial=serial\nsigner_cert=tsa.pem\nsigner_key=tsa.key\nsigner_digest=sha256\ndefault_policy=1.2.3.4.1\ndigests=sha256\naccuracy=secs:1\nordering=no\ntsa_name=no\ness_cert_id_chain=no\ness_cert_id_alg=sha256\n',
  );
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));
beforeEach(() => {
  rows.clear();
  call.mockClear();
  download.mockClear();
  fault = undefined;
  vi.stubEnv('PRAMAAN_API_KEY', 'test-only');
  vi.stubEnv('NEXT_PRIVATE_SIGNING_TRANSPORT', 'pramaan');
  vi.stubEnv('PRAMAAN_SIGNING_TIMESTAMP', 'false');
  vi.stubEnv('PRAMAAN_SIGNING_ACCOUNT', 'conn_test_signer');
  vi.stubEnv('PRAMAAN_SIGNING_CERTIFICATE_CHAIN', cert.raw.toString('base64'));
  vi.stubEnv('PRAMAAN_SIGNING_ALGORITHM', 'rsa-pkcs1-sha256');
  setPramaanClientForTests({ call, files: { download } } as never);
});
afterEach(() => {
  setPramaanClientForTests(undefined);
  vi.unstubAllEnvs();
});
function ranges(bytes: Uint8Array) {
  const b = Buffer.from(bytes);
  const text = b.toString('latin1');
  return [...text.matchAll(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g)].map((m) => {
    const [a, n, c, k] = m.slice(1).map(Number);
    const encoded = b.subarray(a + n + 1, c - 1).toString('ascii');
    const cms = Buffer.from(encoded, 'hex');
    const parsed = fromBER(cms);
    const token = cms.subarray(0, parsed.offset);
    return { data: Buffer.concat([b.subarray(a, a + n), b.subarray(c, c + k)]), token };
  });
}
it('builds a remotely signed PDF and verifies its CMS signature against the byte ranges', async () => {
  const pdf = PDF.create();
  pdf.addPage();
  const bytes = await signPdf({ pdf, context });
  const records = ranges(bytes);
  expect(records).toHaveLength(1);
  const cms = new SignedData({ schema: new ContentInfo({ schema: fromBER(records[0].token).result }).content });
  expect(
    await cms.verify({
      signer: 0,
      data: records[0].data.buffer.slice(
        records[0].data.byteOffset,
        records[0].data.byteOffset + records[0].data.byteLength,
      ),
      checkChain: false,
    }),
  ).toBe(true);
  expect(call).toHaveBeenCalledTimes(1);
  expect(call.mock.calls[0][1].digest.value).toHaveLength(44);
  expect(call.mock.calls[0][2].account).toBe('conn_test_signer');
  expect(JSON.stringify(call.mock.calls[0][1])).not.toContain('%PDF');
});
it('appends a valid document timestamp without invalidating the earlier PDF signature', async () => {
  vi.stubEnv('PRAMAAN_SIGNING_TIMESTAMP', 'true');
  const pdf = PDF.create();
  pdf.addPage();
  const bytes = await signPdf({ pdf, context });
  const records = ranges(bytes);
  expect(records).toHaveLength(2);
  const cms = new SignedData({ schema: new ContentInfo({ schema: fromBER(records[0].token).result }).content });
  expect(await cms.verify({ signer: 0, data: Uint8Array.from(records[0].data).buffer, checkChain: false })).toBe(true);
  verifyTimestampToken(records[1].token, sha(records[1].data), metadata);
  writeFileSync(join(dir, 'verify-token.der'), records[1].token);
  writeFileSync(join(dir, 'verify-data.bin'), records[1].data);
  expect(() =>
    openssl([
      'ts',
      '-verify',
      '-token_in',
      '-in',
      'verify-token.der',
      '-data',
      'verify-data.bin',
      '-CAfile',
      'tsa.pem',
    ]),
  ).not.toThrow();
  expect(Buffer.from(bytes).toString('latin1')).toContain('/DocTimeStamp');
  expect(call.mock.calls.map((c) => c[0])).toEqual(['signature.digest.sign', 'signature.timestamp.create']);
  expect(download).toHaveBeenCalledOnce();
});
it('keeps local signing as the default with both optional settings off', () => {
  vi.stubEnv('NEXT_PRIVATE_SIGNING_TRANSPORT', '');
  expect(signingServiceSettings()).toMatchObject({ remote: false, timestamp: false, notLive: true });
  expect(call).not.toHaveBeenCalled();
});
it('refuses a requested remote signature without a key or matching configured certificate', async () => {
  vi.stubEnv('PRAMAAN_API_KEY', '');
  expect(() => createPramaanSigner(context)).toThrow('not available yet');
  vi.stubEnv('PRAMAAN_API_KEY', 'test-only');
  vi.stubEnv('PRAMAAN_SIGNING_ALGORITHM', 'ecdsa-sha256');
  expect(() => createPramaanSigner(context)).toThrow('does not match');
  expect(call).not.toHaveBeenCalled();
});
it.each(['off', 'approval', 'lost'])('does not resend or fall back after %s', async (mode) => {
  fault = mode;
  const signer = createPramaanSigner(context);
  const data = new Uint8Array([1, 2, 3]);
  await expect(signer.sign(data, 'SHA-256')).rejects.toThrow(
    mode === 'approval' ? 'approver' : mode === 'off' ? 'not available yet' : 'Check before retrying',
  );
  await expect(signer.sign(data, 'SHA-256')).rejects.toThrow();
  expect(call).toHaveBeenCalledTimes(1);
});
it.each(['signature', 'key'])('refuses a returned %s mismatch instead of publishing a PDF', async (mode) => {
  fault = mode;
  await expect(createPramaanSigner(context).sign(new Uint8Array([1, 2, 3]), 'SHA-256')).rejects.toThrow(
    'cannot be confirmed',
  );
});
it('reuses only an identical completed signing result and blocks a changed digest', async () => {
  const signer = createPramaanSigner(context);
  const data = new Uint8Array([1, 2, 3]);
  expect(await signer.sign(data, 'SHA-256')).toEqual(await signer.sign(data, 'SHA-256'));
  await expect(signer.sign(new Uint8Array([4]), 'SHA-256')).rejects.toThrow('Check before retrying');
  await expect(
    createPramaanSigner({ ...context, envelopeId: 'another_envelope' }).sign(data, 'SHA-256'),
  ).rejects.toThrow('Check before retrying');
  expect(call).toHaveBeenCalledTimes(1);
});
it('refuses corrupted timestamp bytes, wrong digest and fingerprint', async () => {
  const bytes = sha(new Uint8Array([1, 2]));
  const result = timestamp(bytes);
  verifyTimestampToken(token, bytes, result);
  expect(() => verifyTimestampToken(token, sha(new Uint8Array([3])), result)).toThrow();
  expect(() =>
    verifyTimestampToken(token, bytes, { ...result, authority: { certificateSha256: '0'.repeat(64) } }),
  ).toThrow();
  fault = 'token';
  await expect(createPramaanTimestampAuthority(context).timestamp(bytes, 'SHA-256')).rejects.toThrow(
    'cannot be confirmed',
  );
});
it('keeps a refused timestamp off and stops before another automatic request', async () => {
  fault = 'off';
  const tsa = createPramaanTimestampAuthority(context);
  const bytes = sha(new Uint8Array([1]));
  await expect(tsa.timestamp(bytes, 'SHA-256')).rejects.toThrow('not available yet');
  await expect(tsa.timestamp(bytes, 'SHA-256')).rejects.toThrow();
  expect(call).toHaveBeenCalledOnce();
  expect(download).not.toHaveBeenCalled();
});

it('local certificate sealing works without a key and a later requested remote refusal never uses the cached local signer', async () => {
  openssl([
    'pkcs12',
    '-export',
    '-inkey',
    'signer.key',
    '-in',
    'signer.pem',
    '-out',
    'signer.p12',
    '-passout',
    'pass:',
  ]);
  vi.stubEnv('NEXT_PRIVATE_SIGNING_TRANSPORT', 'local');
  vi.stubEnv('PRAMAAN_API_KEY', '');
  vi.stubEnv('NEXT_PRIVATE_SIGNING_LOCAL_FILE_CONTENTS', readFileSync(join(dir, 'signer.p12')).toString('base64'));
  vi.stubEnv('NEXT_PRIVATE_SIGNING_PASSPHRASE', '');
  const pdf = PDF.create();
  pdf.addPage();
  const local = await signPdf({ pdf });
  expect(ranges(local)).toHaveLength(1);
  expect(call).not.toHaveBeenCalled();
  vi.stubEnv('NEXT_PRIVATE_SIGNING_TRANSPORT', 'pramaan');
  vi.stubEnv('PRAMAAN_API_KEY', 'test-only');
  fault = 'off';
  const requested = PDF.create();
  requested.addPage();
  await expect(signPdf({ pdf: requested, context })).rejects.toThrow('not available yet');
  expect(call).toHaveBeenCalledOnce();
});

it.each(['ecdsa-sha256'])('builds a valid PDF with the %s remote algorithm', async (algorithm) => {
  vi.stubEnv('PRAMAAN_SIGNING_ALGORITHM', algorithm);
  if (algorithm === 'ecdsa-sha256') {
    vi.stubEnv('PRAMAAN_SIGNING_CERTIFICATE_CHAIN', ec.raw.toString('base64'));
  }
  const pdf = PDF.create();
  pdf.addPage();
  const bytes = await signPdf({ pdf, context });
  const record = ranges(bytes)[0];
  const cms = new SignedData({ schema: new ContentInfo({ schema: fromBER(record.token).result }).content });
  expect(await cms.verify({ signer: 0, data: Uint8Array.from(record.data).buffer, checkChain: false })).toBe(true);
});

it('refuses RSA-PSS before a call because the PDF encoder cannot represent its parameters correctly', () => {
  vi.stubEnv('PRAMAAN_SIGNING_ALGORITHM', 'rsa-pss-sha256');
  expect(() => createPramaanSigner(context)).toThrow('RSA-PSS PDF sealing is unavailable');
  expect(call).not.toHaveBeenCalled();
});
