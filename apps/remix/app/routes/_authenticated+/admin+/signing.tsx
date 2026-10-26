import { getOptionalSession } from '@e-sign/auth/server/lib/utils/get-session';
import { signingServiceSettings } from '@e-sign/lib/server-only/pramaan/pdf-evidence';
import { readSigningCertificate } from '@e-sign/lib/server-only/pramaan/signing-certificate';
import { isAdmin } from '@e-sign/lib/utils/is-admin';
import type { ActionFunctionArgs } from 'react-router';
import { Link, useFetcher, useLoaderData } from 'react-router';
export function loader() {
  // The parent route enforces local administrator access. Public key/account refs stay server-side.
  return signingServiceSettings();
}
export async function action({ request }: ActionFunctionArgs) {
  const { user } = await getOptionalSession(request);
  if (!user || !isAdmin(user)) {
    throw new Response('Forbidden', { status: 403 });
  }
  if (request.method !== 'POST') {
    throw new Response('Method not allowed', { status: 405 });
  }
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    throw new Response('Forbidden', { status: 403 });
  }
  return readSigningCertificate();
}
export default function SigningSettings() {
  const data = useLoaderData<typeof loader>();
  const certificate = useFetcher<typeof action>();
  return (
    <section className="capability-workspace">
      <h1>Signing settings</h1>
      <p>Certificate transport: {data.remote ? 'Remote key signing requested' : 'Local certificate (default)'}.</p>
      {!data.remote && (
        <p>
          Remote signing is not set up yet. Set NEXT_PRIVATE_SIGNING_TRANSPORT to pramaan, PRAMAAN_SIGNING_ACCOUNT and
          PRAMAAN_SIGNING_CERTIFICATE_CHAIN to request it. Local signing works without these settings.
        </p>
      )}
      <p>Trusted timestamp: {data.timestamp ? 'Requested' : 'Off'}.</p>
      <p>Connection key: {data.keyConfigured ? 'Configured' : 'Missing'}.</p>
      <p role="status">{data.message}</p>
      <p>
        These are server deployment settings. Local signing remains the core. A requested service failure stops sealing;
        it never silently changes the requested evidence.
      </p>
      <p>
        A result that cannot be confirmed must be checked before another request. Saved attempts prevent automatic
        resending.
      </p>
      <section className="space-y-3 rounded border p-4">
        <h2>Connected public certificate</h2>
        <p>
          Not yet live-verified. Reading does not sign a document or change your configured signing certificate. Trust
          and revocation are not checked.
        </p>
        <certificate.Form method="post">
          <button type="submit" disabled={certificate.state !== 'idle'} className="rounded border px-4 py-2">
            {certificate.state === 'idle' ? 'Read public certificate' : 'Reading certificate…'}
          </button>
        </certificate.Form>
        {certificate.data && <p role="status">{certificate.data.message}</p>}
        {certificate.data?.status === 'ready' && (
          <dl className="space-y-2">
            <dt>SHA-256 fingerprint</dt>
            <dd className="break-all">{certificate.data.certificate.fingerprint}</dd>
            <dt>Valid from</dt>
            <dd>{certificate.data.certificate.validFrom}</dd>
            <dt>Valid until</dt>
            <dd>{certificate.data.certificate.validTo}</dd>
            <dt>Within validity period</dt>
            <dd>{certificate.data.certificate.withinValidityPeriod ? 'Yes' : 'No'}</dd>
            <dt>Certificates in chain</dt>
            <dd>{certificate.data.certificate.chainLength}</dd>
          </dl>
        )}
        {certificate.data?.status === 'ready' && (
          <details>
            <summary>Public certificate chain</summary>
            <pre className="overflow-x-auto text-xs">{certificate.data.certificate.pem}</pre>
          </details>
        )}
      </section>
      <Link to="/admin/stats">Return to administration</Link>
    </section>
  );
}
