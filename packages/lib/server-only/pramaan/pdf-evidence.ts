import { constants, createHash, createPublicKey, verify, X509Certificate } from 'node:crypto';
import { prisma } from '@e-sign/prisma';
import type { Signer, TimestampAuthority } from '@libpdf/core';
import type { CapabilityId, Requests, Results } from '@pramaan/sdk';
import { fromBER } from 'asn1js';
import { Certificate, ContentInfo, IssuerAndSerialNumber, SignedData, TSTInfo } from 'pkijs';
import { callPramaan, downloadPramaanFile, pramaanConfigured } from '../pramaan';

export type SigningContext = { id: string; userId: number; teamId: number; envelopeId: string };
const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest();
const digest = (bytes: Uint8Array) => ({ algorithm: 'sha256' as const, value: Buffer.from(bytes).toString('base64') });
const unavailable = () =>
  new Error(
    'The requested signing service is not available yet. Local signing was not used instead. Check before retrying; it will not be sent again automatically.',
  );
const check = () =>
  new Error(
    'The requested signing result cannot be confirmed. Check before retrying; it will not be sent again automatically.',
  );
const approval = () =>
  new Error(
    'Remote signing requires an approver. Unattended sealing cannot provide that approval; nothing is retried automatically.',
  );
function decode(value: string, max: number) {
  const bytes = Buffer.from(value, 'base64');
  if (!bytes.length || bytes.length > max || bytes.toString('base64') !== value) {
    throw check();
  }
  return bytes;
}

