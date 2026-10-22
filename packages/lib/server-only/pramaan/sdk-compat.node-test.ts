import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPramaan } from './sdk-compat';

test('actions carry the stable key and async jobs are polled', async () => {
  const seen: { url: string; init: RequestInit }[] = [];
  const p = createPramaan({
    apiKey: 'fake',
    baseUrl: 'http://fake.local',
    maxRetries: 0,
    sleep: async () => {},
    fetch: async (url, init) => {
      seen.push({ url, init });
      return Response.json(
        url.includes('/jobs/')
          ? { job_id: 'job_owned', status: 'done', result: { ref: 'request_owned' } }
          : { job_id: 'job_owned', status: 'running' },
        { status: url.includes('/jobs/') ? 200 : 202 },
      );
    },
  });
  assert.deepEqual(await p.call('signature.request.send', {}, { idempotencyKey: 'stable-action' }), {
    ref: 'request_owned',
  });
  assert.equal(new Headers(seen[0].init.headers).get('Idempotency-Key'), 'stable-action');
  assert.ok(seen[1].url.endsWith('/v1/jobs/job_owned'));
});
test('private file downloads reject other origins before fetching', async () => {
  let called = false;
  const p = createPramaan({
    apiKey: 'fake',
    fetch: async () => {
      called = true;
      return Response.json({});
    },
  });
  await assert.rejects(p.files.download('https://outside.example.test/files/private'));
  assert.equal(called, false);
});
test('files over the storage limit are rejected before fetching', async () => {
  const p = createPramaan({
    apiKey: 'fake',
    fetch: async () => {
      throw new Error('should not fetch');
    },
  });
  await assert.rejects(p.files.upload(new Uint8Array(25_000_001), 'application/pdf'), /25 MB/);
});
const rawEstimate = {
  outcome: 'notify.send',
  plan: 'plan_same',
  ready: true,
  can_run: true,
  price_max_micro: 120,
  requires_approval: true,
  steps: [],
};
const rawReport = {
  outcome: 'notify.send',
  plan: 'plan_same',
  status: 'done',
  result: { channel: 'sms', delivery: { status: 'delivered' } },
  steps: [],
  cost: { hold_micro: 120, charged_micro: 90, capabilities: [] },
};
test('outcome discovery, estimate and approved run keep the identical input and allowed headers', async () => {
  const seen: { url: string; init: RequestInit }[] = [];
  const p = createPramaan({
    apiKey: 'fake',
    maxRetries: 0,
    fetch: async (url, init) => {
      seen.push({ url, init });
      return Response.json(
        url.endsWith('/estimate')
          ? rawEstimate
          : init.method === 'GET'
            ? url.endsWith('/outcomes')
              ? { results: [{ id: 'notify.send', available: true }] }
              : { id: 'notify.send', available: true, steps: [] }
            : rawReport,
      );
    },
  });
  assert.equal((await p.outcomes.list())[0].available, true);
  assert.equal((await p.outcomes.get('notify.send')).available, true);
  const input = { phone: '+441234567890', message: 'Sign please', plainSms: true };
  const opts = { basis: { ground: 'consent' as const }, options: { confirm: true } };
  const estimate = await p.outcomes.estimate('notify.send', input, opts);
  assert.equal(estimate.priceMaxMicro, 120);
  assert.equal(
    (await p.outcomes.run('notify.send', input, { ...opts, plan: estimate.plan, idempotencyKey: 'stable' })).status,
    'done',
  );
  assert.equal(seen[2].init.body, seen[3].init.body);
  const headers = new Headers(seen[3].init.headers);
  assert.equal(headers.get('Pramaan-Plan'), 'plan_same');
  assert.equal(headers.get('Idempotency-Key'), 'stable');
  for (const name of ['Pramaan-Account', 'Pramaan-End-User', 'Pramaan-End-User-Group', 'Pramaan-Max-Price-Micro']) {
    assert.equal(headers.get(name), null);
  }
});
test('202 outcome response polls the owned job until its run report is ready', async () => {
  let polls = 0;
  const p = createPramaan({
    apiKey: 'fake',
    sleep: async () => {},
    fetch: async (url) => {
      if (url.includes('/jobs/')) {
        return Response.json(
          ++polls === 1
            ? { job_id: 'outcome_job', status: 'running' }
            : { job_id: 'outcome_job', status: 'done', result: rawReport },
        );
      }
      return Response.json({ job_id: 'outcome_job', status: 'running' }, { status: 202 });
    },
  });
  assert.equal(
    (await p.outcomes.run('notify.send', {}, { plan: 'plan_same', idempotencyKey: 'stable' })).status,
    'done',
  );
  assert.equal(polls, 2);
});
for (const [status, code, reason] of [
  [403, 'forbidden', 'approval_required'],
  [409, 'conflict', 'plan_changed'],
] as const) {
  test(`outcome ${status} preserves refusal status and effect without retrying`, async () => {
    let calls = 0;
    const p = createPramaan({
      apiKey: 'fake',
      fetch: async () => {
        calls++;
        return Response.json({ error: { code, reason, effect: 'none' } }, { status });
      },
    });
    await assert.rejects(
      p.outcomes.run(
        'notify.send',
        { message: status === 409 ? 'changed' : 'same' },
        status === 403 ? {} : { plan: 'old' },
      ),
      (error: unknown) => {
        const e = error as { status: number; code: string; effect: string };
        return e.status === status && e.code === code && e.effect === 'none';
      },
    );
    assert.equal(calls, 1);
  });
}
test('outcome unavailable flag is preserved by list and get', async () => {
  const p = createPramaan({
    apiKey: 'fake',
    fetch: async (url) =>
      Response.json(
        url.endsWith('/outcomes')
          ? { results: [{ id: 'contract.send.sign', available: false }] }
          : { id: 'contract.send.sign', available: false },
      ),
  });
  assert.equal((await p.outcomes.list())[0].available, false);
  assert.equal((await p.outcomes.get('contract.send.sign')).available, false);
});

