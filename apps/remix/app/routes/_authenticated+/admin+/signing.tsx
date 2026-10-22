import { signingServiceSettings } from '@e-sign/lib/server-only/pramaan/pdf-evidence';
import { Link, useLoaderData } from 'react-router';
export function loader() {
  // The parent route enforces local administrator access. Public key/account refs stay server-side.
  return signingServiceSettings();
}
export default function SigningSettings() {
  const data = useLoaderData<typeof loader>();
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
      <Link to="/admin/stats">Return to administration</Link>
    </section>
  );
}
