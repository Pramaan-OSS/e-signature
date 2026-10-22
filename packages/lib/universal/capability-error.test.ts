import { expect, it } from 'vitest';
import { capabilityFailureMessage } from './capability-error';

it('shows a plain unavailable message from direct and serialized domain errors without exposing details', () => {
  for (const e of [
    { code: 'upstream_unavailable', message: 'Private source detail' },
    { name: 'TRPCClientError', data: { appError: { code: 'upstream_unavailable', message: 'Private source detail' } } },
  ]) {
    expect(capabilityFailureMessage(e, 'Could not finish.')).toBe('This feature is not available yet. Try later.');
  }
  expect(capabilityFailureMessage({ code: 'ALREADY_EXISTS' }, 'Already exists.')).toBe('Already exists.');
});
