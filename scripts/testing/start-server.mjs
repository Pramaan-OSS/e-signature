import 'dotenv/config';
import { setPramaanClientForTests } from '../../packages/lib/server-only/pramaan.ts';
import { fakePramaan } from './fake-pramaan.ts';

process.env.NODE_ENV = 'test';
if (process.env.E_SIGN_TEST_PRESERVE_KEY !== '1') {
  process.env.PRAMAAN_API_KEY = 'test-only-fake-key';
}
setPramaanClientForTests(
  fakePramaan({
    failExtractionOnce: process.env.E_SIGN_TEST_EXTRACTION_FAILURE === 'once',
    unavailableCapabilities: (process.env.E_SIGN_TEST_UNAVAILABLE || '').split(',').filter(Boolean),
  }),
);
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (url.protocol !== 'data:' && !['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error('External HTTP is blocked during browser verification.');
  }
  return originalFetch(input, init);
};
process.chdir('apps/remix');
await import('../../apps/remix/build/server/main.js');