// Own durable record prevents a queue retry from issuing another irreversible signature.
// Completed results are usable only for the identical digest, certificate and selected account.
async function once<Id extends CapabilityId>(id: Id, input: Requests[Id], context: SigningContext, account?: string) {
  const operationId = `pdf-evidence:${context.id}:${id}`;
  const inputHash = sha(JSON.stringify({ input, account })).toString('hex');
  const prior = await prisma.capabilityOperation.findUnique({ where: { id: operationId } });
  if (prior) {
    if (
      prior.inputHash !== inputHash ||
      prior.userId !== context.userId ||
      prior.teamId !== context.teamId ||
      prior.envelopeId !== context.envelopeId
    ) {
      throw check();
    }
    if (prior.state === 'done' && prior.result) {
      return prior.result as unknown as Results[Id];
    }
    throw new Error(prior.error || check().message);
  }
  try {
    await prisma.capabilityOperation.create({
      data: {
        id: operationId,
        userId: context.userId,
        teamId: context.teamId,
        envelopeId: context.envelopeId,
        action: id,
        inputHash,
        state: 'working',
      },
    });
  } catch {
    throw check();
  }
  try {
    const result = await callPramaan(id, input, { idempotencyKey: operationId, ...(account ? { account } : {}) });
    await prisma.capabilityOperation.update({
      where: { id: operationId },
      data: { state: 'done', result: JSON.parse(JSON.stringify(result)) },
    });
    return result;
  } catch (error) {
    const e = error as { reason?: string; code?: string; effect?: string };
    const message =
      e.reason === 'approval_required'
        ? approval().message
        : ['upstream_unavailable', 'unavailable', 'not_found'].includes(e.code || '')
          ? unavailable().message
          : check().message;
    await prisma.capabilityOperation.update({
      where: { id: operationId },
      data: { state: e.effect === 'none' ? 'failed' : 'unknown', error: message },
    });
    throw new Error(message);
  }
}
export function signingServiceSettings() {
  return {
    remote: process.env.NEXT_PRIVATE_SIGNING_TRANSPORT === 'pramaan',
    timestamp: process.env.PRAMAAN_SIGNING_TIMESTAMP === 'true',
    keyConfigured: pramaanConfigured(),
    notLive: true,
    message:
      'Remote key signing and trusted timestamps are not available yet: switched off on the platform and not yet live-verified. A member-bound key may require an approver; unattended sealing stops rather than supplying approval. Requested remote signing never falls back to a local certificate.',
  };
}
export function createPramaanSigner(context: SigningContext): Signer {
  if (!pramaanConfigured()) {
    throw unavailable();
  }
  const account = process.env.PRAMAAN_SIGNING_ACCOUNT;
  const chain = (process.env.PRAMAAN_SIGNING_CERTIFICATE_CHAIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!account || !chain.length || chain.length > 8) {
    throw new Error('Configure the selected signing account and its public certificate chain first.');
  }
  const certificates = chain.map((value) => new X509Certificate(decode(value, 24576)));
  const leaf = certificates[0];
  const now = Date.now();
  if (certificates.some((c) => now < Date.parse(c.validFrom) || now > Date.parse(c.validTo))) {
    throw new Error('The configured signing certificate is outside its validity period.');
  }
  for (let i = 0; i + 1 < certificates.length; i++) {
    if (!certificates[i].verify(certificates[i + 1].publicKey)) {
      throw new Error('The configured signing certificate chain is invalid.');
    }
  }
  const key = leaf.publicKey;
  const algorithm = process.env.PRAMAAN_SIGNING_ALGORITHM || 'rsa-pkcs1-sha256';
  if (algorithm === 'rsa-pss-sha256') {
    throw new Error(
      'RSA-PSS PDF sealing is unavailable: the PDF library does not encode its signature parameters correctly. Select a compatible key and algorithm explicitly.',
    );
  }
  if (!['rsa-pkcs1-sha256', 'ecdsa-sha256'].includes(algorithm)) {
    throw new Error('Unsupported remote signing algorithm.');
  }
  if (
    algorithm === 'ecdsa-sha256'
      ? key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1'
      : key.asymmetricKeyType !== 'rsa' || ![2048, 3072, 4096].includes(key.asymmetricKeyDetails?.modulusLength || 0)
  ) {
    throw new Error('The configured public certificate does not match the signing algorithm.');
  }
  const spki = key.export({ type: 'spki', format: 'der' });
  return {
    certificate: leaf.raw,
    certificateChain: certificates.slice(1).map((c) => c.raw),
    keyType: algorithm === 'ecdsa-sha256' ? 'EC' : 'RSA',
    signatureAlgorithm:
      algorithm === 'ecdsa-sha256' ? 'ECDSA' : algorithm === 'rsa-pss-sha256' ? 'RSA-PSS' : 'RSASSA-PKCS1-v1_5',
    async sign(data, hashAlgorithm) {
      if (hashAlgorithm !== 'SHA-256') {
        throw new Error('Remote signing supports SHA-256 only.');
      }
      const result = await once(
        'signature.digest.sign',
        { digest: digest(sha(data)), algorithm: algorithm as Requests['signature.digest.sign']['algorithm'] },
        context,
        account,
      );
      const signature = decode(result.signatureBase64, 6144);
      const resultKey = createPublicKey({
        key: decode(result.publicKeySpkiBase64, 12288),
        type: 'spki',
        format: 'der',
      }).export({ type: 'spki', format: 'der' });
      if (
        !spki.equals(resultKey) ||
        result.algorithm !== algorithm ||
        result.encoding !== (algorithm === 'ecdsa-sha256' ? 'der' : 'raw')
      ) {
        throw check();
      }
      if (
        result.certificateChainBase64 &&
        !new X509Certificate(decode(result.certificateChainBase64[0], 24576)).raw.equals(leaf.raw)
      ) {
        throw check();
      }
      if (
        !verify(
          'sha256',
          data,
          {
            key,
            ...(algorithm === 'rsa-pss-sha256' ? { padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 } : {}),
          },
          signature,
        )
      ) {
        throw check();
      }
      return signature;
    },
  };
}

