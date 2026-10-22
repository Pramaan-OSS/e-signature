import { tsRestHonoApp } from '@e-sign/api/hono';
import { auth } from '@e-sign/auth/server';
import { rejectEmbedSessionMiddleware } from '@e-sign/auth/server/lib/session/embed-session-restrictions';
import { APP_DOCUMENT_UPLOAD_SIZE_LIMIT } from '@e-sign/lib/constants/app';
import { jobsClient } from '@e-sign/lib/jobs/client';
import { getObject, putObject } from '@e-sign/lib/server-only/pramaan/storage';
import { createRateLimitMiddleware } from '@e-sign/lib/server-only/rate-limit/rate-limit-middleware';
import {
  aiRateLimit,
  apiTrpcRateLimit,
  apiV1RateLimit,
  apiV2RateLimit,
  fileUploadRateLimit,
} from '@e-sign/lib/server-only/rate-limit/rate-limits';
import { migrateDeletedAccountServiceAccount } from '@e-sign/lib/server-only/user/service-accounts/deleted-account';
import { migrateLegacyServiceAccount } from '@e-sign/lib/server-only/user/service-accounts/legacy-service-account';
import { readFileGrant } from '@e-sign/lib/universal/upload/providers/pramaan-provider';
import { env } from '@e-sign/lib/utils/env';
import { logger } from '@e-sign/lib/utils/logger';
import { openApiDocument } from '@e-sign/trpc/server/open-api';
import { Hono } from 'hono';
import { contextStorage } from 'hono/context-storage';
import { cors } from 'hono/cors';
import type { RequestIdVariables } from 'hono/request-id';
import { requestId } from 'hono/request-id';
import type { Logger } from 'pino';

import { aiRoute } from './api/ai/route';
import { downloadRoute } from './api/download/download';
import { filesRoute } from './api/files/files';
import { type AppContext, appContext } from './context';
import { csrfMiddleware } from './csrf-middleware';
import { appMiddleware } from './middleware';
import { securityHeadersMiddleware } from './security-headers';
import { openApiTrpcServerHandler } from './trpc/hono-trpc-open-api';
import { reactRouterTrpcServer } from './trpc/hono-trpc-remix';

// Re-export so the rollup build (entry: server/router.ts) bundles
// load-context.ts. server/main.js imports getLoadContext from the rolled-up
// output to wire it into the React Router adapter.
export { getLoadContext } from './load-context';

export interface HonoEnv {
  Variables: RequestIdVariables & {
    context: AppContext;
    logger: Logger;
    cspNonce: string;
  };
}

const basePath = (env('NEXT_PUBLIC_BASE_PATH') ?? '').replace(/\/$/, '');

const app = new Hono<HonoEnv>().basePath(basePath || '/');

app.get('/api/private-files', async (c) => {
  try {
    const key = readFileGrant(c.req.query('grant') || '', 'get');
    const bytes = await getObject(key);
    return new Response(bytes as BodyInit, {
      headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'private, no-store' },
    });
  } catch {
    return c.json({ error: 'File access is unavailable.' }, 403);
  }
});
app.put('/api/private-files', async (c) => {
  try {
    const key = readFileGrant(c.req.query('grant') || '', 'put');
    const limit = APP_DOCUMENT_UPLOAD_SIZE_LIMIT * 1_000_000;
    if (Number(c.req.header('content-length')) > limit) {
      return c.json({ error: `File exceeds ${APP_DOCUMENT_UPLOAD_SIZE_LIMIT} MB.` }, 413);
    }
    const reader = c.req.raw.body?.getReader();
    if (!reader) {
      return c.json({ error: 'File is empty.' }, 400);
    }
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) {
        break;
      }
      length += part.value.length;
      if (length > limit) {
        await reader.cancel();
        return c.json({ error: `File exceeds ${APP_DOCUMENT_UPLOAD_SIZE_LIMIT} MB.` }, 413);
      }
      chunks.push(part.value);
    }
    const bytes = Buffer.concat(chunks);
    await putObject(key, bytes, c.req.header('content-type') || 'application/pdf', true);
    return c.json({ stored: true });
  } catch {
    return c.json({ error: 'File could not be stored.' }, 400);
  }
});

/**
 * Database-backed rate limiting for API routes.
 */
