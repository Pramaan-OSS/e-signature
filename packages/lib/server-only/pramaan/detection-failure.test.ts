import { Hono } from 'hono';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const detect = vi.hoisted(() => ({ fields: vi.fn(), recipients: vi.fn() }));
vi.mock('@e-sign/auth/server/lib/utils/get-session', () => ({ getSession: async () => ({ user: { id: 1 } }) }));
vi.mock('@e-sign/lib/constants/app', () => ({
  IS_AI_FEATURES_CONFIGURED: () => true,
  formatPath: (path: string) => `http://localhost${path}`,
}));
vi.mock('../team/get-team', () => ({
  getTeamById: async () => ({ id: 2, derivedSettings: { aiFeaturesEnabled: true } }),
}));
vi.mock('../ai/envelope/detect-fields', () => ({ detectFieldsFromEnvelope: detect.fields }));
vi.mock('../ai/envelope/detect-recipients', () => ({ detectRecipientsFromEnvelope: detect.recipients }));

import { detectFieldsRoute } from '../../../../apps/remix/server/api/ai/detect-fields';
import { detectRecipientsRoute } from '../../../../apps/remix/server/api/ai/detect-recipients';
import { DocumentExtractionError } from './extract';

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it.each([
  'fields',
  'recipients',
] as const)('failed %s detection emits error without completion and the same envelope stays retryable', async (feature) => {
  const run = detect[feature];
  run
    .mockRejectedValueOnce(new DocumentExtractionError('Document extraction failed (invalid_request). Try again.'))
    .mockResolvedValueOnce([]);
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('logger' as never, { info: vi.fn(), error: vi.fn() } as never);
    await next();
  });
  app.route('/', feature === 'fields' ? detectFieldsRoute : detectRecipientsRoute);
  const request = () =>
    app.request('http://localhost/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ envelopeId: 'envelope_test', teamId: 2 }),
    });
  const failure = await (await request()).text();
  expect(failure).toContain('invalid_request');
  expect(failure).toContain('"type":"error"');
  expect(failure).not.toContain('"type":"complete"');
  const success = await (await request()).text();
  expect(success).toContain('"type":"complete"');
  expect(success).not.toContain('"type":"error"');
  expect(run).toHaveBeenCalledTimes(2);
});

it.each([
  'fields',
  'recipients',
] as const)('a cut-off %s stream reports failure and never calls completion', async (feature) => {
  const { detectFields } = await import('../../../../apps/remix/server/api/ai/detect-fields.client');
  const { detectRecipients } = await import('../../../../apps/remix/server/api/ai/detect-recipients.client');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{"type":"keepalive"}\n', { headers: { 'content-type': 'text/plain' } })),
  );
  const onError = vi.fn(),
    onComplete = vi.fn();
  await (feature === 'fields' ? detectFields : detectRecipients)({
    request: { envelopeId: 'envelope_test', teamId: 2 },
    onError,
    onComplete,
  });
  expect(onError).toHaveBeenCalledOnce();
  expect(onError.mock.calls[0][0].message).toContain('before completion');
  expect(onComplete).not.toHaveBeenCalled();
});
