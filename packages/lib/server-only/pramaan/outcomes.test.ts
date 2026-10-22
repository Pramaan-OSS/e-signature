import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EstimatePrice } from '../../universal/estimate-price';
import { listPramaanOutcomes, setPramaanClientForTests } from '../pramaan';
import type { ActionInput } from './actions';
import { estimateReminder, ReminderReapproval, ReminderTryLater, runReminder } from './outcomes';

const input: ActionInput = {
  action: 'sms-reminder',
  operationId: '123e4567-e89b-42d3-a456-426614174000',
  phone: '+441234567890',
  message: 'Review your document.',
  consent: true,
  confirm: true,
  approveOutcome: true,
};
const fake = {
  call: vi.fn(async () => ({ ref: 'owned', status: 'sent' })),
  capabilities: { estimate: vi.fn(async () => ({ canRun: true, priceMaxMicro: 100 })) },
  outcomes: {
    list: vi.fn(async () => [{ id: 'notify.send', available: true }]),
    get: vi.fn(async () => ({ available: true })),
    estimate: vi.fn(async () => ({
      ready: true,
      canRun: true,
      plan: 'approved_plan',
      priceMaxMicro: 100,
      steps: [
        { capability: 'sms.send', status: 'will_run' },
        { capability: 'sms.status', status: 'will_run' },
      ],
    })),
    run: vi.fn(async () => ({
      status: 'done',
      completeness: 'complete',
      result: { delivery: { status: 'delivered' } },
      cost: { chargedMicro: 80 },
      steps: [{ capability: 'sms.send', status: 'ok', calls: 1, effect: 'done' }],
    })),
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  setPramaanClientForTests(fake as never);
});
afterEach(() => setPramaanClientForTests(undefined));
it('lists outcomes through the single client and estimates without acting', async () => {
  expect((await listPramaanOutcomes())[0].available).toBe(true);
  const plan = await estimateReminder(input);
  expect(plan.input.plainSms).toBe(true);
  expect(fake.outcomes.run).not.toHaveBeenCalled();
  expect(fake.call).not.toHaveBeenCalled();
});
it('runs the approved input with the plan, consent basis and stable action key', async () => {
  const plan = await estimateReminder(input);
  expect(await runReminder(input, plan)).toMatchObject({ status: 'delivered', laterDeliveryLookup: false });
  expect(fake.outcomes.run).toHaveBeenCalledWith('notify.send', plan.input, {
    basis: { ground: 'consent' },
    options: { confirm: true },
    plan: plan.plan,
    idempotencyKey: input.operationId,
  });
  expect(fake.call).not.toHaveBeenCalled();
});
it('unavailable outcomes use an estimated capability path without running the outcome', async () => {
  fake.outcomes.get.mockResolvedValueOnce({ available: false });
  const plan = await estimateReminder(input);
  expect(plan.kind).toBe('capability');
  expect(fake.outcomes.estimate).not.toHaveBeenCalled();
  await runReminder(input, plan);
  expect(fake.call).toHaveBeenCalled();
  expect(fake.outcomes.run).not.toHaveBeenCalled();
});
it('requires approval and rejects changed input or expired plans before sending', async () => {
  const plan = await estimateReminder(input);
  await expect(runReminder({ ...input, approveOutcome: false }, plan)).rejects.toThrow('Approve');
  await expect(runReminder({ ...input, message: 'Changed' }, plan)).rejects.toBeInstanceOf(ReminderReapproval);
  await expect(runReminder(input, { ...plan, expiresAt: 0 })).rejects.toBeInstanceOf(ReminderReapproval);
  expect(fake.outcomes.run).not.toHaveBeenCalled();
});
for (const status of [403, 409]) {
  it(`safely refused ${status} requires fresh approval and never automatically sends`, async () => {
    const plan = await estimateReminder(input);
    fake.outcomes.run.mockRejectedValueOnce({
      status,
      effect: 'none',
      code: status === 403 ? 'forbidden' : 'conflict',
      message: 'private account',
    });
    await expect(runReminder(input, plan)).rejects.toBeInstanceOf(ReminderReapproval);
    expect(fake.call).not.toHaveBeenCalled();
  });
}
it('uncertain transport failure never falls back', async () => {
  const plan = await estimateReminder(input);
  fake.outcomes.run.mockRejectedValueOnce({ code: 'upstream_unavailable' });
  await expect(runReminder(input, plan)).rejects.toThrow('Check its recorded effects');
  expect(fake.call).not.toHaveBeenCalled();
});
it('failed report with a completed send is preserved and never replayed as a capability', async () => {
  const plan = await estimateReminder(input);
  fake.outcomes.run.mockResolvedValueOnce({
    status: 'failed',
    completeness: 'partial',
    result: { delivery: { status: 'unknown' } },
    cost: { chargedMicro: 80 },
    steps: [{ capability: 'sms.send', status: 'ok', calls: 1, effect: 'done' }],
  });
  expect(await runReminder(input, plan)).toMatchObject({ runStatus: 'failed', steps: [{ effect: 'done' }] });
  expect(fake.call).not.toHaveBeenCalled();
});
it('non-runnable estimate stops without bypassing through capabilities', async () => {
  fake.outcomes.estimate.mockResolvedValueOnce({
    ready: true,
    canRun: false,
    plan: 'approved_plan',
    priceMaxMicro: 100,
    steps: [
      { capability: 'sms.send', status: 'will_run' },
      { capability: 'sms.status', status: 'will_run' },
    ],
  });
  await expect(estimateReminder(input)).rejects.toThrow('not ready');
  expect(fake.capabilities.estimate).not.toHaveBeenCalled();
});

