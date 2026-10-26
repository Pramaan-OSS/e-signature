import { signingCertificateFixture } from './signing-certificate';
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { PDFDocument } from '@cantoo/pdf-lib';
import type { RunOptions } from '@pramaan/sdk';
import type { CapabilityClient } from '../../packages/lib/server-only/pramaan';
import { CATALOG } from '../../packages/lib/server-only/pramaan/catalog';
import { preparePramaanSchemas } from '../../packages/lib/server-only/pramaan/json-schema';

const files = new Map<string, Uint8Array>();
const storage = new Map<string, Uint8Array>();
const uploads = new Map<string, { path: string; bucket: string; parts: Map<number, Uint8Array> }>();
let count = 0;
export function fakePramaan(
  faults: {
    failExtractionOnce?: boolean;
    unavailableCapabilities?: string[];
    refuseEmailAttachments?: boolean;
    replyFault?: 'length' | 'maxTokens';
    certificateRead?: 'refused' | 'unavailable' | 'mismatch';
  } = {},
): CapabilityClient {
  let extractionAttempts = 0;
  const ledger = resolve('.scratch/fake-calls.jsonl');
  mkdirSync(resolve('.scratch'), { recursive: true });
  const plans = new Map<string, string>();
  const enterpriseConnections = new Map<string, Record<string, unknown>>();
  const enterpriseStarts = new Map<string, Record<string, unknown>>();
  const redeemedCodes = new Set<string>();
  return {
    jobs: {
      async get(id) {
        appendFileSync(ledger, JSON.stringify({ jobId: id, phase: 'check' }) + '\n');
        return { id, capability: 'notify.send', status: 'running' };
      },
      async cancel(id) {
        appendFileSync(ledger, JSON.stringify({ jobId: id, phase: 'cancel' }) + '\n');
        return {
          id,
          capability: 'notify.send',
          status: 'cancelled',
          result: {
            outcome: 'notify.send',
            status: 'cancelled',
            cost: { charged_micro: 90 },
            steps: [
              { capability: 'sms.send', status: 'ok', calls: 1, effect: 'done' },
              { capability: 'sms.status', status: 'failed', calls: 1, effect: 'unknown' },
            ],
          },
        };
      },
    },
    capabilities: {
      async estimate() {
        return { canRun: true, priceMaxMicro: 120 };
      },
    },
    outcomes: {
      async list() {
        return [{ id: 'notify.send', available: true }] as never;
      },
      async get(id) {
        return { id, available: id === 'notify.send' } as never;
      },
      async estimate(id, input, options) {
        preparePramaanSchemas(`outcome:${id}`, input, false);
        const key = JSON.stringify({ input, options: options?.options, basis: options?.basis });
        const plan = createHash('sha256').update(key).digest('hex');
        plans.set(plan, key);
        appendFileSync(ledger, JSON.stringify({ id, phase: 'estimate', input }) + '\n');
        return {
          outcome: id,
          ready: true,
          canRun: true,
          plan,
          priceMaxMicro: 120,
          steps: [
            { capability: 'sms.send', status: 'will_run' },
            { capability: 'sms.status', status: 'will_run' },
          ],
        } as never;
      },
      async run(id, input, options) {
        preparePramaanSchemas(`outcome:${id}`, input, false);
        if (!options?.plan) {
          throw { status: 403, code: 'forbidden', effect: 'none' };
        }
        const key = JSON.stringify({ input, options: options.options, basis: options.basis });
        if (plans.get(options.plan) !== key) {
          throw { status: 409, code: 'conflict', effect: 'none' };
        }
        appendFileSync(ledger, JSON.stringify({ id, phase: 'run', input, options }) + '\n');
        return {
          outcome: id,
          status: 'done',
          completeness: 'complete',
          result: { delivery: { status: 'delivered' } },
          steps: [{ capability: 'sms.send', status: 'ok', calls: 1, effect: 'done' }],
          cost: { chargedMicro: 90 },
        } as never;
      },
    },
    files: {
      async upload(bytes, _contentType, kind) {
        const fileId = `file_test_${++count}`;
        files.set(fileId, bytes);
        return { fileId, url: kind === 'part' ? '' : `http://localhost:3012/help?file=${fileId}` };
      },
      async delete(fileId) {
        files.delete(fileId);
      },
      async download(url) {
        return files.get(url) || new Uint8Array();
      },
    },
    call: (async (id: string, input: Record<string, unknown>, options?: RunOptions) => {
      if (
        (id === 'auth.user.delete' || (CATALOG[id] && CATALOG[id].effectClass !== 'read_only')) &&
        !options?.idempotencyKey?.trim()
      ) {
        throw Object.assign(new Error('Idempotency-Key header is required for this capability.'), {
          status: 400,
          code: 'invalid_request',
          effect: 'none',
        });
      }
      preparePramaanSchemas(id, input, false);
      if (id === 'signature.certificate.get') {
        appendFileSync(ledger, `${JSON.stringify({ id, readOnly: true })}\n`);
        if (faults.certificateRead === 'unavailable' || faults.unavailableCapabilities?.includes(id)) {
          throw { code: 'not_found', status: 404, effect: 'none' };
        }
        if (faults.certificateRead === 'refused') {
          throw { code: 'forbidden', status: 403, effect: 'none' };
        }
        return { ...signingCertificateFixture, ...(faults.certificateRead === 'mismatch' ? { publicKeySpkiBase64: 'AAAA' } : {}) };
      }
      if (faults.unavailableCapabilities?.includes(id)) {
        throw { code: 'upstream_unavailable', effect: 'none' };
      }
      appendFileSync(ledger, JSON.stringify({ id, input, options }) + '\n');
      const ref = `ref_test_${++count}`;
      if (id === 'document.convert' || id === 'document.convert-bulk') {
        const doc = await PDFDocument.create();
        doc.addPage().drawText('Converted agreement', { x: 60, y: 700 });
        const bytes = await doc.save();
        const url = `http://localhost:3012/files/converted_${count}`;
        files.set(url, bytes);
        const file = {
          fileId: ref,
          url,
          contentType: 'application/pdf',
          sizeBytes: bytes.length,
          expiresAt: '2030-01-01',
        };
        if (id === 'document.convert') {
          return { file, pageCount: 1 };
        }
        const rows = input.rows as Array<{ id: string }>;
        return {
          results: rows.map((row) => ({ id: row.id, found: true, file, pageCount: 1 })),
          summary: { total: rows.length, found: rows.length, notFound: 0, failed: 0 },
        };
      }
      if (id === 'auth.backend.provision') {
        return {
          status: 'ready',
          authUrl: 'https://auth.example.test',
          jwksUrl: 'https://auth.example.test/.well-known/jwks.json',
        };
      }
      if (id === 'auth.backend.domains.set') {
        return { allowedDomains: input.domains };
      }
      if (id === 'auth.token.verify') {
        try {
          const claims = JSON.parse(Buffer.from(String(input.token).split('.')[1], 'base64url').toString('utf8'));
          return String(input.token).endsWith('.fake-valid')
            ? {
                valid: true,
                userId: claims.sub,
                sessionId: 'managed_fake_session',
                expiresAt: new Date(claims.exp * 1000).toISOString(),
              }
            : { valid: false };
        } catch {
          return { valid: false };
        }
      }
      if (id === 'db.postgres.provision') {
        throw { code: 'upstream_unavailable', effect: 'none' };
      }
      if (String(id) === 'llm.chat' || String(id) === 'llm.complete') {
        if (faults.replyFault === 'maxTokens') {
          throw { code: 'invalid_request', status: 400, message: 'maxTokens reached with an empty reply' };
        }
        return {
          text: faults.replyFault === 'length' ? '{"unfinished":' : 'Complete',
          finishReason: faults.replyFault === 'length' ? 'length' : 'stop',
        };
      }
      if (id === 'email.send' || id === 'email.message.send') {
        if (id === 'email.send' && input.attachments) {
          if (faults.refuseEmailAttachments) {
            throw { code: 'invalid_request', effect: 'none' };
          }
          const attached = input.attachments as { fileId: string; name: string }[];
          if (
            attached.length > 10 ||
            attached.some((a) => !files.has(a.fileId)) ||
            attached.reduce((n, a) => n + (files.get(a.fileId)?.byteLength || 0), 0) > 6_000_000
          ) {
            throw { code: 'invalid_request', effect: 'none' };
          }
        }
        return { status: 'sent', ref, rfcMessageId: `<test_${count}@example.test>` };
      }
      if (id === 'email.status' || id === 'sms.status') {
        return { status: 'delivered' };
      }
      if (id === 'storage.upload.create') {
        uploads.set(ref, { path: String(input.path), bucket: String(input.bucket), parts: new Map() });
        return { ref, bucket: input.bucket, path: input.path };
      }
      if (id === 'storage.upload.parts.list') {
        return {
          results: [...uploads.get(String(input.ref))!.parts].map(([partNumber, bytes]) => ({
            partNumber,
            sizeBytes: bytes.length,
          })),
        };
      }
      if (id === 'storage.upload.part.put') {
        const bytes = files.get(String(input.fileId))!;
        uploads.get(String(input.ref))!.parts.set(Number(input.partNumber), bytes.slice());
        return { partNumber: input.partNumber, sizeBytes: bytes.length };
      }
      if (id === 'storage.upload.complete') {
        const upload = uploads.get(String(input.ref))!;
        const bytes = Buffer.concat([...upload.parts].sort(([a], [b]) => a - b).map(([, part]) => part));
        storage.set(upload.path, bytes);
        uploads.delete(String(input.ref));
        return { bucket: upload.bucket, path: upload.path, sizeBytes: bytes.length, contentType: 'application/pdf' };
      }
      if (id === 'storage.upload.abort') {
        uploads.delete(String(input.ref));
        return { aborted: true };
      }
      if (id === 'storage.object.head') {
        return {
          bucket: input.bucket,
          path: input.path,
          sizeBytes: storage.get(String(input.path))!.length,
          contentType: 'application/pdf',
        };
      }
      if (id === 'storage.object.put') {
        storage.set(String(input.path), files.get(String(input.fileId))!);
        return { stored: true, path: input.path };
      }
      if (id === 'storage.object.get') {
        return { content: Buffer.from(storage.get(String(input.path)) || []).toString('base64') };
      }
      if (id === 'storage.object.delete') {
        for (const path of input.paths as string[]) {
          storage.delete(path);
        }
        return { count: 1 };
      }
      if (id === 'signature.request.send' || id === 'signature.request.send-template') {
        return { status: 'sent', delivery: 'email', ref };
      }
      if (id === 'signature.request.get') {
        return { status: 'awaiting_signature', ref: input.ref, signers: [] };
      }
      if (id === 'signature.template.create') {
        return { status: 'ready', ref };
      }
      if (id === 'signature.template.get') {
        return { name: 'Test template', roles: [] };
      }
      if (id === 'identity.verification.create') {
        return { status: 'not_started', ref, verificationUrl: 'http://localhost:3012/help?verification=test' };
      }
      if (id === 'identity.verification.get') {
        return { status: 'approved' };
      }
      if (id === 'apps.connection.start') {
        return { connectUrl: 'https://example.test/consent' };
      }
      if (id === 'apps.catalog.search') {
        return input.cursor
          ? {
              results: [
                {
                  action: 'WORKSPACE_READ_DOCUMENT',
                  description: 'Read a returned file',
                  app: 'workspace',
                  inputSchema: { type: 'object', properties: { copyFailed: { type: 'boolean' } } },
                },
              ],
            }
          : {
              results: [
                {
                  action: 'WORKSPACE_SAVE_DOCUMENT',
                  description: 'Save a document',
                  app: 'workspace',
                  inputSchema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] },
                },
              ],
              nextCursor: 'test_page_2',
            };
      }
      if (id === 'apps.connections.list') {
        return { results: [{ app: input.app || 'workspace', status: 'active' }] };
      }
      if (id === 'apps.connection.revoke') {
        return { revoked: 1 };
      }
      if (id === 'apps.action.execute') {
        if (input.action === 'WORKSPACE_READ_DOCUMENT') {
          return {
            status: 'succeeded',
            output: {
              downloaded_file_content: (input.input as { copyFailed?: boolean })?.copyFailed
                ? { stored: false, note: 'The action ran, but its file could not be copied.' }
                : {
                    fileId: 'file_test_downloaded',
                    url: 'http://localhost:3012/files/test_downloaded',
                    expiresAt: '2030-01-01',
                    contentType: 'application/pdf',
                    sizeBytes: 200,
                  },
            },
          };
        }
        return {
          status: 'succeeded',
          output: { saved: true, results: [{ title: 'Agreement' }], display_url: 'https://example.test/agreement' },
        };
      }
      if (id === 'email.domain.verify' || id === 'email.domain.get') {
        return {
          domain: input.domain,
          status: 'pending',
          dnsRecords: [{ name: '_verify.example.test', type: 'TXT', value: 'test-verification-record' }],
        };
      }
      if (id === 'email.domain.delete') {
        return { deleted: true };
      }
      if (id === 'document.parse') {
        return { text: 'Returned agreement terms', truncated: false };
      }
      if (id === 'document.extract') {
        if (faults.failExtractionOnce && extractionAttempts++ === 0) {
          throw { code: 'invalid_request', effect: 'none' };
        }
        return {
          data:
            input.schema && JSON.stringify(input.schema).includes('box2d')
              ? { fields: [] }
              : input.schema
                ? { recipients: [] }
                : { parties: ['Test signer'], purpose: 'Test document' },
          truncated: false,
        };
      }
      if (id === 'auth.enterprise-connection.create') {
        const row = {
          ref,
          organizationRef: input.organizationRef,
          name: input.name,
          status: 'ready',
          createdAt: new Date().toISOString(),
        };
        enterpriseConnections.set(ref, row);
        return row;
      }
      if (id === 'auth.enterprise-connections.list') {
        return {
          results: [...enterpriseConnections.values()].filter((row) => row.organizationRef === input.organizationRef),
        };
      }
      if (id === 'auth.enterprise-connection.delete') {
        enterpriseConnections.delete(String(input.ref));
        return { deleted: true };
      }
      if (id === 'auth.enterprise.start') {
        if (!enterpriseConnections.has(String(input.connectionRef))) {
          throw { code: 'invalid_request', effect: 'none' };
        }
        enterpriseStarts.set(String(input.state), input);
        return {
          authorizationUrl: `https://platform.example.test/connect/link/${input.state}`,
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
        };
      }
      if (id === 'auth.social.exchange' && input.connectionRef) {
        const start = enterpriseStarts.get(String(input.state));
        if (
          !start ||
          redeemedCodes.has(String(input.code)) ||
          input.code !== `code_${input.state}` ||
          start.connectionRef !== input.connectionRef ||
          start.redirectUri !== input.redirectUri ||
          start.nonce !== input.expectedNonce ||
          start.codeChallenge !== createHash('sha256').update(String(input.pkceVerifier)).digest('base64url')
        ) {
          throw { code: 'invalid_request', effect: 'none' };
        }
        redeemedCodes.add(String(input.code));
        return {
          providerKey: 'enterprise',
          subjectId: 'test_enterprise_member',
          email: 'untrusted-label@example.test',
          emailVerified: false,
          displayName: 'Test member',
        };
      }
      if (id === 'auth.social.exchange') {
        return {
          providerKey: input.providerKey,
          subjectId: 'test_subject',
          email: 'linked@example.test',
          emailVerified: true,
          displayName: 'Linked test user',
        };
      }
      if (id === 'auth.bot-check.verify') {
        return { passed: true };
      }
      return { ref, status: 'done' };
    }) as CapabilityClient['call'],
  };
}
