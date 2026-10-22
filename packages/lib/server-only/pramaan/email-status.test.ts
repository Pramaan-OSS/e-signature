import { afterEach, expect, it, vi } from 'vitest';
import { callPramaan, setPramaanClientForTests } from '../pramaan';

afterEach(() => setPramaanClientForTests(undefined));
it('explains unsupported delivery tracking without claiming the email failed', async () => {
  const call = vi
    .fn()
    .mockRejectedValue({ code: 'invalid_request', message: 'This capability is not available for this reference.' });
  setPramaanClientForTests({ call } as never);
  await expect(callPramaan('email.status', { ref: 'owned' })).rejects.toMatchObject({
    code: 'upstream_unavailable',
    effect: 'none',
    message: 'Delivery tracking is not available yet for this email.',
  });
  expect(call).toHaveBeenCalledOnce();
});
it('keeps other invalid status requests distinct from unavailable tracking', async () => {
  const call = vi.fn().mockRejectedValue({ code: 'invalid_request', message: 'Bad input' });
  setPramaanClientForTests({ call } as never);
  await expect(callPramaan('email.status', { ref: 'owned' })).rejects.toMatchObject({ code: 'invalid_request' });
  expect(call).toHaveBeenCalledOnce();
});
