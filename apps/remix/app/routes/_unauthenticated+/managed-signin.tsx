import { formatPath } from '@e-sign/lib/constants/app';
import { isSigninEnabledForProvider, isSignupEnabledForProvider } from '@e-sign/lib/constants/auth';
import { getManagedBackend } from '@e-sign/lib/server-only/pramaan/managed-auth';
import { Button } from '@e-sign/ui/primitives/button';
import { Input } from '@e-sign/ui/primitives/input';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLoaderData } from 'react-router';
import { managedSignInClient } from '~/utils/managed-auth-client';

export function loader({ request }: { request: Request }) {
  const backend = isSigninEnabledForProvider('email') ? getManagedBackend() : undefined;
  return {
    authUrl: backend?.authUrl,
    appOrigin: backend?.appOrigin,
    social: isSigninEnabledForProvider('google'),
    signup: isSignupEnabledForProvider('email'),
    returnTo: new URL(request.url).searchParams.get('returnTo') || '/',
    verificationPending: new URL(request.url).searchParams.get('verify') === 'email',
    signupMode: new URL(request.url).searchParams.get('mode') === 'signup',
  };
}
export default function ManagedSignIn() {
  const data = useLoaderData<typeof loader>();
  const client = useMemo(() => (data.authUrl ? managedSignInClient(data.authUrl) : undefined), [data.authUrl]);
  const [mode, setMode] = useState<'signin' | 'signup'>(data.signupMode && data.signup ? 'signup' : 'signin');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  async function begin() {
    const response = await fetch(formatPath('/api/auth/managed/start'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnTo: data.returnTo }),
    });
    if (!response.ok) {
      throw new Error();
    }
  }
  async function finish() {
    const result = await client!.token();
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
    window.location.assign(formatPath(completed.redirectUrl));
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      const form = new FormData(event.currentTarget);
      await begin();
      const email = String(form.get('email'));
      const password = String(form.get('password'));
      const result =
        mode === 'signup'
          ? await client.signUp.email({
              name: String(form.get('name')),
              email,
              password,
            })
          : await client.signIn.email({
              email,
              password,
            });
      if (result.error) {
        throw new Error();
      }
      await finish();
    } catch {
      setError('Managed sign-in could not complete. Verify your email or try local sign-in.');
      setBusy(false);
    }
  }
  async function social() {
    if (!client) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await begin();
      const result = await client.signIn.social({
        provider: 'google',
        callbackURL: `${data.appOrigin}${formatPath('/managed-callback')}`,
      });
      if (result.error) {
        throw new Error();
      }
    } catch {
      setError('Managed sign-in could not start. Try local sign-in.');
      setBusy(false);
    }
  }
  return (
    <section className="w-full max-w-md rounded-xl border bg-background p-6">
      <h1 className="mb-4 font-semibold text-2xl">Managed sign-in</h1>
      {data.verificationPending && (
        <p role="status" className="mb-4">
          Check your email to verify this account, then sign in again.
        </p>
      )}
      {!client ? (
        <p>Managed sign-in is not set up yet. Add PRAMAAN_API_KEY and restart, or use local sign-in.</p>
      ) : (
        <>
          <form method="post" onSubmit={submit} className="flex flex-col gap-4">
            {mode === 'signup' && (
              <label>
                Full name
                <Input name="name" required autoComplete="name" />
              </label>
            )}
            <label>
              Email
              <Input name="email" type="email" required autoComplete="email" />
            </label>
            <label>
              Password
              <Input
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              />
            </label>
            <Button disabled={busy || !ready} type="submit">
              {mode === 'signup' ? 'Create managed account' : 'Sign in with email'}
            </Button>
          </form>
          {data.social && (
            <Button className="mt-4 w-full" variant="outline" disabled={busy || !ready} onClick={social}>
              Continue with personal account
            </Button>
          )}
          {data.signup && (
            <Button
              className="mt-2 w-full"
              variant="ghost"
              disabled={busy || !ready}
              onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
            >
              {mode === 'signin' ? 'Create an account' : 'Use an existing account'}
            </Button>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="mt-4">
          {error}
        </p>
      )}
      <Link className="mt-4 block underline" to="/signin?local=1">
        Use local sign-in
      </Link>
      <Link className="mt-2 block underline" to="/signup?local=1">
        Create a local account
      </Link>
    </section>
  );
}
