import { managedRoute } from '@e-sign/auth/server/routes/managed';
import { Hono } from 'hono';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  tokens: new Map<string, Date>(),
  account: undefined as any,
  collision: false,
  authorize: vi.fn(),
  confirmation: vi.fn(),
  createdVerified: null as Date | null,
  verify: vi.fn(),
  backend: {
    authUrl: 'https://auth.example.test',
    jwksUrl: 'https://auth.example.test/keys',
    appOrigin: 'http://localhost:3012',
  },
}));
vi.mock('@e-sign/lib/server-only/pramaan/managed-auth', () => ({
  getManagedBackend: () => mock.backend,
  verifyManagedToken: mock.verify,
}));
vi.mock('@e-sign/auth/server/lib/utils/authorizer', () => ({ onAuthorize: mock.authorize }));
vi.mock('@e-sign/lib/server-only/rate-limit/rate-limits', () => ({ loginRateLimit: { check: async () => ({}) } }));
vi.mock('@e-sign/lib/server-only/rate-limit/rate-limit-middleware', () => ({ rateLimitResponse: () => undefined }));
vi.mock('@e-sign/lib/server-only/site-settings/get-email-blocklist-domains', () => ({
  getEmailBlocklistDomains: async () => [],
}));
vi.mock('@e-sign/lib/jobs/client', () => ({ jobsClient: { triggerJob: mock.confirmation } }));
vi.mock('@e-sign/lib/server-only/user/create-user', () => ({ onCreateUserHook: async () => {} }));
vi.mock('@e-sign/prisma', () => ({
  prisma: {
    anonymousVerificationToken: {
      create: async ({ data }: any) => {
        mock.tokens.set(data.token, data.expiresAt);
        return data;
      },
      deleteMany: async ({ where }: any) => {
        const expires = mock.tokens.get(where.token);
        if (expires && expires > where.expiresAt.gt) {
          mock.tokens.delete(where.token);
          return { count: 1 };
        }
        return { count: 0 };
      },
    },
    account: {
      findUnique: async () => mock.account,
      findUniqueOrThrow: async () => mock.account,
      create: async () => {
        mock.account = {
          userId: 7,
          user: { email: 'managed@example.com', emailVerified: new Date(), twoFactorEnabled: false },
        };
      },
    },
    user: {
      findFirst: async () => (mock.collision ? { id: 9 } : null),
      create: async () => ({ id: 7 }),
      update: async () => ({}),
    },
    $transaction: async (fn: any) =>
      fn({
        user: {
          create: async ({ data }: any) => {
            mock.createdVerified = data.emailVerified;
            return { id: 7 };
          },
        },
        account: {
          create: async () => {
            mock.account = {
              userId: 7,
              user: { email: 'managed@example.com', emailVerified: mock.createdVerified, twoFactorEnabled: false },
            };
          },
        },
      }),
  },
}));
const origin = 'http://localhost:3012';
const app = new Hono<any>()
  .use('*', async (c, next) => {
    c.set('requestMetadata', { ipAddress: '127.0.0.1', userAgent: 'offline' });
    await next();
  })
  .route('/managed', managedRoute);
