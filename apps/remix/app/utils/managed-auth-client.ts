import { createAuthClient } from 'better-auth/client';
import { jwtClient } from 'better-auth/client/plugins';

// Keep the browser boundary small; the rest of the app uses its own session.
type Reply = { error?: unknown };
export interface ManagedSignInClient {
  token(): Promise<{ data?: { token: string } | null; error?: unknown }>;
  signIn: {
    email(input: { email: string; password: string; callbackURL?: string }): Promise<Reply>;
    social(input: { provider: 'google'; callbackURL: string }): Promise<Reply>;
  };
  signUp: {
    email(input: { name: string; email: string; password: string; callbackURL?: string }): Promise<Reply>;
  };
}
export function managedSignInClient(baseURL: string): ManagedSignInClient {
  return createAuthClient({ baseURL, basePath: '/', plugins: [jwtClient()] });
}
