import { authClient } from '@e-sign/auth/client';
import type { SessionUser } from '@e-sign/auth/server/lib/session/session';
import { trpc } from '@e-sign/trpc/client';
import type { TGetOrganisationSessionResponse } from '@e-sign/trpc/server/organisation-router/get-organisation-session.types';
import type { Session } from '@prisma/client';
import type React from 'react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';

import { SKIP_QUERY_BATCH_META } from '../../constants/trpc';
import { refreshAppSession } from './refresh-app-session';

export type AppSession = {
  session: Session;
  user: SessionUser;
  organisations: TGetOrganisationSessionResponse;
};

interface SessionProviderProps {
  children: React.ReactNode;
  initialSession: AppSession | null;
}

interface SessionContextValue {
  sessionData: AppSession | null;
  refreshSession: () => Promise<void>;
  refreshError: string | null;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export const useSession = () => {
  const context = useContext(SessionContext);

  if (!context) {
    throw new Error('useSession must be used within a SessionProvider');
  }

  if (!context.sessionData) {
    throw new Error('Session not found');
  }

  return {
    ...context.sessionData,
    refreshSession: context.refreshSession,
    refreshError: context.refreshError,
  };
};

export const useOptionalSession = () => {
  const context = useContext(SessionContext);

  if (!context) {
    throw new Error('useOptionalSession must be used within a SessionProvider');
  }

  return context;
};

export const SessionProvider = ({ children, initialSession }: SessionProviderProps) => {
  const [session, setSession] = useState<AppSession | null>(initialSession);

  const location = useLocation();

  const [refreshError, setRefreshError] = useState<string | null>(null);
  const refreshSession = useCallback(async () => {
    const result = await refreshAppSession(
      () => authClient.getSession(),
      () => trpc.organisation.internal.getOrganisationSession.query(undefined, SKIP_QUERY_BATCH_META.trpc),
    );
    if (result.status === 'unavailable') {
      setRefreshError('Your account details could not refresh. Try again shortly.');
      return;
    }
    setRefreshError(null);
    setSession(result.status === 'signed-out' ? null : result.session);
  }, []);

  useEffect(() => {
    const onFocus = () => {
      void refreshSession();
    };

    window.addEventListener('focus', onFocus);

    return () => {
      window.removeEventListener('focus', onFocus);
    };
  }, [refreshSession]);

  /**
   * Refresh session in background on navigation.
   */
  const lastPath = useRef(location.pathname);
  useEffect(() => {
    // Initial account data was checked by the server; refresh only on client navigation.
    if (lastPath.current !== location.pathname) {
      lastPath.current = location.pathname;
      void refreshSession();
    }
  }, [location.pathname, refreshSession]);

  return (
    <SessionContext.Provider
      value={{
        sessionData: session,
        refreshSession,
        refreshError,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
};