async function start(returnTo?: string) {
  const response = await app.request('/managed/start', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnTo }),
  });
  expect(response.status).toBe(200);
  return response.headers.get('set-cookie')!.split(';')[0];
}
function complete(cookie?: string, from = origin) {
  return app.request('/managed/complete', {
    method: 'POST',
    headers: { Origin: from, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify({ token: 'token.payload.signature' }),
  });
}
beforeEach(() => {
  vi.stubEnv('NEXTAUTH_SECRET', 'offline-session-secret-for-managed-tests');
  vi.stubEnv('NEXT_PUBLIC_WEBAPP_URL', origin);
  vi.stubEnv('NEXT_PUBLIC_DISABLE_EMAIL_SIGNIN', 'false');
  vi.stubEnv('NEXT_PUBLIC_DISABLE_EMAIL_SIGNUP', 'false');
  mock.tokens.clear();
  mock.account = undefined;
  mock.collision = false;
  mock.authorize.mockReset();
  mock.verify.mockReset().mockResolvedValue({
    issuer: 'https://auth.example.test',
    subject: 'user_1',
    email: 'managed@example.com',
    name: 'Managed User',
    emailVerified: true,
  });
});
afterEach(() => vi.unstubAllEnvs());
it('opens the normal local session after verification and refuses a replayed attempt', async () => {
  const cookie = await start();
  expect((await complete(cookie)).status).toBe(200);
  expect(mock.authorize).toHaveBeenCalledOnce();
  expect((await complete(cookie)).status).toBe(401);
  expect(mock.authorize).toHaveBeenCalledOnce();
});
it('never opens a local session for refused verification', async () => {
  mock.verify.mockRejectedValue(new Error('refused'));
  expect((await complete(await start())).status).toBe(401);
  expect(mock.authorize).not.toHaveBeenCalled();
});
it('refuses a missing cookie and cross-origin completion', async () => {
  expect((await complete()).status).toBe(401);
  expect((await complete(await start(), 'https://other.example.com')).status).toBe(401);
  expect(mock.verify).not.toHaveBeenCalled();
});
it('does not attach a managed identity to a local account with the same email', async () => {
  mock.collision = true;
  expect((await complete(await start())).status).toBe(401);
  expect(mock.authorize).not.toHaveBeenCalled();
});
it('preserves local two-factor requirements', async () => {
  mock.account = {
    userId: 7,
    user: { email: 'managed@example.com', emailVerified: new Date(), twoFactorEnabled: true },
  };
  expect((await complete(await start())).status).toBe(403);
  expect(mock.authorize).not.toHaveBeenCalled();
});
it('keeps the configured email-domain restriction', async () => {
  vi.stubEnv('NEXT_PRIVATE_ALLOWED_SIGNUP_DOMAINS', 'allowed.example.com');
  expect((await complete(await start())).status).toBe(401);
  expect(mock.authorize).not.toHaveBeenCalled();
});

it('does not create a local session before the managed email is verified', async () => {
  mock.verify.mockResolvedValue({
    issuer: 'https://auth.example.test',
    subject: 'user_1',
    email: 'managed@example.com',
    name: 'Managed User',
    emailVerified: false,
  });
  const response = await complete(await start());
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ code: 'email_verification_required' });
  expect(mock.confirmation).toHaveBeenCalledWith({
    name: 'send.signup.confirmation.email',
    payload: { email: 'managed@example.com' },
  });
  expect(mock.authorize).not.toHaveBeenCalled();
});

it('keeps a safe destination bound to the browser attempt', async () => {
  const response = await complete(await start('/t/personal/documents'));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ redirectUrl: '/t/personal/documents' });
});
it('rejects an external destination and stays inside the app', async () => {
  const response = await complete(await start('https://other.example.com'));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ redirectUrl: '/' });
});

it('allows the same linked identity after the app has verified its email', async () => {
  mock.verify.mockResolvedValue({
    issuer: 'https://auth.example.test',
    subject: 'user_1',
    email: 'managed@example.com',
    emailVerified: false,
  });
  mock.account = {
    userId: 7,
    user: { email: 'managed@example.com', emailVerified: new Date(), twoFactorEnabled: false },
  };
  expect((await complete(await start())).status).toBe(200);
  expect(mock.authorize).toHaveBeenCalledOnce();
});
it('never uses a different local email as proof for an unverified identity', async () => {
  mock.verify.mockResolvedValue({
    issuer: 'https://auth.example.test',
    subject: 'user_1',
    email: 'other@example.com',
    emailVerified: false,
  });
  mock.account = {
    userId: 7,
    user: { email: 'managed@example.com', emailVerified: new Date(), twoFactorEnabled: false },
  };
  expect((await complete(await start())).status).toBe(401);
  expect(mock.authorize).not.toHaveBeenCalled();
});
