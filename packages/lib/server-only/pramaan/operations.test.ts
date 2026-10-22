import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => {
  const rows = new Map<string, any>();
  return {
    rows,
    capabilityOperation: {
      findUnique: vi.fn(async ({ where }: any) => rows.get(where.id) || null),
      findFirst: vi.fn(
        async ({ where }: any) =>
          [...rows.values()].find(
            (row) =>
              row.id === where.id &&
              row.userId === where.userId &&
              row.teamId === where.teamId &&
              row.state === where.state &&
              where.action.in.includes(row.action),
          ) || null,
      ),
      findUniqueOrThrow: vi.fn(async ({ where }: any) => rows.get(where.id)),
      create: vi.fn(async ({ data }: any) => {
        const row = { ...data, state: 'working' };
        rows.set(data.id, row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const row = { ...rows.get(where.id), ...data };
        rows.set(where.id, row);
        return row;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const row = rows.get(where.id);
        if (!row || row.state !== where.state) {
          return { count: 0 };
        }
        rows.set(where.id, { ...row, ...data });
        return { count: 1 };
      }),
    },
  };
});
vi.mock('@e-sign/prisma', () => ({ prisma: db }));
vi.mock('../team/get-team', () => ({ getTeamById: async () => ({ currentTeamRole: 'ADMIN' }) }));
vi.mock('../envelope/get-envelope-by-id', () => ({ getEnvelopeById: vi.fn() }));
vi.mock('../../universal/upload/get-file.server', () => ({ getFileServerSide: vi.fn() }));
const service = vi.hoisted(() => ({ estimate: vi.fn(), run: vi.fn() }));
vi.mock('./outcomes', async (original) => ({
  ...(await original<typeof import('./outcomes')>()),
  estimateReminder: service.estimate,
  runReminder: service.run,
  ReminderReapproval: class extends Error {},
  ReminderTryLater: class extends Error {},
}));

import { setPramaanClientForTests } from '../pramaan';
import { runOwnedOperation } from './operations';
import { ReminderReapproval, ReminderTryLater } from './outcomes';

const input = {
  action: 'sms-reminder',
  operationId: '123e4567-e89b-42d3-a456-426614174000',
  phone: '+441234567890',
  message: 'Please review.',
  consent: true,
  confirm: true,
};
beforeEach(() => {
  db.rows.clear();
  vi.clearAllMocks();
  process.env.PRAMAAN_API_KEY = 'fake';
  service.estimate.mockResolvedValue({
    kind: 'outcome',
    plan: 'plan',
    input: { phone: input.phone, message: input.message, plainSms: true },
    steps: ['Send'],
    priceMaxMicro: 120,
    expiresAt: Date.now() + 60000,
  });
  service.run.mockResolvedValue({ status: 'delivered', runStatus: 'done' });
});
it('first submission only estimates even when approval is forged, then approval sends once', async () => {
  expect((await runOwnedOperation({ ...input, approveOutcome: true }, 1, 2, 'http://localhost')).state).toBe('planned');
  expect(service.run).not.toHaveBeenCalled();
  expect((await runOwnedOperation({ ...input, approveOutcome: true }, 1, 2, 'http://localhost')).state).toBe('done');
  await runOwnedOperation({ ...input, approveOutcome: true }, 1, 2, 'http://localhost');
  expect(service.run).toHaveBeenCalledTimes(1);
});
it('changed input and foreign owner cannot approve the saved estimate', async () => {
  await runOwnedOperation(input, 1, 2, 'http://localhost');
  await expect(
    runOwnedOperation({ ...input, message: 'Changed', approveOutcome: true }, 1, 2, 'http://localhost'),
  ).rejects.toThrow('unavailable');
  await expect(runOwnedOperation({ ...input, approveOutcome: true }, 9, 2, 'http://localhost')).rejects.toThrow(
    'unavailable',
  );
  expect(service.run).not.toHaveBeenCalled();
});
it('simultaneous approvals claim the saved plan once', async () => {
  await runOwnedOperation(input, 1, 2, 'http://localhost');
  await Promise.all([1, 2].map(() => runOwnedOperation({ ...input, approveOutcome: true }, 1, 2, 'http://localhost')));
  expect(service.run).toHaveBeenCalledTimes(1);
});
it('safe refusal stores a fresh fallback estimate and requires another approval', async () => {
  await runOwnedOperation(input, 1, 2, 'http://localhost');
  service.run.mockRejectedValueOnce(new ReminderReapproval());
  expect((await runOwnedOperation({ ...input, approveOutcome: true }, 1, 2, 'http://localhost')).state).toBe('planned');
  expect(service.estimate).toHaveBeenLastCalledWith(expect.anything(), true);
  expect(service.run).toHaveBeenCalledTimes(1);
});
it('uncertain errors block and repeated submissions never replay', async () => {
  await runOwnedOperation(input, 1, 2, 'http://localhost');
  service.run.mockRejectedValueOnce(new Error('uncertain'));
  expect((await runOwnedOperation({ ...input, approveOutcome: true }, 1, 2, 'http://localhost')).state).toBe('blocked');
  await runOwnedOperation({ ...input, approveOutcome: true }, 1, 2, 'http://localhost');
  expect(service.run).toHaveBeenCalledTimes(1);
});