it('availability changing after estimate asks for fallback approval before sending', async () => {
  const plan = await estimateReminder(input);
  fake.outcomes.get.mockResolvedValueOnce({ available: false });
  await expect(runReminder(input, plan)).rejects.toBeInstanceOf(ReminderReapproval);
  expect(fake.outcomes.run).not.toHaveBeenCalled();
  expect(fake.call).not.toHaveBeenCalled();
});
it('explicit unavailable response racing the check asks for fallback approval', async () => {
  const plan = await estimateReminder(input);
  fake.outcomes.run.mockRejectedValueOnce({ status: 502, code: 'upstream_unavailable' });
  await expect(runReminder(input, plan)).rejects.toBeInstanceOf(ReminderReapproval);
  expect(fake.call).not.toHaveBeenCalled();
});
it('refuses an estimate containing a different sending channel', async () => {
  fake.outcomes.estimate.mockResolvedValueOnce({
    ready: true,
    canRun: true,
    plan: 'approved_plan',
    priceMaxMicro: 100,
    steps: [
      { capability: 'sms.send', status: 'will_run' },
      { capability: 'email.send', status: 'will_run' },
    ],
  });
  await expect(estimateReminder(input)).rejects.toThrow('not ready');
  expect(fake.outcomes.run).not.toHaveBeenCalled();
});

it('outcome capacity refusal means try later without any send fallback', async () => {
  const plan = await estimateReminder(input);
  fake.outcomes.run.mockRejectedValueOnce({ status: 429, code: 'rate_limited', effect: 'none' });
  await expect(runReminder(input, plan)).rejects.toBeInstanceOf(ReminderTryLater);
  expect(fake.call).not.toHaveBeenCalled();
});
it('estimate rate limit is retryable without a capability bypass', async () => {
  fake.outcomes.estimate.mockRejectedValueOnce({ status: 429, code: 'rate_limited' });
  await expect(estimateReminder(input)).rejects.toBeInstanceOf(ReminderTryLater);
  expect(fake.call).not.toHaveBeenCalled();
});

it('rate limit while polling an already-started outcome is uncertain and never resendable', async () => {
  const plan = await estimateReminder(input);
  fake.outcomes.run.mockRejectedValueOnce({
    status: 429,
    code: 'rate_limited',
    effect: 'none',
    outcomeJobStarted: true,
  });
  await expect(runReminder(input, plan)).rejects.not.toBeInstanceOf(ReminderTryLater);
  expect(fake.call).not.toHaveBeenCalled();
});

it('keeps unknown effects visible even if a report claims completion, without a fallback', async () => {
  const plan = await estimateReminder(input);
  fake.outcomes.run.mockResolvedValueOnce({
    status: 'done',
    result: {},
    cost: { chargedMicro: 80 },
    steps: [{ capability: 'sms.send', status: 'failed', calls: 1, effect: 'unknown' }],
  } as never);
  expect(await runReminder(input, plan)).toMatchObject({
    needsCheck: true,
    message: 'A step may have acted. Check before retrying.',
  });
  expect(fake.call).not.toHaveBeenCalled();
});

it('times out an accepted run without another send or fallback', async () => {
  const plan = await estimateReminder(input);
  fake.outcomes.run.mockRejectedValueOnce({
    code: 'upstream_timeout',
    outcomeJobStarted: true,
    outcomeJobId: 'owned_job',
    effect: 'unknown',
  });
  await expect(runReminder(input, plan)).rejects.toMatchObject({
    code: 'upstream_timeout',
    outcomeJobStarted: true,
    outcomeJobId: 'owned_job',
    effect: 'unknown',
  });
  expect(fake.call).not.toHaveBeenCalled();
});

it('explains a missing messaging account without sending or using the capability fallback', async () => {
  fake.outcomes.estimate.mockResolvedValueOnce({ ready: false, canRun: false, reason: 'connection_required' } as never);
  await expect(estimateReminder(input)).rejects.toThrow('Text reminders are not available yet');
  expect(fake.capabilities.estimate).not.toHaveBeenCalled();
  expect(fake.outcomes.run).not.toHaveBeenCalled();
  expect(fake.call).not.toHaveBeenCalled();
});

it.each([
  undefined,
  0,
  50,
])('preserves typical price %s without changing the reminder cap', async (priceTypicalMicro) => {
  const estimate = {
    ready: true,
    canRun: true,
    plan: 'approved_plan',
    priceMaxMicro: 100,
    priceTypicalMicro,
    steps: [{ capability: 'sms.send', status: 'will_run' }],
  };
  fake.outcomes.estimate.mockResolvedValueOnce(estimate);
  const plan = await estimateReminder(input);
  const html = renderToStaticMarkup(createElement(EstimatePrice, plan));
  if (priceTypicalMicro === undefined) {
    expect(html).toContain('Maximum cost: $0.000100 USD.');
  } else {
    expect(html).toContain(`<strong>usually about $${(priceTypicalMicro / 1_000_000).toFixed(6)}</strong>`);
    expect(html).toContain('<small class="block">at most $0.000100</small>');
  }
  expect(plan.priceTypicalMicro).toBe(priceTypicalMicro);
  expect(plan.priceMaxMicro).toBe(100);
  expect(fake.outcomes.run).not.toHaveBeenCalled();
  fake.capabilities.estimate.mockResolvedValueOnce({ canRun: true, priceMaxMicro: 100, priceTypicalMicro } as never);
  const fallback = await estimateReminder(input, true);
  expect(fallback.priceTypicalMicro).toBe(priceTypicalMicro);
  await runReminder(input, fallback);
  expect(fake.call).toHaveBeenCalledWith(
    'sms.send',
    expect.anything(),
    expect.objectContaining({ maxPriceMicro: 100 }),
  );
});