test('polling refusal records that the outcome job already started', async () => {
  const p = createPramaan({
    apiKey: 'fake',
    maxRetries: 0,
    fetch: async (url) =>
      url.includes('/jobs/')
        ? Response.json({ error: { code: 'rate_limited', effect: 'none' } }, { status: 429 })
        : Response.json({ job_id: 'already_started', status: 'running' }, { status: 202 }),
  });
  await assert.rejects(
    p.outcomes.run('notify.send', {}, { plan: 'approved', idempotencyKey: 'same' }),
    (error: unknown) => {
      const e = error as { status: number; outcomeJobStarted: boolean };
      return e.status === 429 && e.outcomeJobStarted === true;
    },
  );
});
test('cancelled outcome job preserves its report and completed effects', async () => {
  const report = {
    ...rawReport,
    status: 'failed',
    steps: [{ id: 'send', capability: 'sms.send', status: 'ok', calls: 1, effect: 'done' }],
  };
  const p = createPramaan({
    apiKey: 'fake',
    fetch: async (url) =>
      url.includes('/jobs/')
        ? Response.json({ job_id: 'cancelled_job', status: 'cancelled', result: report })
        : Response.json({ job_id: 'cancelled_job', status: 'running' }, { status: 202 }),
  });
  const run = await p.outcomes.run('notify.send', {}, { plan: 'approved', idempotencyKey: 'same' });
  assert.equal(run.status, 'failed');
  assert.equal(run.steps[0].effect, 'done');
});

test('Word conversion follows the asynchronous job contract', async () => {
  const seen: string[] = [];
  const result = {
    file: {
      fileId: 'converted',
      url: 'http://fake.local/files/pdf',
      contentType: 'application/pdf',
      sizeBytes: 20,
      expiresAt: '2030-01-01',
    },
    pageCount: 1,
  };
  const p = createPramaan({
    apiKey: 'fake',
    baseUrl: 'http://fake.local',
    maxRetries: 0,
    sleep: async () => {},
    fetch: async (url) => {
      seen.push(url);
      return url.includes('/jobs/')
        ? Response.json({ job_id: 'word_job', status: 'done', result })
        : Response.json({ job_id: 'word_job', status: 'running' }, { status: 202 });
    },
  });
  assert.deepEqual(await p.call('document.convert', { file: 'word', targetFormat: 'pdf' }), result);
  assert.ok(seen[1].endsWith('/v1/jobs/word_job'));
});
test('conversion permits explicit 100 MB staging while storage retains its default limit', async () => {
  let calls = 0;
  const p = createPramaan({
    apiKey: 'fake',
    baseUrl: 'http://fake.local',
    fetch: async () => {
      calls++;
      return Response.json({ fileId: 'word', url: 'http://fake.local/files/word' });
    },
  });
  const bytes = new Uint8Array(25_000_001);
  await assert.rejects(p.files.upload(bytes, 'application/pdf'));
  assert.equal(calls, 0);
  await p.files.upload(
    bytes,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'document',
    100_000_000,
  );
  assert.equal(calls, 1);
  await assert.rejects(p.files.upload(bytes, 'application/pdf', 'document', 100_000_001));
});

