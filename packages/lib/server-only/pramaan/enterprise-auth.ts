import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { prisma } from '@e-sign/prisma';
import type { Requests } from '@pramaan/sdk';
import { z } from 'zod';
import { NEXT_PUBLIC_WEBAPP_URL } from '../../constants/app';
import { symmetricDecrypt, symmetricEncrypt } from '../../universal/crypto';
import { formatOrganisationCallbackUrl } from '../../utils/organisation-authentication-portal';
import { buildOrganisationWhereQuery } from '../../utils/organisations';
import { callPramaan, pramaanConfigured } from '../pramaan';

export class EnterpriseSignInError extends Error {}
function fail(message = 'Organisation sign-in could not be completed. Start again or use local sign-in.'): never {
  throw new EnterpriseSignInError(message);
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const opaque = () => randomBytes(32).toString('base64url');
const key = () => process.env.NEXT_PRIVATE_ENCRYPTION_KEY || fail('Configure the local encryption key first.');
export const enterpriseSignInConfigured = () =>
  pramaanConfigured() && new URL(NEXT_PUBLIC_WEBAPP_URL()).protocol === 'https:';
export const enterpriseCallbackUrl = (orgUrl: string) => formatOrganisationCallbackUrl(orgUrl);
const setup = z.object({
  name: z.string().trim().min(1).max(64),
  issuer: z.string().url().max(512),
  clientId: z.string().trim().min(1).max(512),
  clientSecret: z.string().min(1).max(2048).optional(),
  tokenAuthMethod: z.enum(['client_secret_basic', 'client_secret_post', 'none']),
  endpointHosts: z
    .array(z.string().regex(/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/))
    .max(5)
    .default([]),
});
export type EnterpriseSetup = z.input<typeof setup>;

async function adminOrg(userId: number, orgUrl: string) {
  const org = await prisma.organisation.findFirst({
    where: { url: orgUrl, ...buildOrganisationWhereQuery({ organisationId: undefined, userId, roles: ['ADMIN'] }) },
  });
  if (!org) {
    fail('Only an organisation administrator can manage its connection.');
  }
  return org!;
}
const orgRef = (organisationId: string, id: string) => `organisation:${organisationId}:connection:${id}`;
export async function organisationConnectionSettings(userId: number, orgUrl: string) {
  const org = await adminOrg(userId, orgUrl);
  const connection = await prisma.enterpriseSignInConnection.findUnique({ where: { organisationId: org.id } });
  return { org, connection };
}
export async function createOrganisationConnection(
  userId: number,
  orgUrl: string,
  raw: EnterpriseSetup,
  confirm: boolean,
) {
  const { org, connection: existing } = await organisationConnectionSettings(userId, orgUrl);
  if (!confirm) {
    fail('Confirm the connection setup first.');
  }
  if (!enterpriseSignInConfigured()) {
    fail('Add the connection key and configure an HTTPS app address first.');
  }
  const input = setup.parse(raw);
  const issuer = new URL(input.issuer);
  if (issuer.protocol !== 'https:' || issuer.username || issuer.password || issuer.hash || issuer.search) {
    fail('Use an exact HTTPS issuer address without credentials, query or fragment.');
  }
  if ((input.tokenAuthMethod === 'none') !== (input.clientSecret === undefined)) {
    fail('A confidential client needs its secret; a public client must leave it empty.');
  }
  const redirectUri = enterpriseCallbackUrl(org.url);
  const inputHash = createHmac('sha256', key())
    .update(JSON.stringify({ ...input, redirectUri }))
    .digest('hex');
  if (existing?.status === 'ready') {
    return existing;
  }
  if (existing && (existing.status !== 'creating' || existing.inputHash !== inputHash)) {
    fail('Check the saved setup before changing it. Retry an unfinished setup with the same settings.');
  }
  const row =
    existing ||
    (await prisma.enterpriseSignInConnection.create({ data: { organisationId: org.id, name: input.name, inputHash } }));
  let result;
  try {
    result = await callPramaan(
      'auth.enterprise-connection.create',
      {
        organizationRef: orgRef(org.id, row.id),
        ...input,
        redirectUris: [redirectUri],
      },
      { idempotencyKey: `enterprise:${row.id}:create` },
    );
  } catch (error) {
    if ((error as { effect?: string }).effect === 'none') {
      await prisma.enterpriseSignInConnection.deleteMany({ where: { id: row.id, status: 'creating', ref: null } });
    }
    throw error;
  }
  if (!result.ref || result.organizationRef !== orgRef(org.id, row.id)) {
    fail('Connection setup could not be confirmed. Check the saved setup.');
  }
  return prisma.enterpriseSignInConnection.update({
    where: { id: row.id },
    data: { ref: result.ref, status: 'ready' },
  });
}
export async function listOrganisationConnections(userId: number, orgUrl: string) {
  const { org, connection } = await organisationConnectionSettings(userId, orgUrl);
  if (!connection) {
    return [];
  }
  const result = await callPramaan('auth.enterprise-connections.list', {
    organizationRef: orgRef(org.id, connection.id),
    limit: 50,
  });
  const rows = result.results.filter((row) => row.organizationRef === orgRef(org.id, connection.id));
  // Reconcile a lost setup answer only within the unique, app-owned connection namespace.
  if (connection.status === 'creating' && rows.length === 1 && rows[0].ref && rows[0].name === connection.name) {
    await prisma.enterpriseSignInConnection.update({
      where: { id: connection.id },
      data: { ref: rows[0].ref, status: 'ready' },
    });
  }
  return rows.map((row) => ({ name: row.name, status: row.status, createdAt: row.createdAt }));
}
export async function deleteOrganisationConnection(userId: number, orgUrl: string, confirm: boolean) {
  const { connection } = await organisationConnectionSettings(userId, orgUrl);
  if (!confirm) {
    fail('Confirm removal first.');
  }
  if (!connection?.ref) {
    fail('Check the connection setup before removing it.');
  }
  await prisma.enterpriseSignInConnection.update({ where: { id: connection.id }, data: { status: 'deleting' } });
  try {
    const result = await callPramaan(
      'auth.enterprise-connection.delete',
      { ref: connection.ref, confirm: true },
      { idempotencyKey: `enterprise:${connection.id}:delete` },
    );
    if (result.deleted !== true) {
      fail('Connection removal was not confirmed.');
    }
  } catch (error) {
    if ((error as { effect?: string }).effect === 'none') {
      await prisma.enterpriseSignInConnection.update({ where: { id: connection.id }, data: { status: 'ready' } });
    }
    throw error;
  }
  await prisma.enterpriseSignInConnection.delete({ where: { id: connection.id } });
}

export type SignInPrincipal = { userId: number; sessionId: string };
async function readyConnection(orgUrl: string) {
  if (!enterpriseSignInConfigured()) {
    fail('Organisation sign-in needs a connection key and an HTTPS app address. Use local sign-in.');
  }
  const org = await prisma.organisation.findUnique({ where: { url: orgUrl } });
  const connection = org && (await prisma.enterpriseSignInConnection.findUnique({ where: { organisationId: org.id } }));
  if (!org || !connection?.ref || connection.status !== 'ready') {
    fail('Organisation sign-in is not configured. Use local sign-in.');
  }
  return { org: org!, connection: connection! };
}
async function member(userId: number, organisationId: string) {
  const membership = await prisma.organisationMember.findUnique({
    where: { userId_organisationId: { userId, organisationId } },
  });
  if (!membership) {
    fail('This account is not a member of the organisation.');
  }
}
export async function startOrganisationSignIn(orgUrl: string, principal?: SignInPrincipal) {
  const { org, connection } = await readyConnection(orgUrl);
  if (principal) {
    await member(principal.userId, org.id);
  }
  const state = opaque();
  const nonce = opaque();
  const verifier = opaque();
  const redirectUri = enterpriseCallbackUrl(org.url);
  await prisma.enterpriseSignInAttempt.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  const result = await callPramaan('auth.enterprise.start', {
    connectionRef: connection.ref!,
    redirectUri,
    state,
    nonce,
    codeChallenge: createHash('sha256').update(verifier).digest('base64url'),
  });
  const url = new URL(result.authorizationUrl);
  const expiresAt = new Date(Math.min(new Date(result.expiresAt).getTime(), Date.now() + 600_000));
  if (
    url.protocol !== 'https:' ||
    !/^\/connect\/link\/[A-Za-z0-9._~-]+$/.test(url.pathname) ||
    url.search ||
    url.hash ||
    url.username ||
    url.password ||
    !Number.isFinite(expiresAt.getTime()) ||
    expiresAt <= new Date()
  ) {
    fail();
  }
  await prisma.enterpriseSignInAttempt.create({
    data: {
      stateHash: hash(state),
      connectionId: connection.id,
      redirectUri,
      expiresAt,
      secrets: symmetricEncrypt({ key: key(), data: JSON.stringify({ nonce, verifier }) }),
      linkingUserId: principal?.userId,
      linkingSessionId: principal?.sessionId,
    },
  });
  return { state, authorizationUrl: url.toString() };
}
export async function redeemOrganisationSignIn(
  orgUrl: string,
  input: { code?: string; state?: string; browserState?: string },
  principal?: SignInPrincipal,
) {
  const { org, connection } = await readyConnection(orgUrl);
  const { code, state, browserState } = input;
  if (
    !code ||
    code.length > 16384 ||
    !state ||
    !browserState ||
    !/^[A-Za-z0-9._~-]{22,512}$/.test(browserState) ||
    !/^[A-Za-z0-9._~-]{22,512}$/.test(state) ||
    state.length !== browserState.length ||
    !timingSafeEqual(Buffer.from(state), Buffer.from(browserState))
  ) {
    fail();
  }
  const stateHash = hash(state!);
  const attempt = await prisma.enterpriseSignInAttempt.findUnique({ where: { stateHash } });
  if (!attempt || attempt.connectionId !== connection.id || attempt.expiresAt <= new Date() || attempt.consumedAt) {
    fail();
  }
  if (
    attempt.linkingUserId &&
    (!principal || principal.userId !== attempt.linkingUserId || principal.sessionId !== attempt.linkingSessionId)
  ) {
    fail();
  }
  // Atomic claim before exchange: concurrent or replayed callbacks never redeem twice.
  const claimed = await prisma.enterpriseSignInAttempt.updateMany({
    where: { stateHash, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });
  if (claimed.count !== 1) {
    fail();
  }
  const secrets = JSON.parse(Buffer.from(symmetricDecrypt({ key: key(), data: attempt.secrets })).toString('utf8')) as {
    nonce: string;
    verifier: string;
  };
  const identity = await callPramaan(
    'auth.social.exchange',
    {
      providerKey: 'enterprise',
      connectionRef: connection.ref!,
      code: code!,
      redirectUri: attempt.redirectUri,
      state,
      pkceVerifier: secrets.verifier,
      expectedNonce: secrets.nonce,
    } as Requests['auth.social.exchange'],
    { idempotencyKey: `enterprise:${stateHash}:redeem` },
  );
  if (
    identity.providerKey !== 'enterprise' ||
    typeof identity.subjectId !== 'string' ||
    !identity.subjectId ||
    identity.subjectId.length > 512
  ) {
    fail();
  }
  const stillReady = await prisma.enterpriseSignInConnection.findUnique({ where: { id: connection.id } });
  if (stillReady?.status !== 'ready') {
    fail();
  }
  const existing = await prisma.enterpriseSignInIdentity.findUnique({
    where: { connectionId_subjectId: { connectionId: connection.id, subjectId: identity.subjectId } },
  });
  if (!attempt.linkingUserId && principal && existing?.userId !== principal.userId) {
    fail();
  }
  if (attempt.linkingUserId) {
    await member(attempt.linkingUserId, org.id);
    if (existing && existing.userId !== attempt.linkingUserId) {
      fail();
    }
    if (!existing) {
      await prisma.enterpriseSignInIdentity.create({
        data: { connectionId: connection.id, subjectId: identity.subjectId, userId: attempt.linkingUserId },
      });
    }
  }
  const userId = existing?.userId || attempt.linkingUserId;
  if (!userId) {
    fail('Link organisation sign-in while signed in to your local member account first.');
  }
  await member(userId!, org.id);
  return { userId: userId!, redirectPath: `/o/${org.url}` };
}