const connectorCall = vi.fn(async (id: string) =>
  id === 'apps.catalog.search'
    ? { results: [{ app: 'workspace', action: 'WORKSPACE_SAVE_DOCUMENT', inputSchema: { type: 'object' } }] }
    : { status: 'succeeded', output: { saved: true } },
);
afterEach(() => setPramaanClientForTests(undefined));
it('saves catalogue discovery and authorizes execution only from the caller’s workspace', async () => {
  connectorCall.mockClear();
  setPramaanClientForTests({ call: connectorCall } as never);
  const search = {
    action: 'list-app-actions',
    operationId: '123e4567-e89b-42d3-a456-426614174001',
    query: 'save document',
  };
  const row = await runOwnedOperation(search, 1, 2, 'http://localhost');
  expect(row.result.discovery).toBe('catalogue-search');
  const execute = {
    action: 'run-app-action',
    operationId: '123e4567-e89b-42d3-a456-426614174002',
    sourceOperationId: search.operationId,
    appAction: 'WORKSPACE_SAVE_DOCUMENT',
    arguments: { title: 'Agreement' },
    confirm: true,
  };
  expect((await runOwnedOperation(execute, 1, 2, 'http://localhost')).state).toBe('done');
  expect(connectorCall).toHaveBeenLastCalledWith(
    'apps.action.execute',
    { endUserRef: 'user_1', action: 'WORKSPACE_SAVE_DOCUMENT', input: { title: 'Agreement' } },
    { idempotencyKey: execute.operationId },
  );
  connectorCall.mockClear();
  expect(
    (
      await runOwnedOperation(
        { ...execute, operationId: '123e4567-e89b-42d3-a456-426614174003' },
        9,
        2,
        'http://localhost',
      )
    ).state,
  ).toBe('blocked');
  expect(connectorCall).not.toHaveBeenCalled();
});

it('capacity refusal stays retryable and re-estimates before another approval', async () => {
  await runOwnedOperation(input, 1, 2, 'http://localhost');
  service.run.mockRejectedValueOnce(new ReminderTryLater());
  expect((await runOwnedOperation({ ...input, approveOutcome: true }, 1, 2, 'http://localhost')).state).toBe('waiting');
  expect((await runOwnedOperation({ ...input, approveOutcome: false }, 1, 2, 'http://localhost')).state).toBe(
    'planned',
  );
  expect(service.run).toHaveBeenCalledTimes(1);
});

