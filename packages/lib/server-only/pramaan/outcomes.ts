import type { Job, OutcomeRun } from '@pramaan/sdk';
import {
  callPramaan,
  estimatePramaanCapability,
  estimatePramaanOutcome,
  getPramaanOutcome,
  runPramaanOutcome,
} from '../pramaan';
import type { ActionInput } from './actions';

export type ReminderPlan = {
  kind: 'outcome' | 'capability';
  plan?: string;
  expiresAt: number;
  input: { phone: string; message: string; plainSms: true };
  priceMaxMicro: number;
  priceTypicalMicro?: number;
  steps: string[];
};
const basis = { ground: 'consent' as const };
function reminderInput(input: ActionInput): ReminderPlan['input'] {
  if (!input.consent || !input.phone || !input.message) {
    throw new Error('Add a phone number, message and consent.');
  }
  return { phone: input.phone, message: input.message, plainSms: true };
}
export async function estimateReminder(input: ActionInput, fallback = false): Promise<ReminderPlan> {
  const body = reminderInput(input);
  if (!fallback) {
    try {
      const description = await getPramaanOutcome('notify.send');
      if (description.available) {
        const estimate = await estimatePramaanOutcome('notify.send', body, { basis, options: { confirm: true } });
        if ((!estimate.ready || !estimate.canRun) && estimate.reason === 'connection_required') {
          throw new ReminderUnavailable(
            'Text reminders are not available yet. A connected messaging account is required.',
          );
        }
        if (!estimate.ready || !estimate.canRun || !estimate.plan || !Number.isFinite(estimate.priceMaxMicro)) {
          throw new Error('Estimate is not ready.');
        }
        // Labels are local: upstream descriptions can contain account or platform names.
        const labels: Record<string, string> = {
          'sms.send': 'Send the text reminder',
          'sms.status': 'Read its delivery state once',
        };
        const selected = estimate.steps.filter((step) => step.status === 'will_run');
        if (
          !selected.some((step) => step.capability === 'sms.send') ||
          selected.some((step) => !labels[step.capability])
        ) {
          throw new Error('Estimate is not ready.');
        }
        return {
          kind: 'outcome',
          plan: estimate.plan,
          input: body,
          expiresAt: Date.now() + 15 * 60_000,
          priceMaxMicro: estimate.priceMaxMicro,
          priceTypicalMicro: estimate.priceTypicalMicro,
          steps: selected.map((step) => labels[step.capability]),
        };
      }
    } catch (error) {
      // Discovery/estimate never acts. Only explicit service unavailability enables fallback.
      const raw = error as { code?: string; status?: number };
      if (raw.status === 429) {
        throw new ReminderTryLater('The service is busy. Try again later.');
      }
      if (!['not_found', 'upstream_unavailable'].includes(raw.code || '')) {
        throw error;
      }
    }
  }
  const estimate = await estimatePramaanCapability('sms.send', { to: body.phone, body: body.message });
  if (!estimate.canRun || !Number.isFinite(estimate.priceMaxMicro)) {
    throw new Error('Estimate is not ready.');
  }
  return {
    kind: 'capability',
    input: body,
    expiresAt: Date.now() + 15 * 60_000,
    priceMaxMicro: estimate.priceMaxMicro,
    priceTypicalMicro: estimate.priceTypicalMicro,
    steps: ['Send the text reminder', 'Check delivery later using the saved request'],
  };
}
export class ReminderUnavailable extends Error {}
export class ReminderReapproval extends Error {}
export class ReminderTryLater extends Error {}
export async function runReminder(
  input: ActionInput,
  approved: ReminderPlan,
  onJob?: (job: Job) => Promise<void>,
): Promise<unknown> {
  if (!input.approveOutcome || !input.confirm) {
    throw new Error('Approve the displayed estimate first.');
  }
  if (approved.expiresAt <= Date.now() || JSON.stringify(reminderInput(input)) !== JSON.stringify(approved.input)) {
    throw new ReminderReapproval('Review a new estimate.');
  }
  if (approved.kind === 'capability') {
    return callPramaan(
      'sms.send',
      { to: approved.input.phone, body: approved.input.message },
      {
        idempotencyKey: input.operationId,
        ...(approved.priceMaxMicro > 0 ? { maxPriceMicro: approved.priceMaxMicro } : {}),
      },
    );
  }
  try {
    if (!(await getPramaanOutcome('notify.send')).available) {
      throw new ReminderReapproval('Review a new estimate.');
    }
    const report = await runPramaanOutcome('notify.send', approved.input, {
      basis,
      options: { confirm: true },
      plan: approved.plan,
      idempotencyKey: input.operationId,
      ...(onJob ? { onJob } : {}),
    });
    return reminderReport(report);
  } catch (error) {
    if (error instanceof ReminderReapproval) {
      throw error;
    }
    const raw = error as { status?: number; effect?: string; code?: string; outcomeJobStarted?: boolean };
    if (raw.outcomeJobStarted) {
      throw error;
    }
    if (raw.status === 429) {
      throw new ReminderTryLater('The service is busy. Try again later.');
    }
    // No immediate send fallback: even safe refusals require a newly displayed approval.
    if (
      (raw.status === 502 && raw.code === 'upstream_unavailable') ||
      (raw.effect === 'none' &&
        (raw.status === 403 || raw.status === 409 || ['not_found', 'upstream_unavailable'].includes(raw.code || '')))
    ) {
      throw new ReminderReapproval('Review a new estimate.');
    }
    throw error;
  }
}

export function reminderReport(report: OutcomeRun) {
  // Preserve neutral observations and effect history, including failed/partial reports.
  const result = report.result as { sent?: { status?: string }; delivery?: { status?: string } } | undefined;
  return {
    timedOut: report.error?.code === 'upstream_timeout',
    needsCheck: report.steps.some((step) => !['none', 'done'].includes(step.effect)),
    message: report.steps.some((step) => !['none', 'done'].includes(step.effect))
      ? 'A step may have acted. Check before retrying.'
      : null,
    status: report.status === 'done' ? result?.delivery?.status || result?.sent?.status || 'unknown' : report.status,
    outcome: 'notify.send',
    runStatus: report.status,
    completeness: report.completeness || null,
    delivery: result?.delivery?.status || null,
    observedAt: new Date().toISOString(),
    steps: report.steps.map((s) => ({
      capability: s.capability,
      status: s.status,
      calls: s.calls,
      effect: s.effect === 'none' || s.effect === 'done' ? s.effect : 'unknown',
    })),
    chargedMicro: report.cost.chargedMicro,
    laterDeliveryLookup: false,
  };
}
