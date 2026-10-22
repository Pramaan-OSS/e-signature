import { afterEach, expect, it, vi } from 'vitest';
import { callPramaan, setPramaanClientForTests } from '../pramaan';
import { preparePramaanSchemas } from './json-schema';

afterEach(() => setPramaanClientForTests(undefined));
it.each([
  'llm.chat',
  'llm.complete',
])('%s rejects incomplete free-text and structured replies before returning a result', async (id) => {
  const call = vi.fn(async () => ({ text: '{"unfinished":', finishReason: 'length' }));
  setPramaanClientForTests({ call } as never);
  for (const extra of [{}, { jsonSchema: { type: 'object', properties: {} } }]) {
    await expect(
      callPramaan(id as never, { messages: [{ role: 'user', content: 'Hello' }], ...extra } as never),
    ).rejects.toMatchObject({
      code: 'incomplete_reply',
      retryable: true,
      message: expect.stringContaining('incomplete'),
    });
  }
  expect(call).toHaveBeenCalledTimes(2);
});
it.each(['llm.chat', 'llm.complete'])('%s reports an empty reply-limit refusal without retrying', async (id) => {
  const call = vi.fn(async () => {
    throw { code: 'invalid_request', status: 400, message: 'maxTokens reached' };
  });
  setPramaanClientForTests({ call } as never);
  await expect(
    callPramaan(id as never, { messages: [{ role: 'user', content: 'Hello' }] } as never),
  ).rejects.toMatchObject({ code: 'reply_limit_configuration', retryable: false });
  expect(call).toHaveBeenCalledOnce();
});
it.each(['llm.chat', 'llm.complete'])('%s defaults to 256 and retains the hard minimum of 64', (id) => {
  const messages = [{ role: 'user', content: 'Hello' }];
  expect(preparePramaanSchemas(id, { messages })).toHaveProperty('maxTokens', 256);
  expect(preparePramaanSchemas(id, { messages, maxTokens: 64 })).toHaveProperty('maxTokens', 64);
  expect(() => preparePramaanSchemas(id, { messages, maxTokens: 63 })).toThrow('/maxTokens');
});

it('rejects a length-ended tool reply without returning partial arguments', async () => {
  const call = vi.fn(async () => ({ finishReason: 'length', toolCalls: [{ arguments: '{"unfinished":' }] }));
  setPramaanClientForTests({ call } as never);
  await expect(
    callPramaan(
      'llm.chat' as never,
      {
        messages: [{ role: 'user', content: 'Hello' }],
        tools: [{ name: 'choose_fields', parameters: { type: 'object', properties: {} } }],
      } as never,
    ),
  ).rejects.toMatchObject({ code: 'incomplete_reply', retryable: true });
  expect(call).toHaveBeenCalledOnce();
});