it('merges explicitly requested pages into the owned search and clears its last cursor', async () => {
  setPramaanClientForTests({ call: connectorCall } as never);
  connectorCall.mockClear();
  connectorCall
    .mockResolvedValueOnce({
      results: [{ app: 'workspace', action: 'WORKSPACE_FIRST', inputSchema: { type: 'object' } }],
      nextCursor: 'next_page',
    } as never)
    .mockResolvedValueOnce({
      results: [{ app: 'workspace', action: 'WORKSPACE_SECOND', inputSchema: { type: 'object' } }],
    } as never);
  const first = {
    action: 'list-app-actions',
    operationId: '123e4567-e89b-42d3-a456-426614174010',
    query: 'find file',
    app: 'workspace',
  };
  const row = await runOwnedOperation(first, 1, 2, 'http://localhost');
  expect(row.result.nextCursor).toBe('next_page');
  expect(connectorCall).toHaveBeenCalledTimes(1);
  const second = await runOwnedOperation(
    {
      ...first,
      operationId: '123e4567-e89b-42d3-a456-426614174011',
      sourceOperationId: first.operationId,
      cursor: 'next_page',
    },
    1,
    2,
    'http://localhost',
  );
  expect(second.state).toBe('done');
  expect(second.result.results.map((item: any) => item.action)).toEqual(['WORKSPACE_FIRST', 'WORKSPACE_SECOND']);
  expect(second.result).not.toHaveProperty('nextCursor');
  expect(db.rows.get(first.operationId).result).not.toHaveProperty('nextCursor');
  expect(connectorCall).toHaveBeenCalledTimes(2);
});
it('does not load a cursor from another workspace', async () => {
  setPramaanClientForTests({ call: connectorCall } as never);
  connectorCall.mockClear();
  db.rows.set('123e4567-e89b-42d3-a456-426614174020', {
    id: '123e4567-e89b-42d3-a456-426614174020',
    userId: 9,
    teamId: 2,
    action: 'list-app-actions',
    state: 'done',
    result: { discovery: 'catalogue-search', query: 'find', limit: 50, nextCursor: 'foreign' },
  });
  expect(
    (
      await runOwnedOperation(
        {
          action: 'list-app-actions',
          query: 'find',
          cursor: 'foreign',
          sourceOperationId: '123e4567-e89b-42d3-a456-426614174020',
          operationId: '123e4567-e89b-42d3-a456-426614174021',
        },
        1,
        2,
        'http://localhost',
      )
    ).state,
  ).toBe('blocked');
  expect(connectorCall).not.toHaveBeenCalled();
});

it('persists an accepted job before its result and blocks unknown reports from replay', async () => {
  await runOwnedOperation(input, 1, 2, 'http://localhost');
  service.run.mockImplementationOnce(async (_input, _plan, onJob) => {
    await onJob({ id: 'saved_job', status: 'running' });
    expect(db.rows.get(input.operationId).result.jobId).toBe('saved_job');
    return { runStatus: 'done', needsCheck: true, steps: [{ effect: 'unknown' }] };
  });
  const result = await runOwnedOperation({ ...input, approveOutcome: true }, 1, 2, 'http://localhost');
  expect(result.state).toBe('blocked');
  expect(result.error).toMatch(/Check.*before retrying/);
  await runOwnedOperation({ ...input, approveOutcome: true }, 1, 2, 'http://localhost');
  expect(service.run).toHaveBeenCalledTimes(1);
});

it('cancels only an owned saved job and keeps completed and unknown steps', async () => {
  const { manageOwnedOutcome } = await import('./operations');
  const cancel = vi.fn(async () => ({
    id: 'saved_job',
    status: 'cancelled',
    result: {
      outcome: 'notify.send',
      status: 'cancelled',
      cost: { charged_micro: 80 },
      steps: [
        { capability: 'sms.send', status: 'ok', effect: 'done' },
        { capability: 'sms.status', status: 'failed', effect: 'unknown' },
      ],
    },
  }));
  setPramaanClientForTests({ jobs: { cancel }, call: connectorCall } as never);
  db.rows.set(input.operationId, {
    id: input.operationId,
    userId: 1,
    teamId: 2,
    action: 'sms-reminder',
    state: 'working',
    result: { jobId: 'saved_job' },
  });
  await expect(manageOwnedOutcome(input.operationId, 9, 2, true)).rejects.toThrow('unavailable');
  expect(cancel).not.toHaveBeenCalled();
  const result = await manageOwnedOutcome(input.operationId, 1, 2, true);
  expect(result.state).toBe('blocked');
  expect(result.result.chargedMicro).toBe(80);
  expect(result.result.steps.map((step: any) => step.effect)).toEqual(['done', 'unknown']);
  expect(result.error).toMatch(/Check before retrying/);
  expect(cancel).toHaveBeenCalledExactlyOnceWith('saved_job');
});

