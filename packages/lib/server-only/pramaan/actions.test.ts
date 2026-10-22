import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callPramaan, setPramaanClientForTests } from '../pramaan';
import { type ActionContext, type ActionInput, executeAction } from './actions';

vi.mock('../ai/pdf-to-images', () => ({
  pdfToImages: async () => [{ image: Buffer.from([0xff, 0xd8, 0xff, 0xd9]), pageNumber: 1 }],
}));

const calls: { id: string; input: unknown; options?: unknown }[] = [];
const fake = {
  call: vi.fn(async (id: string, input: unknown, options?: unknown) => {
    calls.push({ id, input, options });
    return { ref: 'ref_owned', status: 'sent', results: [] };
  }),
  files: {
    upload: vi.fn(async () => ({ fileId: 'file_owned', url: 'https://api.pramaan.dev/files/file_owned' })),
    download: vi.fn(async () => new Uint8Array([1, 2, 3])),
  },
};
const input = (action: ActionInput['action'], extra: Partial<ActionInput> = {}): ActionInput => ({
  action,
  operationId: '123e4567-e89b-42d3-a456-426614174000',
  ...extra,
});
const context: ActionContext = {
  userId: 7,
  teamId: 9,
  returnUrl: 'https://example.test/t/local/actions',
  envelope: async () => ({
    title: 'Agreement',
    documents: [{ id: 'doc1', filename: 'agreement.pdf', bytes: new Uint8Array([1, 2]) }],
    signers: [{ id: '3', name: 'Test signer', email: 'signer@example.test' }],
    fields: [],
  }),
  reference: async (_id, allowed) => {
    if (!allowed.includes('send-signature') && !allowed.includes('create-template')) {
      throw new Error('Not owned');
    }
    return 'ref_owned';
  },
  approvedAppAction: vi.fn(async () => ({
    app: 'workspace',
    action: 'WORKSPACE_RUN_ACTION',
    inputSchema: { type: 'object' },
  })),
};
beforeEach(() => {
  process.env.PRAMAAN_API_KEY = 'fake-test-key';
  calls.length = 0;
  fake.call.mockClear();
  fake.files.upload.mockClear();
  fake.files.download.mockClear();
  setPramaanClientForTests(fake as never);
});
afterEach(() => {
  setPramaanClientForTests(undefined);
  delete process.env.PRAMAAN_API_KEY;
});
describe('Pramaan workspace actions', () => {
  it('uploads private documents and sends with one stable action key', async () => {
    await executeAction(input('send-signature', { envelopeId: 'owned', confirm: true }), context);
    expect(calls[0].id).toBe('signature.request.send');
    expect(calls[0].input).toMatchObject({
      documents: [{ id: 'doc1', filename: 'agreement.pdf', fileId: 'file_owned' }],
      delivery: 'email',
    });
    expect(calls[0].options).toEqual({ idempotencyKey: '123e4567-e89b-42d3-a456-426614174000' });
  });
  it('refuses message sends without confirmation', async () => {
    await expect(executeAction(input('send-signature', { envelopeId: 'owned' }), context)).rejects.toThrow('Confirm');
    expect(calls).toEqual([]);
  });
  it('refuses oversized signing files before uploads', async () => {
    const oversized = {
      ...context,
      envelope: async () => ({
        ...(await context.envelope('owned')),
        documents: [{ id: 'doc', filename: 'big.pdf', bytes: new Uint8Array(10_000_001) }],
      }),
    };
    await expect(
      executeAction(input('send-signature', { envelopeId: 'owned', confirm: true }), oversized),
    ).rejects.toThrow('limits');
    expect(calls).toEqual([]);
  });
  it('checks owned references before reading signing progress', async () => {
    await expect(
      executeAction(input('signature-status', { sourceOperationId: 'foreign' }), {
        ...context,
        reference: async () => {
          throw new Error('Not owned');
        },
      }),
    ).rejects.toThrow('Not owned');
    expect(calls).toEqual([]);
  });
  it('refuses identity checks without consent or without an owned signer', async () => {
    await expect(
      executeAction(input('verify-identity', { envelopeId: 'owned', recipientId: 3 }), context),
    ).rejects.toThrow('consenting');
    await expect(
      executeAction(input('verify-identity', { envelopeId: 'owned', recipientId: 4, consent: true }), context),
    ).rejects.toThrow('not on');
    expect(calls).toEqual([]);
  });
  it('uses a per-user reference when connecting an app', async () => {
    await executeAction(input('connect-app', { app: 'calendar' }), context);
    expect(calls[0]).toMatchObject({ id: 'apps.connection.start', input: { endUserRef: 'user_7', app: 'calendar' } });
  });
  it('requires an action selected from an owned saved list', async () => {
    await executeAction(
      input('run-app-action', { sourceOperationId: 'owned', appAction: 'WORKSPACE_RUN_ACTION', confirm: true }),
      context,
    );
    expect(context.approvedAppAction).toHaveBeenCalledWith('owned', 'WORKSPACE_RUN_ACTION');
  });
  it('sends text only after consent and confirmation', async () => {
    await expect(
      executeAction(
        input('sms-reminder', { phone: '+441234567890', message: 'Review your document.', confirm: true }),
        context,
      ),
    ).rejects.toThrow('consent');
    await executeAction(
      input('sms-reminder', { phone: '+441234567890', message: 'Review your document.', confirm: true, consent: true }),
      context,
    );
    expect(calls[0].id).toBe('sms.send');
  });
  it('never exposes raw upstream details in errors', async () => {
    fake.call.mockRejectedValueOnce(new Error('vendor key secret price USD 123'));
    await expect(callPramaan('email.status', { ref: 'owned' })).rejects.toThrow('This action could not be completed.');
  });
});

