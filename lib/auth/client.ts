// Client-side auth helpers — thin fetch wrappers over /api/auth/*.
import type { Domain } from './types';

export interface Session {
  userId: string;
  username: string;
  domain: Domain;
}

export async function getSession(): Promise<Session | null> {
  try {
    const res = await fetch('/api/auth/me', { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as Session;
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
    return { session: body as Session };
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
    return { session: body as Session };
  } catch {
    return { error: 'Network error' };
  }
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' });
}
