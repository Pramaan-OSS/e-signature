// Compatibility helpers for file routes and accepted outcome reports absent from SDK 0.1.0.

import type {
  CapabilityId,
  Job,
  OutcomeRun,
  OutcomeRunStep,
  PramaanOptions,
  Requests,
  Results,
  RunOptions,
  OutcomeRunOptions as SdkOutcomeRunOptions,
} from '@pramaan/sdk';
import { DEFAULT_BASE_URL, PramaanError, Pramaan as PublishedPramaan } from '@pramaan/sdk';
export type OutcomeRunOptions = SdkOutcomeRunOptions & { readonly onJob?: (job: Job) => void | Promise<void> };
type Raw = Record<string, unknown>;
export function parseOutcomeRun(body: unknown): OutcomeRun {
  const raw = (body ?? {}) as Raw;
  const cost = raw.cost as Raw | undefined;
  if (typeof raw.outcome !== 'string' || typeof raw.status !== 'string' || !cost) {
    throw new PramaanError('internal', 'The API returned an unexpected run shape.');
  }
  return {
    outcome: raw.outcome,
    version: Number(raw.version ?? 1),
    plan: String(raw.plan),
    status: raw.status as OutcomeRun['status'],
    ...(typeof raw.completeness === 'string'
      ? { completeness: raw.completeness as NonNullable<OutcomeRun['completeness']> }
      : {}),
    ...('result' in raw ? { result: raw.result } : {}),
    evidence: (raw.evidence ?? {}) as Record<string, unknown>,
    missing: (raw.missing ?? []) as unknown[],
    steps: ((raw.steps ?? []) as Raw[]).map(
      (step): OutcomeRunStep => ({
        id: String(step.id),
        label: String(step.label),
        capability: String(step.capability),
        effectClass: step.effect_class as OutcomeRunStep['effectClass'],
        status: step.status as OutcomeRunStep['status'],
        calls: Number(step.calls ?? 0),
        effect: step.effect as OutcomeRunStep['effect'],
        ...(typeof step.reason === 'string' ? { reason: step.reason } : {}),
        ...(Array.isArray(step.errors) ? { errors: step.errors as NonNullable<OutcomeRunStep['errors']> } : {}),
      }),
    ),
    ...(raw.error ? { error: raw.error as NonNullable<OutcomeRun['error']> } : {}),
    cost: {
      holdMicro: Number(cost.hold_micro ?? 0),
      chargedMicro: Number(cost.charged_micro ?? 0),
      capabilities: ((cost.capabilities ?? []) as Raw[]).map((row) => ({
        id: String(row.id),
        calls: Number(row.calls ?? 0),
        chargedMicro: Number(row.charged_micro ?? 0),
      })),
    },
  };
}