const apiV1RateLimitMiddleware = createRateLimitMiddleware(apiV1RateLimit);
const apiV2RateLimitMiddleware = createRateLimitMiddleware(apiV2RateLimit);
const aiRateLimitMiddleware = createRateLimitMiddleware(aiRateLimit);
const trpcRateLimitMiddleware = createRateLimitMiddleware(apiTrpcRateLimit);
const fileRateLimitMiddleware = createRateLimitMiddleware(fileUploadRateLimit);

/**
 * Attach session and context to requests.
 */
app.use(contextStorage());
app.use(appContext);

/**
 * Emit response security headers (CSP with per-request nonce, plus
 * Referrer-Policy and X-Content-Type-Options on embed routes). Must run
 * after `contextStorage()` so the nonce is readable via `getContext()` from
 * `getLoadContext`, and before the React Router handler so the response
 * carries the header.
 */
app.use(securityHeadersMiddleware);

/**
 * RR7 app middleware.
 */
app.use('*', appMiddleware);
app.use('*', requestId());
app.use(async (c, next) => {
  const metadata = c.get('context').requestMetadata;

  const honoLogger = logger.child({
    requestId: c.var.requestId,
    requestPath: c.req.path,
    ipAddress: metadata.ipAddress,
    userAgent: metadata.userAgent,
  });

  c.set('logger', honoLogger);

  await next();
});

// CSRF: mount on every route that accepts a session cookie. Must run after the logger.
// Not mounted on `/api/v1` (Authorization header only, see `authenticatedMiddleware`),
// `/api/jobs` (signature auth) or `/api/csc` (GET only).
app.use('/api/auth/*', csrfMiddleware);
app.use('/api/trpc/*', csrfMiddleware);
app.use('/api/v2/*', csrfMiddleware);
app.use('/api/v2-beta/*', csrfMiddleware);
app.use('/api/files/*', csrfMiddleware);
app.use('/api/ai/*', csrfMiddleware);

// Embed sessions are signing-only. `/api/files` instead ignores them per route
// (`getOptionalNonEmbedSession`) so embedded authoring on a host that also ran
// embedded signing still falls through to its presign token.
app.use('/api/ai/*', rejectEmbedSessionMiddleware);

// Apply cors and rate limits to API routes.
app.use(`/api/v1/*`, cors());
app.use('/api/v1/*', apiV1RateLimitMiddleware);
app.use(`/api/v2/*`, cors());
app.use('/api/v2/*', apiV2RateLimitMiddleware);
app.use(`/api/v2-beta/*`, cors());
app.use('/api/v2-beta/*', apiV2RateLimitMiddleware);

// Auth server.
app.route('/api/auth', auth);

// Files route.
app.use('/api/files/upload-pdf', fileRateLimitMiddleware);
app.route('/api/files', filesRoute);

// AI route.
app.use('/api/ai/*', aiRateLimitMiddleware);
app.route('/api/ai', aiRoute);

// Remote credential signing stays unavailable pending a matching capability.

// API servers.
app.route('/api/v1', tsRestHonoApp);
app.use('/api/jobs/*', jobsClient.getApiHandler());

app.use('/api/trpc/*', trpcRateLimitMiddleware);
app.use('/api/trpc/*', reactRouterTrpcServer);

// Unstable API server routes. Order matters for these two.
app.get(`/api/v2/openapi.json`, (c) => c.json(openApiDocument));
// Shadows the download routes that tRPC defines since tRPC-to-openapi doesn't support their return types.
app.route(`/api/v2`, downloadRoute);
app.use(`/api/v2/*`, async (c) =>
  openApiTrpcServerHandler(c, {
    isBeta: false,
  }),
);

// Unstable API server routes. Order matters for these two.
app.get(`/api/v2-beta/openapi.json`, (c) => c.json(openApiDocument));
// Shadows the download routes that tRPC defines since tRPC-to-openapi doesn't support their return types.
app.route(`/api/v2-beta`, downloadRoute);
app.use(`/api/v2-beta/*`, async (c) =>
  openApiTrpcServerHandler(c, {
    isBeta: true,
  }),
);

// Start cron scheduler for background jobs (e.g. envelope expiration sweep).
jobsClient.startCron();

void migrateDeletedAccountServiceAccount();
void migrateLegacyServiceAccount();

export default app;
