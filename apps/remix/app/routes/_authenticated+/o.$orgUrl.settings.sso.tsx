import { getSession } from '@e-sign/auth/server/lib/utils/get-session';
import { NEXT_PUBLIC_WEBAPP_URL } from '@e-sign/lib/constants/app';
import {
  createOrganisationConnection,
  deleteOrganisationConnection,
  enterpriseCallbackUrl,
  enterpriseSignInConfigured,
  listOrganisationConnections,
  organisationConnectionSettings,
} from '@e-sign/lib/server-only/pramaan/enterprise-auth';
import { Form, Link, useActionData, useLoaderData, useNavigation } from 'react-router';
import type { Route } from './+types/o.$orgUrl.settings.sso';

export async function loader({ request, params }: Route.LoaderArgs) {
  const { user } = await getSession(request);
  const { org, connection } = await organisationConnectionSettings(user.id, params.orgUrl!);
  // Only local metadata reaches the page; client secrets and platform references never do.
  return {
    name: org.name,
    orgUrl: org.url,
    connection: connection ? { name: connection.name, status: connection.status } : null,
    enabled: enterpriseSignInConfigured(),
    callbackUrl: enterpriseCallbackUrl(org.url),
  };
}
export async function action({ request, params }: Route.ActionArgs) {
  const { user } = await getSession(request);
  const orgUrl = params.orgUrl!;
  try {
    if (request.headers.get('Origin') !== new URL(NEXT_PUBLIC_WEBAPP_URL()).origin) {
      throw new Error();
    }
    const form = await request.formData();
    const confirm = form.get('confirm') === 'on';
    if (form.get('intent') === 'delete') {
      await deleteOrganisationConnection(user.id, orgUrl, confirm);
    } else if (form.get('intent') === 'list') {
      return { message: 'Connection status checked.', rows: await listOrganisationConnections(user.id, orgUrl) };
    } else {
      await createOrganisationConnection(
        user.id,
        orgUrl,
        {
          name: String(form.get('name') || ''),
          issuer: String(form.get('issuer') || ''),
          clientId: String(form.get('clientId') || ''),
          clientSecret: String(form.get('clientSecret') || '') || undefined,
          tokenAuthMethod: String(form.get('tokenAuthMethod') || '') as
            | 'client_secret_basic'
            | 'client_secret_post'
            | 'none',
          endpointHosts: String(form.get('endpointHosts') || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        },
        confirm,
      );
    }
    return { message: 'Connection settings saved.', rows: undefined };
  } catch {
    return {
      message:
        'Connection settings could not be confirmed. Check the saved setup before trying again; unfinished setup must use the same settings.',
      rows: undefined,
    };
  }
}
export default function OrganisationSignInSettings() {
  const data = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const busy = useNavigation().state !== 'idle';
  return (
    <section className="capability-workspace">
      <h1>Organisation sign-in</h1>
      <p>Configure one OIDC connection for {data.name}. Existing local accounts and sessions stay available.</p>
      <p>This service is not deployed yet and is not live-verified. SAML sign-in is unavailable.</p>
      {!data.enabled && <p>Add the workspace connection key and configure an HTTPS app address to enable setup.</p>}
      <p>
        Register this exact callback address: <code>{data.callbackUrl}</code>
      </p>
      {result && <p role="status">{result.message}</p>}
      {data.connection && (
        <p>
          Saved connection: {data.connection.name}. Status: {data.connection.status}.
        </p>
      )}
      {result?.rows?.map((row) => (
        <p key={row.createdAt}>
          {row.name}: {row.status}
        </p>
      ))}
      {data.connection?.status !== 'ready' && data.connection?.status !== 'deleting' && (
        <Form method="post" className="capability-form">
          <input type="hidden" name="intent" value="create" />
          <label>
            Connection name
            <input name="name" required maxLength={64} />
          </label>
          <label>
            Issuer address
            <input name="issuer" type="url" required placeholder="https://login.example.test" />
          </label>
          <label>
            Client identifier
            <input name="clientId" required maxLength={512} />
          </label>
          <label>
            Client secret
            <input name="clientSecret" type="password" autoComplete="off" maxLength={2048} />
          </label>
          <label>
            Client authentication
            <select name="tokenAuthMethod">
              <option value="client_secret_basic">Secret in authentication header</option>
              <option value="client_secret_post">Secret in request body</option>
              <option value="none">Public client, no secret</option>
            </select>
          </label>
          <label>
            Other endpoint hosts
            <input name="endpointHosts" placeholder="login.example.test, keys.example.test" />
          </label>
          <small>Up to five exact host names, only if endpoints use hosts other than the issuer.</small>
          <label>
            <input name="confirm" type="checkbox" required />I approve storing this organisation connection and its
            secret with Pramaan.
          </label>
          <button disabled={!data.enabled || busy} type="submit">
            Save organisation connection
          </button>
        </Form>
      )}
      {data.connection && (
        <>
          <Form method="post">
            <input type="hidden" name="intent" value="list" />
            <button type="submit" disabled={!data.enabled || busy}>
              Check saved connection
            </button>
          </Form>
          {data.connection.status !== 'creating' && (
            <Form method="post">
              <input type="hidden" name="intent" value="delete" />
              <label>
                <input name="confirm" type="checkbox" required />I approve removing the connection. Local accounts
                remain.
              </label>
              <button type="submit" disabled={!data.enabled || busy}>
                Remove organisation connection
              </button>
            </Form>
          )}
          <Link to={`/o/${data.orgUrl}/signin`}>Link my organisation sign-in</Link>
        </>
      )}
    </section>
  );
}
