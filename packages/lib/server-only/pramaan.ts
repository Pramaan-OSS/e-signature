import { AppError } from '../errors/app-error';
import { preparePramaanSchemas } from './pramaan/json-schema';
import './pramaan/extraction-schemas';
import type {
  CapabilityId,
  Job,
  OutcomeDescription,
  OutcomeEstimate,
  OutcomeRun,
  OutcomeSummary,
  Requests,
  Results,
  RunOptions,
} from '@pramaan/sdk';
import { type CapabilityResult, createPramaan, type OutcomeRunOptions, parseOutcomeRun } from './pramaan/sdk-compat';

export interface CapabilityClient {
  jobs?: { get(id: string): Promise<Job>; cancel(id: string): Promise<Job> };
  outcomes?: {
    list(): Promise<OutcomeSummary[]>;
    get(id: string): Promise<OutcomeDescription>;
    estimate(id: string, input: unknown, options?: OutcomeRunOptions): Promise<OutcomeEstimate>;
    run(id: string, input: unknown, options?: OutcomeRunOptions): Promise<OutcomeRun>;
  };
  capabilities?: {
    estimate(
      id: string,
      input: unknown,
    ): Promise<{ priceMaxMicro: number; priceTypicalMicro?: number; canRun: boolean }>;
  };

  files?: {
    upload(
      bytes: Uint8Array,
      contentType: string,
      kind?: 'document' | 'image' | 'part',
      limitBytes?: number,
    ): Promise<{ fileId: string; url: string }>;
    delete?(fileId: string): Promise<void>;
    download(url: string, limitBytes?: number): Promise<Uint8Array>;
  };
  call<Id extends CapabilityId>(id: Id, input: Requests[Id], options?: RunOptions): Promise<Results[Id]>;
}
declare global {
  var __eSignTestPramaanClient: CapabilityClient | undefined;
}
let client: CapabilityClient | undefined;
export const pramaanConfigured = () => Boolean(process.env.PRAMAAN_API_KEY);
export const setPramaanClientForTests = (fake: CapabilityClient | undefined) => {
  if (Reflect.get(process.env, 'NODE_ENV') !== 'test') {
    throw new Error('Test clients require test mode.');
  }
  client = fake;
  globalThis.__eSignTestPramaanClient = fake;
};
function getClient(): CapabilityClient {
  if (typeof window !== 'undefined') {
    throw new Error('External actions require the app server.');
  }
  if (Reflect.get(process.env, 'NODE_ENV') === 'test' && globalThis.__eSignTestPramaanClient) {
    return globalThis.__eSignTestPramaanClient;
  }
  if (client) {
    return client;
  }
  if (!process.env.PRAMAAN_API_KEY) {
    throw new Error('Add PRAMAAN_API_KEY to enable this action.');
  }
  client = createPramaan({ apiKey: process.env.PRAMAAN_API_KEY, baseUrl: process.env.PRAMAAN_BASE_URL, maxRetries: 0 });
  return client!;
}
/** Action ids must be persisted by the caller and reused on retries. */
export async function callPramaan<Id extends CapabilityId>(
  id: Id,
  input: Requests[Id],
  options?: RunOptions,
): Promise<CapabilityResult<Id>> {
  const ready = preparePramaanSchemas(id, input) as Requests[Id];
  try {
    const result = await getClient().call(id, ready, options);
    if (
      (String(id) === 'llm.chat' || String(id) === 'llm.complete') &&
      result &&
      typeof result === 'object' &&
      'finishReason' in result &&
      result.finishReason === 'length'
    ) {
      throw Object.assign(new Error('The reply is incomplete. Try again with a larger reply limit.'), {
        code: 'incomplete_reply',
        retryable: true,
      });
    }
    return result as CapabilityResult<Id>;
  } catch (error) {
    // Never expose upstream account names, keys, prices, URLs or raw errors.
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : 'unavailable';
    if (
      code === 'invalid_request' &&
      error &&
      typeof error === 'object' &&
      'message' in error &&
      /Idempotency-Key[^.]*required/i.test(String(error.message))
    ) {
      throw Object.assign(new Error('This action was refused because a saved request identifier is required.'), {
        code,
        reason: 'idempotency_key_required',
        effect: 'none',
      });
    }
    if (
      id === 'email.status' &&
      code === 'invalid_request' &&
      error &&
      typeof error === 'object' &&
      'message' in error &&
      /not available for this reference/i.test(String(error.message))
    ) {
      throw Object.assign(new Error('Delivery tracking is not available yet for this email.'), {
        code: 'upstream_unavailable',
        effect: 'none',
      });
    }
    if (code === 'incomplete_reply') {
      throw error;
    }
    if (
      (String(id) === 'llm.chat' || String(id) === 'llm.complete') &&
      code === 'invalid_request' &&
      error &&
      typeof error === 'object' &&
      'message' in error &&
      /maxTokens/i.test(String(error.message))
    ) {
      throw Object.assign(new Error('The reply limit is too small. Change the reply limit before trying again.'), {
        code: 'reply_limit_configuration',
        retryable: false,
      });
    }
    throw Object.assign(
      code === 'upstream_unavailable'
        ? new AppError(code, {
            message: 'This feature is not available yet. Check its status before trying again.',
            userMessage: 'This feature is not available yet. Check its status before trying again.',
            statusCode: 503,
          })
        : new Error('This action could not be completed. Check its status before trying again.'),
      {
        code: /^[a-z_]+$/.test(code) ? code : 'unavailable',
        reason:
          error && typeof error === 'object' && 'reason' in error && error.reason === 'approval_required'
            ? 'approval_required'
            : undefined,
        effect: error && typeof error === 'object' && 'effect' in error && error.effect === 'none' ? 'none' : undefined,
        protectedFile: error instanceof Error && /password[- ]protected|encrypted/i.test(error.message),
      },
    );
  }
}

