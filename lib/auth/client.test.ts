import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getStoredToken, setStoredToken, clearStoredToken,
  getStoredFileToken, setStoredFileToken, clearStoredFileToken,
  login, getSession, logout,
} from './client';

beforeEach(() => window.sessionStorage.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

it('stores and clears the session token independently of the file token', () => {
  setStoredToken('tok-a');
  setStoredFileToken('file-a');
  expect(getStoredToken()).toBe('tok-a');
  expect(getStoredFileToken()).toBe('file-a');
  clearStoredToken();
  expect(getStoredToken()).toBeNull();
  expect(getStoredFileToken()).toBe('file-a');
  clearStoredFileToken();
  expect(getStoredFileToken()).toBeNull();
});

it('login stores both the session token and the file token', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(
    JSON.stringify({ userId: 'u1', username: 'alice', domain: 'civil-engineering', token: 'tok-a', fileToken: 'file-a' }),
    { status: 200 },
  )));
  const result = await login('alice', 'password123');
  expect('session' in result).toBe(true);
  expect(getStoredToken()).toBe('tok-a');
  expect(getStoredFileToken()).toBe('file-a');
});

it('getSession clears both tokens on a failed /api/auth/me', async () => {
  setStoredToken('stale');
  setStoredFileToken('stale-file');
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 401 })));
  const session = await getSession();
  expect(session).toBeNull();
  expect(getStoredToken()).toBeNull();
  expect(getStoredFileToken()).toBeNull();
});

it('logout clears both tokens', async () => {
  setStoredToken('tok-a');
  setStoredFileToken('file-a');
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
  await logout();
  expect(getStoredToken()).toBeNull();
  expect(getStoredFileToken()).toBeNull();
});
