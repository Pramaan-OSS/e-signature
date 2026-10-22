import { formatPath } from '@e-sign/lib/constants/app';
import { getManagedBackend } from '@e-sign/lib/server-only/pramaan/managed-auth';
import { useEffect, useRef, useState } from 'react';
import { Link, useLoaderData } from 'react-router';
import { managedSignInClient } from '~/utils/managed-auth-client';
export function loader() {
  return { authUrl: getManagedBackend()?.authUrl };
}
export default function ManagedCallback() {
  const { authUrl } = useLoaderData<typeof loader>();
  const started = useRef(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;
    void (async () => {
      try {
        if (!authUrl) {
          throw new Error();
        }
        const client = managedSignInClient(authUrl);
        const result = await client.token();
        if (!result.data?.token) {
          throw new Error();
        }
        const response = await fetch(formatPath('/api/auth/managed/complete'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: result.data.token }),
        });
        if (!response.ok) {
          const refused = await response.json().catch(() => ({}));
          if (refused.code === 'email_verification_required') {
            window.location.assign(formatPath('/managed-signin?verify=email'));
            return;
          }
          throw new Error();
        }
        const completed = await response.json();
        window.location.replace(formatPath(completed.redirectUrl));
      } catch {
        setFailed(true);
      }
    })();
  }, [authUrl]);
  return (
    <section>
      <h1>Completing managed sign-in</h1>
      <p role="status">{failed ? 'Managed sign-in was refused. Please sign in again.' : 'Checking your sign-in.'}</p>
      <Link to="/managed-signin">Try managed sign-in again</Link>
      <br />
      <Link to="/signin?local=1">Use local sign-in</Link>
    </section>
  );
}
