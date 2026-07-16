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
): Promise<{ session: Session } | { error: string; code?: string }> {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const body = await res.json();
    if (!res.ok) {
      const errBody = body as { error?: string; code?: string };
      return { error: errBody.error ?? 'Login failed', code: errBody.code };
    }
    const session = body as Session;
    storeTokens(session);
    return { session };
  } catch {
    return { error: 'Network error' };
  }
}

async function postJson(
  url: string,
  body: unknown,
): Promise<{ message?: string; error?: string; code?: string }> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string; code?: string };
    if (!res.ok) return { error: data.error ?? 'Request failed', code: data.code };
    return data;
  } catch {
    return { error: 'Network error' };
  }
}

// Registration no longer returns a session — the account must verify its
// email before the first login (grandfathered pre-email accounts excepted).
export async function register(
  username: string,
  password: string,
  domain: Domain,
  email: string,
): Promise<{ message: string } | { error: string }> {
  const result = await postJson('/api/auth/register', { username, password, domain, email });
  if (result.error) return { error: result.error };
  return { message: result.message ?? 'Check your email to verify your account.' };
}

export async function verifyEmail(token: string): Promise<{ message?: string; error?: string }> {
  try {
    const res = await fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);
    const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
    if (!res.ok) return { error: data.error ?? 'Verification failed' };
    return data;
  } catch {
    return { error: 'Network error' };
  }
}

export function resendVerification(identifier: string) {
  return postJson('/api/auth/resend-verification', { identifier });
}

export function forgotPassword(email: string) {
  return postJson('/api/auth/forgot-password', { email });
}

export function resetPassword(token: string, newPassword: string) {
  return postJson('/api/auth/reset-password', { token, newPassword });
}

export async function getEmailStatus(): Promise<{ email: string | null; verified: boolean } | null> {
  try {
    const res = await authFetch('/api/auth/email-status', { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as { email: string | null; verified: boolean };
  } catch {
    return null;
  }
}

export async function updateEmail(email: string): Promise<{ message?: string; error?: string }> {
  try {
    const res = await authFetch('/api/auth/set-email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
    if (!res.ok) return { error: data.error ?? 'Request failed' };
    return data;
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