export function createPramaan(options: PramaanOptions) {
  const client = new PublishedPramaan(options);
  const fetcher = options.fetch ?? ((url: string, init: RequestInit) => fetch(url, init));
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const files = {
    upload: async (
      bytes: Uint8Array,
      contentType: string,
      kind: 'document' | 'image' | 'part' = 'document',
      limitBytes = 25_000_000,
    ): Promise<{ fileId: string; url: string }> => {
      if (
        limitBytes > 100_000_000 ||
        limitBytes <= 0 ||
        bytes.byteLength > limitBytes ||
        (kind === 'part' && (bytes.byteLength > 8_388_608 || contentType !== 'application/octet-stream'))
      ) {
        throw new Error(`File exceeds ${limitBytes / 1_000_000} MB.`);
      }
      const response = await fetcher(`${baseUrl}/v1/files?kind=${kind}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': contentType },
        body: bytes as BodyInit,
      });
      const result = (await readBody(response)) as { fileId?: string; url?: string };
      if (!response.ok) {
        throw await errorFromResponse(response);
      }
      if (!result.fileId || (kind !== 'part' && !result.url)) {
        throw new Error('File upload could not be completed.');
      }
      return { fileId: result.fileId, url: kind === 'part' ? '' : result.url! };
    },
    delete: async (fileId: string): Promise<void> => {
      const response = await fetcher(`${baseUrl}/v1/files/${encodeURIComponent(fileId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${options.apiKey}` },
      });
      if (!response.ok && response.status !== 404) {
        throw await errorFromResponse(response);
      }
    },
    download: async (url: string, limitBytes = 25_000_000): Promise<Uint8Array> => {
      if (limitBytes > 100_000_000 || limitBytes <= 0) {
        throw new Error('Invalid file size limit.');
      }
      const target = new URL(url);
      if (target.origin !== new URL(baseUrl).origin || !target.pathname.startsWith('/files/')) {
        throw new Error('File address is not on Pramaan.');
      }
      const response = await fetcher(target.toString(), { redirect: 'error' });
      if (!response.ok) {
        throw new Error('File download could not be completed.');
      }
      const length = Number(response.headers.get('content-length'));
      if (length > limitBytes) {
        throw new Error(`File exceeds ${limitBytes / 1_000_000} MB.`);
      }
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('File has no content.');
      }
      const parts: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) {
          break;
        }
        total += chunk.value.byteLength;
        if (total > limitBytes) {
          await reader.cancel();
          throw new Error(`File exceeds ${limitBytes / 1_000_000} MB.`);
        }
        parts.push(chunk.value);
      }
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const part of parts) {
        bytes.set(part, offset);
        offset += part.byteLength;
      }
      return bytes;
    },
  };

  const api = client.outcomes;
  const outcomes = {
    ...api,
    run: async (id: string, input: unknown, opts: OutcomeRunOptions = {}): Promise<OutcomeRun> => {
      const started = await api.start(id, input, opts);
      if (!('id' in started)) {
        return started;
      }
      let job: Job;
      try {
        await opts.onJob?.(started);
        job = await client.jobs.wait(started.id, { timeoutMs: 36 * 60_000 });
      } catch (error) {
        if (error && typeof error === 'object') {
          Object.assign(error, { outcomeJobStarted: true, outcomeJobId: started.id });
        }
        throw error;
      }
      if (job.result !== undefined || job.status === 'done') {
        return parseOutcomeRun(job.result);
      }
      throw Object.assign(
        new PramaanError(
          job.error?.code ?? 'internal',
          job.error?.message ?? `The run ended with status "${job.status}".`,
          { effect: job.error?.effect },
        ),
        { outcomeJobStarted: true, outcomeJobId: started.id },
      );
    },
  };
  return Object.assign(client, { files, outcomes }) as Omit<typeof client, 'call' | 'outcomes'> & {
    outcomes: typeof outcomes;
    files: typeof files;
    call<Id extends CapabilityId>(id: Id, input: Requests[Id], opts?: RunOptions): Promise<Results[Id]>;
  };
}
async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new PramaanError('internal', 'The API returned a response that is not JSON.');
  }
}

function codeForStatus(status: number): import('@pramaan/sdk').ErrorCode {
  if (status === 400) {
    return 'invalid_request';
  }
  if (status === 401 || status === 403) {
    return 'unauthorized';
  }
  if (status === 402) {
    return 'spend_cap_reached';
  }
  if (status === 404) {
    return 'not_found';
  }
  if (status === 409) {
    return 'conflict';
  }
  if (status === 429) {
    return 'rate_limited';
  }
  if (status === 504) {
    return 'upstream_timeout';
  }
  if (status >= 500) {
    return 'upstream_unavailable';
  }
  return 'internal';
}

/** Builds a PramaanError from a non-2xx response: the API's envelope, or a status-based fallback. */
export async function errorFromResponse(response: Response): Promise<PramaanError> {
  const headerId = response.headers.get('x-request-id') ?? undefined;
  let envelope: Record<string, unknown> | undefined;
  try {
    const body = (await response.json()) as { error?: unknown };
    if (body && typeof body.error === 'object' && body.error !== null) {
      envelope = body.error as Record<string, unknown>;
    }
  } catch {
    // Not JSON (a proxy page, an empty body): fall back to the status.
  }
  const code =
    typeof envelope?.code === 'string' && CODES.has(envelope.code)
      ? (envelope.code as import('@pramaan/sdk').ErrorCode)
      : codeForStatus(response.status);
  const message =
    typeof envelope?.message === 'string' ? envelope.message : `The API answered with HTTP ${response.status}.`;
  return new PramaanError(code, message, {
    retryable:
      typeof envelope?.retryable === 'boolean' ? envelope.retryable : response.status === 429 || response.status >= 500,
    requestId: typeof envelope?.request_id === 'string' ? envelope.request_id : headerId,
    status: response.status,
    slot: typeof envelope?.slot === 'string' ? envelope.slot : undefined,
    reason: typeof envelope?.reason === 'string' ? envelope.reason : undefined,
    effect: envelope?.effect === 'none' ? 'none' : undefined,
  });
}

const CODES: ReadonlySet<string> = new Set<import('@pramaan/sdk').ErrorCode>([
  'invalid_request',
  'not_found',
  'upstream_unavailable',
  'upstream_timeout',
  'internal',
  'unauthorized',
  'forbidden',
  'spend_cap_reached',
  'rate_limited',
  'conflict',
  'connection_required',
  'job_not_found',
]);

// Three results are unknown in the published generated contracts; retain used fields.
type HostedFile = { fileId: string; url: string; expiresAt: string; contentType: string; sizeBytes: number };
interface LocalResults {
  'storage.object.get': {
    bucket: string;
    path: string;
    sizeBytes: number;
    contentType?: string;
    content?: string;
    file?: HostedFile;
  };
  'document.convert': { file: HostedFile; pageCount?: number };
  'document.convert-bulk': {
    results?: Array<{
      id: string;
      found: boolean;
      error?: { code: string; message: string };
      file?: HostedFile;
      pageCount?: number;
    }>;
    summary: { total: number; found: number; notFound: number; failed: number };
    resultFile?: HostedFile;
  };
}
export type CapabilityResult<Id extends CapabilityId> = Id extends keyof LocalResults ? LocalResults[Id] : Results[Id];