it('searches the catalogue by keyword with the exact underscored slug and cap', async () => {
  await executeAction(input('list-app-actions', { query: 'find a file', app: 'google_search_console' }), context);
  expect(calls[0]).toEqual({
    id: 'apps.catalog.search',
    input: { query: 'find a file', app: 'google_search_console', limit: 50 },
    options: undefined,
  });
});
it('refuses discovery without a keyword instead of listing everything', async () => {
  await expect(executeAction(input('list-app-actions'), context)).rejects.toThrow('keyword');
  expect(calls).toEqual([]);
});
it('keeps search schemas and marks new results as catalogue discovery', async () => {
  const results = [
    { app: 'workspace', action: 'WORKSPACE_RUN_ACTION', inputSchema: { type: 'object', required: ['title'] } },
  ];
  fake.call.mockResolvedValueOnce({ results } as never);
  expect(await executeAction(input('list-app-actions', { query: 'save document' }), context)).toMatchObject({
    results,
    discovery: 'catalogue-search',
    limit: 50,
  });
});
it('executes only the saved catalogue key with the caller-written inputs and stable key', async () => {
  await executeAction(
    input('run-app-action', {
      sourceOperationId: 'owned',
      appAction: 'WORKSPACE_RUN_ACTION',
      arguments: { title: 'Agreement' },
      confirm: true,
    }),
    context,
  );
  expect(calls[0]).toMatchObject({
    id: 'apps.action.execute',
    input: { endUserRef: 'user_7', action: 'WORKSPACE_RUN_ACTION', input: { title: 'Agreement' } },
    options: { idempotencyKey: expect.any(String) },
  });
});
it('unowned catalogue selection never executes an action', async () => {
  await expect(
    executeAction(
      input('run-app-action', { sourceOperationId: 'foreign', appAction: 'WORKSPACE_RUN_ACTION', confirm: true }),
      {
        ...context,
        approvedAppAction: async () => {
          throw new Error('Not owned');
        },
      },
    ),
  ).rejects.toThrow('Not owned');
  expect(calls).toEqual([]);
});
it('lists and revokes connections using only the signed-in end-user reference', async () => {
  await executeAction(input('list-app-connections', { app: 'google_analytics' }), context);
  expect(calls[0]).toMatchObject({
    id: 'apps.connections.list',
    input: { endUserRef: 'user_7', app: 'google_analytics' },
  });
  await expect(executeAction(input('revoke-app-connection', { app: 'google_analytics' }), context)).rejects.toThrow(
    'Confirm',
  );
  expect(calls).toHaveLength(1);
  await executeAction(input('revoke-app-connection', { app: 'google_analytics', confirm: true }), context);
  expect(calls[1]).toMatchObject({
    id: 'apps.connection.revoke',
    input: { endUserRef: 'user_7', app: 'google_analytics' },
    options: { idempotencyKey: expect.any(String) },
  });
});
it('saves the exact connected app slug so the hosted link keeps its matching access notice', async () => {
  expect(await executeAction(input('connect-app', { app: 'google_drive' }), context)).toMatchObject({
    app: 'google_drive',
  });
});