export async function uploadPramaanFile(
  bytes: Uint8Array,
  contentType: string,
  kind: 'document' | 'image' | 'part' = 'document',
  limitBytes?: number,
) {
  const files = getClient().files;
  if (!files) {
    throw new Error('File uploads are unavailable.');
  }
  try {
    return await files.upload(bytes, contentType, kind, limitBytes);
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'unavailable';
    if (code === 'not_found' || code === 'upstream_unavailable') {
      throw Object.assign(new Error('File storage is not available yet. Use a PDF stored in the database.'), {
        code: 'upstream_unavailable',
        effect: 'none',
      });
    }
    throw Object.assign(new Error('File upload could not be completed.'), {
      code: /^[a-z_]+$/.test(code) ? code : 'unavailable',
    });
  }
}
export async function downloadPramaanFile(url: string, limitBytes?: number) {
  const files = getClient().files;
  if (!files) {
    throw new Error('File downloads are unavailable.');
  }
  try {
    return await files.download(url, limitBytes);
  } catch {
    throw new Error('File download could not be completed.');
  }
}

function neutralOutcomeError(error: unknown): Error {
  const raw = error && typeof error === 'object' ? (error as Record<string, unknown>) : {};
  return Object.assign(
    new Error('This request could not be completed. Check its recorded effects before trying again.'),
    {
      status: typeof raw.status === 'number' ? raw.status : undefined,
      outcomeJobStarted: raw.outcomeJobStarted === true,
      code: typeof raw.code === 'string' && /^[a-z_]+$/.test(raw.code) ? raw.code : 'unavailable',
      effect: raw.effect === 'none' ? 'none' : 'unknown',
      outcomeJobId: typeof raw.outcomeJobId === 'string' ? raw.outcomeJobId : undefined,
    },
  );
}
async function outcomeCall<T>(call: (api: NonNullable<CapabilityClient['outcomes']>) => Promise<T>): Promise<T> {
  try {
    const api = getClient().outcomes;
    if (!api) {
      throw Object.assign(new Error(), { code: 'not_found', effect: 'none' });
    }
    return await call(api);
  } catch (error) {
    throw neutralOutcomeError(error);
  }
}
export const listPramaanOutcomes = () => outcomeCall((api) => api.list());
export const getPramaanOutcome = (id: string) => outcomeCall((api) => api.get(id));
export const estimatePramaanOutcome = (id: string, input: unknown, options?: OutcomeRunOptions) => {
  const ready = preparePramaanSchemas(`outcome:${id}`, input);
  return outcomeCall((api) => api.estimate(id, ready, options));
};
export const runPramaanOutcome = (id: string, input: unknown, options?: OutcomeRunOptions) => {
  const ready = preparePramaanSchemas(`outcome:${id}`, input);
  return outcomeCall((api) => api.run(id, ready, options));
};
export async function estimatePramaanCapability(id: string, input: unknown) {
  const ready = preparePramaanSchemas(id, input);
  try {
    const api = getClient().capabilities;
    if (!api) {
      throw new Error();
    }
    return await api.estimate(id, ready);
  } catch (error) {
    throw neutralOutcomeError(error);
  }
}

export async function deletePramaanFile(fileId: string) {
  const files = getClient().files;
  if (!files?.delete) {
    throw new Error('Staged file cleanup is unavailable.');
  }
  try {
    await files.delete(fileId);
  } catch {
    throw new Error('Staged file cleanup could not be completed.');
  }
}

export async function readPramaanJob(id: string, cancel = false): Promise<Job<OutcomeRun>> {
  try {
    const jobs = getClient().jobs;
    if (!jobs) {
      throw new Error('Saved runs are unavailable.');
    }
    const job = await (cancel ? jobs.cancel(id) : jobs.get(id));
    return { ...job, ...(job.result !== undefined ? { result: parseOutcomeRun(job.result) } : {}) } as Job<OutcomeRun>;
  } catch (error) {
    throw neutralOutcomeError(error);
  }
}
