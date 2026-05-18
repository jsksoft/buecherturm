'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  clearSession,
  getSession,
  setSession,
  type Session,
} from '../lib/session';

interface SessionContextValue {
  session: Session | null;
  ready: boolean;
  login: (session: Session) => void;
  logout: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSessionState] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  // Hydrate from localStorage after mount to avoid SSR mismatch.
  useEffect(() => {
    setSessionState(getSession());
    setReady(true);
  }, []);

  const login = useCallback((newSession: Session) => {
    setSession(newSession);
    setSessionState(newSession);
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setSessionState(null);
  }, []);

  return (
    <SessionContext.Provider value={{ session, ready, login, logout }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within <SessionProvider>');
  return ctx;
}