it('checks timeout and missing-result jobs without replaying a reminder', async () => {
  const { manageOwnedOutcome } = await import('./operations');
  const get = vi
    .fn()
    .mockResolvedValueOnce({ id: 'saved_job', status: 'failed', error: { code: 'upstream_timeout' } })
    .mockResolvedValueOnce({ id: 'saved_job', status: 'cancelled' });
  setPramaanClientForTests({ jobs: { get }, call: connectorCall } as never);
  db.rows.set(input.operationId, {
    id: input.operationId,
    userId: 1,
    teamId: 2,
    action: 'sms-reminder',
    state: 'working',
    result: { jobId: 'saved_job' },
  });
  const timed = await manageOwnedOutcome(input.operationId, 1, 2);
  expect(timed.error).toMatch(/time limit/);
  expect(timed.result.needsCheck).toBe(true);
  const missing = await manageOwnedOutcome(input.operationId, 1, 2);
  expect(missing.state).toBe('blocked');
  expect(missing.result.needsCheck).toBe(true);
  expect(service.run).not.toHaveBeenCalled();
});

it('keeps a failed run report blocked even when the enclosing job is done', async () => {
  const { manageOwnedOutcome } = await import('./operations');
  const get = vi.fn(async () => ({
    id: 'saved_job',
    status: 'done',
    result: {
      outcome: 'notify.send',
      status: 'failed',
      cost: { charged_micro: 80 },
      steps: [{ capability: 'sms.send', status: 'ok', effect: 'done' }],
    },
  }));
  setPramaanClientForTests({ jobs: { get }, call: connectorCall } as never);
  db.rows.set(input.operationId, {
    id: input.operationId,
    userId: 1,
    teamId: 2,
    action: 'sms-reminder',
    state: 'working',
    result: { jobId: 'saved_job' },
  });
  const result = await manageOwnedOutcome(input.operationId, 1, 2);
  expect(result.state).toBe('blocked');
  expect(result.error).toMatch(/Check the recorded effects/);
  expect(service.run).not.toHaveBeenCalled();
});

it('failed document extraction records a reason and explicit retry succeeds without replaying completed work', async () => {
  const { getEnvelopeById } = await import('../envelope/get-envelope-by-id');
  const { getFileServerSide } = await import('../../universal/upload/get-file.server');
  vi.mocked(getEnvelopeById).mockResolvedValue({
    id: 'envelope_test',
    title: 'Test',
    envelopeItems: [{ id: 'item_test', title: 'Test', documentData: { id: 'data_test' } }],
    recipients: [],
    fields: [],
  } as never);
  const { PDFDocument } = await import('@cantoo/pdf-lib');
  const pdf = await PDFDocument.create();
  pdf.addPage();
  vi.mocked(getFileServerSide).mockResolvedValue(await pdf.save());
  const call = vi
    .fn()
    .mockRejectedValueOnce({ code: 'invalid_request' })
    .mockResolvedValue({ data: { parties: [] }, truncated: false });
  setPramaanClientForTests({ call } as never);
  const request = { action: 'extract-document', operationId: input.operationId, envelopeId: 'envelope_test' };
  const failed = await runOwnedOperation(request, 1, 2, 'http://localhost');
  expect(failed.state).toBe('failed');
  expect(failed.error).toContain('invalid_request');
  expect(failed.error).toContain('Try again');
  expect(failed.result).toBeUndefined();
  call.mockResolvedValueOnce({ data: { parties: [] }, truncated: true });
  const incomplete = await runOwnedOperation(request, 1, 2, 'http://localhost');
  expect(incomplete.state).toBe('failed');
  expect(incomplete.error).toContain('incomplete');
  const retry = await runOwnedOperation(request, 1, 2, 'http://localhost');
  expect(retry.state).toBe('done');
  await runOwnedOperation(request, 1, 2, 'http://localhost');
  expect(call).toHaveBeenCalledTimes(3);
});
it('unavailable identity status stays blocked with a plain reason and never becomes completed', async () => {
  db.rows.set('223e4567-e89b-42d3-a456-426614174000', {
    id: '223e4567-e89b-42d3-a456-426614174000',
    userId: 1,
    teamId: 2,
    action: 'verify-identity',
    state: 'done',
    resourceRef: 'owned_identity',
  });
  setPramaanClientForTests({
    call: async () => {
      throw { code: 'upstream_unavailable', message: 'Private source detail' };
    },
  } as never);
  const request = {
    action: 'identity-status',
    operationId: input.operationId,
    sourceOperationId: '223e4567-e89b-42d3-a456-426614174000',
  };
  const row = await runOwnedOperation(request, 1, 2, 'http://localhost');
  expect(row.state).toBe('blocked');
  expect(row.error).toContain('not available yet');
  expect(row.result).toBeUndefined();
  expect(row.error).not.toContain('Private');
});