test('raw part staging needs no signed URL and uses kind=part; deletion frees quota', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const p = createPramaan({
    apiKey: 'fake',
    baseUrl: 'http://fake.local',
    maxRetries: 0,
    fetch: async (url, init) => {
      calls.push({ url, init });
      return init.method === 'DELETE'
        ? new Response(null, { status: 204 })
        : Response.json({ fileId: 'raw_part', kind: 'part', sizeBytes: 4 });
    },
  });
  assert.deepEqual(
    await p.files.upload(new Uint8Array([0, 255, 0, 128]), 'application/octet-stream', 'part', 8_388_608),
    { fileId: 'raw_part', url: '' },
  );
  assert.equal(calls[0].url, 'http://fake.local/v1/files?kind=part');
  assert.equal(new Headers(calls[0].init.headers).get('Content-Type'), 'application/octet-stream');
  await p.files.delete('raw_part');
  assert.equal(calls[1].url, 'http://fake.local/v1/files/raw_part');
  assert.equal(calls[1].init.method, 'DELETE');
  await assert.rejects(p.files.upload(new Uint8Array(8_388_609), 'application/octet-stream', 'part', 100_000_000));
  await assert.rejects(p.files.upload(new Uint8Array(4), 'application/pdf', 'part', 8_388_608));
});

test('accepted outcome jobs are saved before polling and cancellation preserves completed effects', async () => {
  const seen: string[] = [];
  const p = createPramaan({
    apiKey: 'fake',
    maxRetries: 0,
    fetch: async (url, init) => {
      seen.push(`${init.method} ${new URL(url).pathname}`);
      if (url.endsWith('/cancel')) {
        return Response.json({
          job_id: 'owned_job',
          status: 'cancelled',
          result: {
            ...rawReport,
            status: 'cancelled',
            steps: [{ capability: 'sms.send', status: 'ok', effect: 'done' }],
          },
        });
      }
      if (url.includes('/jobs/')) {
        return Response.json({ job_id: 'owned_job', status: 'done', result: rawReport });
      }
      return Response.json({ job_id: 'owned_job', status: 'running' }, { status: 202 });
    },
  });
  await p.outcomes.run(
    'notify.send',
    {},
    {
      onJob: async (job) => {
        assert.equal(job.id, 'owned_job');
        assert.equal(seen.length, 1);
      },
    },
  );
  const cancelled = await p.jobs.cancel('owned_job');
  assert.equal(cancelled.status, 'cancelled');
  assert.equal((cancelled.result as typeof rawReport & { steps: { effect: string }[] }).steps[0].effect, 'done');
  assert.equal(seen.filter((x) => x === 'POST /v1/outcomes/notify.send').length, 1);
  assert.equal(seen.filter((x) => x === 'POST /v1/jobs/owned_job/cancel').length, 1);
});

test('a 35-minute failed job report retains unknown effects without another outcome start', async () => {
  let starts = 0;
  const p = createPramaan({
    apiKey: 'fake',
    maxRetries: 0,
    fetch: async (url) => {
      if (url.includes('/jobs/')) {
        return Response.json({
          job_id: 'timed_job',
          status: 'failed',
          error: { code: 'upstream_timeout', message: 'Expired' },
          result: {
            ...rawReport,
            status: 'failed',
            error: { code: 'upstream_timeout' },
            steps: [{ capability: 'sms.send', status: 'failed', effect: 'unknown' }],
          },
        });
      }
      starts++;
      return Response.json({ job_id: 'timed_job', status: 'running' }, { status: 202 });
    },
  });
  const report = await p.outcomes.run('notify.send', {});
  assert.equal(report.status, 'failed');
  assert.equal(report.steps[0].effect, 'unknown');
  assert.equal(starts, 1);
});

test('enterprise connection contracts send approval keys and connection-bound state without extra identity headers', async () => {
  const seen: { url: string; init: RequestInit }[] = [];
  const p = createPramaan({
    apiKey: 'fake',
    maxRetries: 0,
    fetch: async (url, init) => {
      seen.push({ url, init });
      return Response.json({ providerKey: 'enterprise', subjectId: 'test_member', emailVerified: false });
    },
  });
  await p.call(
    'auth.enterprise-connection.create',
    {
      organizationRef: 'owned_org',
      name: 'Organisation connection',
      issuer: 'https://login.example.test',
      clientId: 'test-client',
      tokenAuthMethod: 'none',
      redirectUris: ['https://app.example.test/callback'],
    },
    { idempotencyKey: 'create-owned' },
  );
  await p.call('auth.enterprise-connections.list', { organizationRef: 'owned_org', limit: 50 });
  await p.call(
    'auth.enterprise-connection.delete',
    { ref: 'owned_connection', confirm: true },
    { idempotencyKey: 'delete-owned' },
  );
  await p.call('auth.enterprise.start', {
    connectionRef: 'owned_connection',
    redirectUri: 'https://app.example.test/callback',
    state: 's'.repeat(43),
    nonce: 'n'.repeat(43),
    codeChallenge: 'c'.repeat(43),
  });
  await p.call('auth.social.exchange', {
    providerKey: 'enterprise',
    connectionRef: 'owned_connection',
    state: 's'.repeat(43),
    code: 'test-code',
    redirectUri: 'https://app.example.test/callback',
    pkceVerifier: 'v'.repeat(43),
    expectedNonce: 'n'.repeat(43),
  });
  assert.equal(new Headers(seen[0].init.headers).get('Idempotency-Key'), 'create-owned');
  assert.equal(new Headers(seen[2].init.headers).get('Idempotency-Key'), 'delete-owned');
  assert.equal(JSON.parse(String(seen[4].init.body)).state, 's'.repeat(43));
  assert.equal(seen.length, 5);
});