it('reads a downloaded platform file handle directly after one approved action', async () => {
  const file = {
    fileId: 'file_downloaded',
    url: 'https://example.test/files/downloaded',
    expiresAt: '2030-01-01',
    contentType: 'application/pdf',
    sizeBytes: 200,
  };
  fake.call
    .mockResolvedValueOnce({ status: 'succeeded', output: { downloaded_file_content: file } } as never)
    .mockResolvedValueOnce({ text: 'Agreement terms', truncated: false } as never);
  const persistAppResult = vi.fn();
  const result = await executeAction(
    input('run-app-action', {
      sourceOperationId: 'owned',
      appAction: 'WORKSPACE_RUN_ACTION',
      confirm: true,
      readDownloadedFiles: true,
    }),
    { ...context, persistAppResult },
  );
  expect(result).toMatchObject({
    status: 'succeeded',
    output: { downloaded_file_content: file },
    fileTexts: [{ fileId: 'file_downloaded', status: 'read', text: 'Agreement terms', truncated: false }],
  });
  expect(fake.call.mock.calls.map(([id]) => id)).toEqual(['apps.action.execute', 'document.parse']);
  expect(fake.call.mock.calls[1][1]).toEqual({ fileId: 'file_downloaded', ocr: false });
  expect(persistAppResult).toHaveBeenCalledWith({ status: 'succeeded', output: { downloaded_file_content: file } });
  expect(fake.files.upload).not.toHaveBeenCalled();
  expect(fake.files.download).not.toHaveBeenCalled();
});
it('keeps a succeeded action when its file copy failed and does not replay or parse it', async () => {
  const output = { downloaded_file_content: { stored: false, note: 'The file could not be copied.' } };
  fake.call.mockResolvedValueOnce({ status: 'succeeded', output } as never);
  const result = await executeAction(
    input('run-app-action', {
      sourceOperationId: 'owned',
      appAction: 'WORKSPACE_RUN_ACTION',
      confirm: true,
      readDownloadedFiles: true,
    }),
    context,
  );
  expect(result).toMatchObject({ status: 'succeeded', output, fileTexts: [{ status: 'copy-failed' }] });
  expect(fake.call.mock.calls.map(([id]) => id)).toEqual(['apps.action.execute']);
});
it('keeps the executed result when parsing fails', async () => {
  fake.call
    .mockResolvedValueOnce({
      status: 'succeeded',
      output: {
        downloaded_file_content: { fileId: 'file_downloaded', contentType: 'application/pdf', sizeBytes: 200 },
      },
    } as never)
    .mockRejectedValueOnce({ code: 'upstream_unavailable' });
  expect(
    await executeAction(
      input('run-app-action', {
        sourceOperationId: 'owned',
        appAction: 'WORKSPACE_RUN_ACTION',
        confirm: true,
        readDownloadedFiles: true,
      }),
      context,
    ),
  ).toMatchObject({ status: 'succeeded', fileTexts: [{ status: 'parse-failed' }] });
  expect(fake.call.mock.calls.map(([id]) => id)).toEqual(['apps.action.execute', 'document.parse']);
});
it('rejects a cursor with a changed search before any paid lookup', async () => {
  const previousCatalogue = vi.fn(async () => ({
    discovery: 'catalogue-search' as const,
    query: 'find',
    app: 'workspace',
    limit: 50 as const,
    results: [],
    nextCursor: 'next',
    cursorExpiresAt: Date.now() + 60000,
  }));
  await expect(
    executeAction(
      input('list-app-actions', { sourceOperationId: 'owned', cursor: 'next', query: 'different', app: 'workspace' }),
      { ...context, previousCatalogue },
    ),
  ).rejects.toThrow('same search');
  expect(calls).toEqual([]);
});
it('unavailable signer verification refuses the action with a plain reason', async () => {
  fake.call.mockRejectedValueOnce({ code: 'upstream_unavailable', message: 'Private source detail' });
  await expect(
    executeAction(input('verify-identity', { envelopeId: 'owned', recipientId: 3, consent: true }), context),
  ).rejects.toMatchObject({ code: 'upstream_unavailable', message: expect.stringContaining('not available yet') });
});

it('labels rasterized JPEG pages correctly before signature extraction', async () => {
  await executeAction(input('extract-signatures', { envelopeId: 'owned', consent: true }), context);
  expect(fake.files.upload).toHaveBeenCalledWith(expect.any(Uint8Array), 'image/jpeg', 'image', undefined);
  expect(calls[0]).toMatchObject({ id: 'document.signature.extract', input: { file: 'file_owned' } });
});