// Validate the token's signature and binding independently of its returned metadata.
// Platform validation supplies the pinned authority chain; revocation is not asserted here.
export function verifyTimestampToken(
  token: Uint8Array,
  expectedDigest: Uint8Array,
  result: Results['signature.timestamp.create'],
) {
  try {
    if (token.length > 65536 || token.length !== result.file.sizeBytes || expectedDigest.length !== 32) {
      throw check();
    }
    const parsed = fromBER(token);
    if (parsed.offset !== token.length) {
      throw check();
    }
    const content = new ContentInfo({ schema: parsed.result });
    if (content.contentType !== '1.2.840.113549.1.7.2') {
      throw check();
    }
    const signed = new SignedData({ schema: content.content });
    if (
      signed.encapContentInfo.eContentType !== '1.2.840.113549.1.9.16.1.4' ||
      signed.signerInfos.length !== 1 ||
      !signed.encapContentInfo.eContent
    ) {
      throw check();
    }
    const bytes = signed.encapContentInfo.eContent.getValue();
    const info = TSTInfo.fromBER(bytes);
    if (
      info.messageImprint.hashAlgorithm.algorithmId !== '2.16.840.1.101.3.4.2.1' ||
      !Buffer.from(info.messageImprint.hashedMessage.valueBlock.valueHexView).equals(Buffer.from(expectedDigest))
    ) {
      throw check();
    }
    if (
      result.digest.algorithm !== 'sha256' ||
      result.digest.value !== Buffer.from(expectedDigest).toString('base64') ||
      info.genTime.toISOString() !== new Date(result.time).toISOString()
    ) {
      throw check();
    }
    const signer = signed.signerInfos[0];
    if (
      !(signer.sid instanceof IssuerAndSerialNumber) ||
      signer.digestAlgorithm.algorithmId !== '2.16.840.1.101.3.4.2.1' ||
      !signer.signedAttrs
    ) {
      throw check();
    }
    const cert = signed.certificates?.find(
      (c) =>
        c instanceof Certificate &&
        c.issuer.isEqual(signer.sid.issuer) &&
        c.serialNumber.isEqual(signer.sid.serialNumber),
    );
    if (!(cert instanceof Certificate)) {
      throw check();
    }
    const x509 = new X509Certificate(Buffer.from(cert.toSchema().toBER(false)));
    if (
      sha(x509.raw).toString('hex') !== result.authority.certificateSha256 ||
      info.genTime < new Date(x509.validFrom) ||
      info.genTime > new Date(x509.validTo) ||
      x509.keyUsage?.length !== 1 ||
      x509.keyUsage[0] !== '1.3.6.1.5.5.7.3.8'
    ) {
      throw check();
    }
    const attrs = signer.signedAttrs.attributes;
    const types = attrs.filter((a) => a.type === '1.2.840.113549.1.9.3');
    const hashes = attrs.filter((a) => a.type === '1.2.840.113549.1.9.4');
    if (
      types.length !== 1 ||
      types[0].values.length !== 1 ||
      types[0].values[0].valueBlock.toString() !== signed.encapContentInfo.eContentType ||
      hashes.length !== 1 ||
      hashes[0].values.length !== 1 ||
      !Buffer.from(hashes[0].values[0].valueBlock.valueHexView).equals(sha(new Uint8Array(bytes)))
    ) {
      throw check();
    }
    if (
      !['1.2.840.113549.1.1.1', '1.2.840.113549.1.1.11', '1.2.840.10045.4.3.2'].includes(
        signer.signatureAlgorithm.algorithmId,
      ) ||
      !verify(
        'sha256',
        new Uint8Array(signer.signedAttrs.encodedValue),
        x509.publicKey,
        signer.signature.valueBlock.valueHexView,
      )
    ) {
      throw check();
    }
  } catch {
    throw check();
  }
}
export function createPramaanTimestampAuthority(context: SigningContext): TimestampAuthority {
  if (!pramaanConfigured()) {
    throw unavailable();
  }
  return {
    async timestamp(bytes, algorithm) {
      if (algorithm !== 'SHA-256' || bytes.length !== 32) {
        throw new Error('Trusted timestamps support SHA-256 only.');
      }
      const result = await once('signature.timestamp.create', { digest: digest(bytes) }, context);
      if (
        !result.file?.fileId ||
        !Number.isInteger(result.file.sizeBytes) ||
        result.file.sizeBytes <= 0 ||
        result.file.sizeBytes > 65536
      ) {
        throw check();
      }
      const token = await downloadPramaanFile(result.file.url, 65536);
      verifyTimestampToken(token, bytes, result);
      return token;
    },
  };
}