test('digest signing and timestamp contracts keep routing, approval and digest-only inputs', async () => {
  const seen: { url: string; init: RequestInit }[] = [];
  const p = createPramaan({
    apiKey: 'fake',
    baseUrl: 'https://platform.example.test',
    maxRetries: 0,
    fetch: async (url, init) => {
      seen.push({ url, init });
      return Response.json(
        url.includes('signature.digest.sign')
          ? {
              signatureBase64: 'AQIDBA==',
              algorithm: 'rsa-pkcs1-sha256',
              encoding: 'raw',
              publicKeySpkiBase64: 'AQIDBA==',
            }
          : {
              file: {
                fileId: 'file_token',
                url: 'https://platform.example.test/files/token',
                expiresAt: '2026-10-20T00:00:00Z',
                contentType: 'application/timestamp-token',
                sizeBytes: 4,
              },
              time: '2026-10-13T00:00:00Z',
              digest: { algorithm: 'sha256', value: Buffer.alloc(32, 1).toString('base64') },
              authority: { certificateSha256: '0'.repeat(64) },
            },
      );
    },
  });
  const digest = { algorithm: 'sha256' as const, value: Buffer.alloc(32, 1).toString('base64') };
  await p.call(
    'signature.digest.sign',
    { digest, algorithm: 'rsa-pkcs1-sha256' },
    { idempotencyKey: 'sign-1', account: 'conn_signer', member: 'member_test', approvedBy: 'approver_test' },
  );
  await p.call('signature.timestamp.create', { digest }, { idempotencyKey: 'timestamp-1' });
  assert.ok(seen[0].url.endsWith('/signature.digest.sign'));
  assert.ok(seen[1].url.endsWith('/signature.timestamp.create'));
  assert.equal(new Headers(seen[0].init.headers).get('Pramaan-Account'), 'conn_signer');
  assert.equal(new Headers(seen[0].init.headers).get('Pramaan-Approved-By'), 'approver_test');
  assert.deepEqual(JSON.parse(String(seen[1].init.body)), { digest });
  assert.equal(new Headers(seen[1].init.headers).get('Idempotency-Key'), 'timestamp-1');
});

test('managed startup actions send their saved identifier as the required header', async () => {
  const seen: Array<{ url: string; init: RequestInit }> = [];
  const p = createPramaan({
    apiKey: 'offline-only',
    baseUrl: 'http://fake.local',
    maxRetries: 0,
    fetch: async (url, init) => {
      seen.push({ url, init });
      assert.ok(new Headers(init.headers).get('Idempotency-Key'));
      return Response.json({ status: 'ready' });
    },
  });
  for (const [id, input, key] of [
    ['auth.backend.provision', {}, 'managed-signin-saved'],
    ['auth.backend.domains.set', { domains: ['https://app.example.com'] }, 'managed-domains-saved'],
    ['db.postgres.provision', {}, 'managed-database-saved'],
  ] as const) {
    await p.call(id, input, { idempotencyKey: key });
    assert.equal(new Headers(seen.at(-1)!.init.headers).get('Idempotency-Key'), key);
  }
  assert.equal(seen.length, 3);
});
for (const typical of [undefined, 0, 50]) {
  test(`optional typical estimate ${typical}`, async () => {
    const p = createPramaan({
      apiKey: 'fake',
      fetch: async () =>
        Response.json({
          price_max_micro: 100,
          ...(typical === undefined ? {} : { price_typical_micro: typical }),
          ready: true,
          can_run: true,
          steps: [],
        }),
    });
    for (const result of [
      await p.capabilities.estimate('sms.send', {}),
      await p.outcomes.estimate('notify.send', {}),
    ]) {
      assert.equal(result.priceMaxMicro, 100);
      assert.equal(result.priceTypicalMicro, typical);
      if (typical === undefined) {
        assert.equal('priceTypicalMicro' in result, false);
      }
    }
  });
}
