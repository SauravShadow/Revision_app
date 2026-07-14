// Client-side auth helpers — thin fetch wrappers over /api/auth/*.
import type { Domain } from '@revision-app/shared';

export interface Session {
  userId: string;
  username: string;
  domain: Domain;
  token?: string;
  fileToken?: string;
}

const TOKEN_KEY = 'revision_session_token';
const FILE_TOKEN_KEY = 'revision_file_token';

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(TOKEN_KEY);
}

export function getStoredFileToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem(FILE_TOKEN_KEY);
}

export function setStoredFileToken(token: string) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(FILE_TOKEN_KEY, token);
}

export function clearStoredFileToken() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(FILE_TOKEN_KEY);
}

function storeTokens(session: Session) {
  if (session.token) setStoredToken(session.token);
  if (session.fileToken) setStoredFileToken(session.fileToken);
}

// Fetch helper that attaches the tab-specific sessionStorage token as an Authorization header.
export async function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  const token = getStoredToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(url, { ...init, headers });
}

export async function getSession(): Promise<Session | null> {
  try {
    const res = await authFetch('/api/auth/me', { cache: 'no-store' });
    if (!res.ok) {
      clearStoredToken();
      clearStoredFileToken();
      return null;
    }
    const session = (await res.json()) as Session;
    storeTokens(session);
    return session;
  } catch {
    return null;
  }
}

export async function login(
  username: string,
  password: string,
): Promise<{ session: Session } | { error: string }> {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const body = await res.json();
    if (!res.ok) return { error: (body as { error: string }).error ?? 'Login failed' };
    const session = body as Session;
    storeTokens(session);
    return { session };
  } catch {
    return { error: 'Network error' };
  }
}

export async function register(
  username: string,
  password: string,
  domain: Domain,
): Promise<{ session: Session } | { error: string }> {
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password, domain }),
    });
    const body = await res.json();
    if (!res.ok) return { error: (body as { error: string }).error ?? 'Registration failed' };
    const session = body as Session;
    storeTokens(session);
    return { session };
  } catch {
    return { error: 'Network error' };
  }
}

export async function logout(): Promise<void> {
  try {
    await authFetch('/api/auth/logout', { method: 'POST' });
  } finally {
    clearStoredToken();
    clearStoredFileToken();
  }
}
