export interface Session {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp in seconds
}

const SESSION_KEY = 'bt_session';

// Module-level cache: read once from localStorage, then kept in sync.
// Used by the tRPC client's headers() callback (no React context needed there).
let _cached: Session | null = null;
let _hydrated = false;

function readFromStorage(): Session | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function getSession(): Session | null {
  if (!_hydrated) {
    _cached = readFromStorage();
    _hydrated = true;
  }
  return _cached;
}

export function setSession(session: Session): void {
  _cached = session;
  _hydrated = true;
  if (typeof window !== 'undefined') {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }
}

export function clearSession(): void {
  _cached = null;
  _hydrated = true;
  if (typeof window !== 'undefined') {
    localStorage.removeItem(SESSION_KEY);
  }
}
