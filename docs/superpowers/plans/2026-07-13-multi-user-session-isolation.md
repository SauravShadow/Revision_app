# Multi-User Session Isolation & Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix cross-tab session collision between different logged-in users, close the token-in-URL exposure on attachments, fix the unscoped file-GC route, and replace the hardcoded production `SESSION_SECRET`.

**Architecture:** Drop the HttpOnly cookie entirely; a per-tab `sessionStorage` token (sent via `Authorization: Bearer`) becomes the sole session credential. A second, narrowly-scoped "file token" (`{userId, scope: 'files'}`) is minted alongside the session token and used only as the `?token=` query param for `<img>`/`<a>` attachment URLs, so a leaked attachment URL can never be replayed against `/api/data` or any other endpoint.

**Tech Stack:** Next.js 15 (App Router route handlers), React 19, Zustand 5, Node `crypto` (HMAC-SHA256, no JWT library), Vitest + Testing Library, Docker Compose.

## Global Constraints

- No new dependencies — reuse the existing HMAC-SHA256 signing in `lib/auth/session.ts`.
- `SESSION_SECRET` must never be committed to git — already covered by the `.env*` pattern in `.gitignore`; only `.env.example` should be un-ignored.
- Every modified/created file must pass `npx tsc --noEmit` and `npm run lint` with zero errors/warnings (existing project convention — see `nexus`-adjacent memory: "zero lint warnings" ethos).
- Each task ends with `npm test` fully green before its commit.

---

### Task 1: Session tokens — drop cookies, add file-scoped tokens, update auth routes

**Files:**
- Modify: `lib/auth/session.ts` (full rewrite)
- Modify: `app/api/auth/login/route.ts`
- Modify: `app/api/auth/register/route.ts`
- Modify: `app/api/auth/me/route.ts`
- Modify: `app/api/auth/logout/route.ts`
- Test: `lib/auth/session.test.ts` (new)
- Test: `app/api/auth/login/route.test.ts` (new)
- Test: `app/api/auth/register/route.test.ts` (new)
- Test: `app/api/auth/me/route.test.ts` (new)

**Interfaces:**
- Produces (used by later tasks and by routes in this task):
  - `signSession(session: Session): string`
  - `verifySession(token: string): Session | null` — returns `null` if the token carries a `scope` field (i.e. is a file token)
  - `signFileToken(userId: string): string`
  - `verifyFileToken(token: string): string | null` — returns the `userId`, or `null` if not a valid `scope: 'files'` token
  - `getSessionFromRequest(req: Request): Session | null` — reads only the `Authorization: Bearer` header; never reads cookies or the query string
  - `getFileAccessUserId(req: Request): string | null` — accepts a full session via `Authorization` header, or a file-scoped token via `?token=`
- `Session` type (`lib/auth/types.ts`, unchanged): `{ userId: string; username: string; domain: Domain }`

- [ ] **Step 1: Write the failing test for session.ts**

Create `lib/auth/session.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  signSession, verifySession, signFileToken, verifyFileToken,
  getSessionFromRequest, getFileAccessUserId,
} from './session';
import type { Session } from './types';

const session: Session = { userId: 'u1', username: 'alice', domain: 'civil-engineering' };

describe('session tokens', () => {
  it('round-trips through sign/verify', () => {
    const token = signSession(session);
    expect(verifySession(token)).toEqual(session);
  });

  it('rejects a tampered signature', () => {
    const token = signSession(session);
    const last = token.at(-1);
    const tampered = token.slice(0, -1) + (last === 'a' ? 'b' : 'a');
    expect(verifySession(tampered)).toBeNull();
  });

  it('rejects a file-scoped token', () => {
    const fileToken = signFileToken('u1');
    expect(verifySession(fileToken)).toBeNull();
  });
});

describe('file tokens', () => {
  it('round-trips through sign/verify', () => {
    const token = signFileToken('u1');
    expect(verifyFileToken(token)).toBe('u1');
  });

  it('rejects a full session token', () => {
    const token = signSession(session);
    expect(verifyFileToken(token)).toBeNull();
  });
});

describe('getSessionFromRequest', () => {
  it('reads a valid Bearer session token', () => {
    const token = signSession(session);
    const req = new Request('http://test/api/data', { headers: { Authorization: `Bearer ${token}` } });
    expect(getSessionFromRequest(req)).toEqual(session);
  });

  it('returns null with no Authorization header', () => {
    expect(getSessionFromRequest(new Request('http://test/api/data'))).toBeNull();
  });

  it('never accepts a token via the query string', () => {
    const token = signSession(session);
    const req = new Request(`http://test/api/data?token=${token}`);
    expect(getSessionFromRequest(req)).toBeNull();
  });
});

describe('getFileAccessUserId', () => {
  it('accepts a full session via Authorization header', () => {
    const token = signSession(session);
    const req = new Request('http://test/api/files/x', { headers: { Authorization: `Bearer ${token}` } });
    expect(getFileAccessUserId(req)).toBe('u1');
  });

  it('accepts a file-scoped token via the query string', () => {
    const token = signFileToken('u1');
    const req = new Request(`http://test/api/files/x?token=${token}`);
    expect(getFileAccessUserId(req)).toBe('u1');
  });

  it('rejects a full session token presented via the query string', () => {
    const token = signSession(session);
    const req = new Request(`http://test/api/files/x?token=${token}`);
    expect(getFileAccessUserId(req)).toBeNull();
  });

  it('returns null with nothing presented', () => {
    expect(getFileAccessUserId(new Request('http://test/api/files/x'))).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/auth/session.test.ts`
Expected: FAIL — `signFileToken`, `verifyFileToken`, `getFileAccessUserId` are not exported yet.

- [ ] **Step 3: Rewrite session.ts**

Replace the full contents of `lib/auth/session.ts`:

```ts
// Server-only: HMAC-SHA256 signed tokens verified via Node's crypto module.
// No cookies — each browser tab carries its own token (see lib/auth/client.ts)
// so different users can be signed in simultaneously in separate tabs of the
// same browser.
import crypto from 'node:crypto';
import type { Session } from './types';

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s === 'dev-secret-change-me') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SESSION_SECRET env var must be set in production');
    }
    return 'dev-secret-change-me';
  }
  return s;
}

// ── Token format: base64url(payload) + "." + base64url(signature) ────────────

function b64url(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf, 'utf8') : buf;
  return b.toString('base64url');
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

/** Verify the signature and decode the payload. Returns null on any failure. */
function decodeToken(token: string): Record<string, unknown> | null {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payload);
  if (
    expected.length !== sig.length ||
    !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
  ) {
    return null;
  }
  try {
    const decoded: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof decoded === 'object' && decoded !== null ? (decoded as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// ── Full session tokens ───────────────────────────────────────────────────────

export function signSession(session: Session): string {
  const payload = b64url(JSON.stringify(session));
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

/** A session token never carries a `scope` field — that marks a file-access token instead. */
export function verifySession(token: string): Session | null {
  const d = decodeToken(token);
  if (!d || 'scope' in d) return null;
  if (typeof d.userId !== 'string' || typeof d.username !== 'string' || typeof d.domain !== 'string') {
    return null;
  }
  return { userId: d.userId, username: d.username, domain: d.domain as Session['domain'] };
}

// ── File-access tokens ────────────────────────────────────────────────────────
// Scoped narrowly to file reads: usable only as the `?token=` query param on
// GET /api/files/[id] (see getFileAccessUserId below), never as a general
// session. This limits the blast radius if a token leaks via browser history,
// server access logs, or a Referer header — attachment URLs carry this, not
// the full session token.

export function signFileToken(userId: string): string {
  const payload = b64url(JSON.stringify({ userId, scope: 'files' }));
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

export function verifyFileToken(token: string): string | null {
  const d = decodeToken(token);
  if (!d || d.scope !== 'files' || typeof d.userId !== 'string') return null;
  return d.userId;
}

// ── Request auth ────────────────────────────────────────────────────────────

/** Full session from the Authorization: Bearer header. Used by every API route except the GET file-read path. */
export function getSessionFromRequest(req: Request): Session | null {
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  if (!token) return null;
  return verifySession(token);
}

/**
 * User id for a file read: accepts a full session (Authorization header) or a
 * file-scoped token via the `?token=` query param — the latter is how
 * <img>/<a> tags authenticate, since they can't send custom headers.
 */
export function getFileAccessUserId(req: Request): string | null {
  const session = getSessionFromRequest(req);
  if (session) return session.userId;
  try {
    const token = new URL(req.url).searchParams.get('token');
    if (token) {
      const userId = verifyFileToken(token);
      if (userId) return userId;
    }
  } catch {
    // Malformed URL — no query token to check.
  }
  return null;
}
```

- [ ] **Step 4: Run the session test to verify it passes**

Run: `npx vitest run lib/auth/session.test.ts`
Expected: PASS (all cases)

- [ ] **Step 5: Write the failing tests for the auth routes**

Create `app/api/auth/login/route.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ce-login-'));
  process.env.DATA_DIR = dir;
});
afterEach(async () => {
  delete process.env.DATA_DIR;
  await fs.rm(dir, { recursive: true, force: true });
});

describe('POST /api/auth/login', () => {
  it('returns a session token and a separately-scoped file token, and no Set-Cookie header', async () => {
    const { createUser } = await import('@/lib/auth/userStore');
    const { POST } = await import('./route');
    await createUser('alice', 'password123', 'civil-engineering');

    const req = new Request('http://test/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'alice', password: 'password123' }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(body.username).toBe('alice');
    expect(typeof body.token).toBe('string');
    expect(typeof body.fileToken).toBe('string');
    expect(body.token).not.toBe(body.fileToken);
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });

  it('rejects a wrong password', async () => {
    const { createUser } = await import('@/lib/auth/userStore');
    const { POST } = await import('./route');
    await createUser('alice', 'password123', 'civil-engineering');

    const req = new Request('http://test/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'alice', password: 'wrong' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});
```

Create `app/api/auth/register/route.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ce-register-'));
  process.env.DATA_DIR = dir;
});
afterEach(async () => {
  delete process.env.DATA_DIR;
  await fs.rm(dir, { recursive: true, force: true });
});

describe('POST /api/auth/register', () => {
  it('creates a user and returns a session token plus a separately-scoped file token, no Set-Cookie', async () => {
    const { POST } = await import('./route');
    const req = new Request('http://test/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username: 'bob', password: 'password123', domain: 'civil-engineering' }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.username).toBe('bob');
    expect(typeof body.token).toBe('string');
    expect(typeof body.fileToken).toBe('string');
    expect(body.token).not.toBe(body.fileToken);
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });

  it('rejects a duplicate username', async () => {
    const { POST } = await import('./route');
    const attempt = () => POST(new Request('http://test/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username: 'bob', password: 'password123', domain: 'civil-engineering' }),
    }));
    await attempt();
    const res = await attempt();
    expect(res.status).toBe(409);
  });
});
```

Create `app/api/auth/me/route.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { GET } from './route';
import { signSession } from '@/lib/auth/session';

describe('GET /api/auth/me', () => {
  it('returns the session plus a fresh token and fileToken for a valid Authorization header', async () => {
    const session = { userId: 'u1', username: 'alice', domain: 'civil-engineering' as const };
    const token = signSession(session);
    const req = new Request('http://test/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
    const res = await GET(req);
    const body = await res.json();
    expect(body).toMatchObject(session);
    expect(typeof body.token).toBe('string');
    expect(typeof body.fileToken).toBe('string');
  });

  it('returns 401 with no Authorization header', async () => {
    const res = await GET(new Request('http://test/api/auth/me'));
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 6: Run the route tests to verify they fail**

Run: `npx vitest run app/api/auth/login app/api/auth/register app/api/auth/me`
Expected: FAIL — routes still import the now-removed `sessionCookieHeader`/`clearCookieHeader`, and don't return `fileToken`.

- [ ] **Step 7: Update the auth routes**

Replace `app/api/auth/login/route.ts`:

```ts
import { findByUsername, verifyPassword } from '@/lib/auth/userStore';
import { signSession, signFileToken } from '@/lib/auth/session';

export async function POST(req: Request) {
  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { username, password } = body;
  if (!username || !password) {
    return Response.json({ error: 'Username and password are required' }, { status: 400 });
  }

  const user = await findByUsername(username);
  if (!user) {
    // Return same error for invalid username or wrong password (prevents enumeration)
    return Response.json({ error: 'Invalid username or password' }, { status: 401 });
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return Response.json({ error: 'Invalid username or password' }, { status: 401 });
  }

  const session = { userId: user.id, username: user.username, domain: user.domain };
  const token = signSession(session);
  const fileToken = signFileToken(user.id);
  return Response.json({ ...session, token, fileToken });
}
```

Replace `app/api/auth/register/route.ts`:

```ts
import { createUser } from '@/lib/auth/userStore';
import { signSession, signFileToken } from '@/lib/auth/session';
import type { Domain } from '@/lib/auth/types';
import { DOMAIN_LABELS } from '@/lib/auth/types';

const ALLOW_REGISTRATION = process.env.ALLOW_REGISTRATION !== 'false';

export async function POST(req: Request) {
  if (!ALLOW_REGISTRATION) {
    return Response.json({ error: 'Registration is disabled' }, { status: 403 });
  }

  let body: { username?: string; password?: string; domain?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { username, password, domain } = body;

  if (!username || typeof username !== 'string' || username.trim().length < 3) {
    return Response.json({ error: 'Username must be at least 3 characters' }, { status: 400 });
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    return Response.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
  }
  if (!domain || !(domain in DOMAIN_LABELS)) {
    return Response.json({ error: 'Invalid domain selected' }, { status: 400 });
  }
  // Sanitize username: alphanumeric + underscores only
  if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
    return Response.json(
      { error: 'Username may only contain letters, numbers, and underscores' },
      { status: 400 },
    );
  }

  try {
    const user = await createUser(username.trim(), password, domain as Domain);
    const session = { userId: user.id, username: user.username, domain: user.domain };
    const token = signSession(session);
    const fileToken = signFileToken(user.id);
    return Response.json({ ...session, token, fileToken }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === 'USERNAME_TAKEN') {
      return Response.json({ error: 'Username is already taken' }, { status: 409 });
    }
    console.error('[register]', err);
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}
```

Replace `app/api/auth/me/route.ts`:

```ts
import { getSessionFromRequest, signSession, signFileToken } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const token = signSession(session);
  const fileToken = signFileToken(session.userId);
  return Response.json({ ...session, token, fileToken });
}
```

Replace `app/api/auth/logout/route.ts`:

```ts
export async function POST() {
  return new Response(null, { status: 204 });
}
```

- [ ] **Step 8: Run the full test suite for this task to verify it passes**

Run: `npx vitest run lib/auth/session.test.ts app/api/auth/login app/api/auth/register app/api/auth/me`
Expected: PASS (all cases)

- [ ] **Step 9: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors

- [ ] **Step 10: Commit**

```bash
git add lib/auth/session.ts lib/auth/session.test.ts \
  app/api/auth/login/route.ts app/api/auth/login/route.test.ts \
  app/api/auth/register/route.ts app/api/auth/register/route.test.ts \
  app/api/auth/me/route.ts app/api/auth/me/route.test.ts \
  app/api/auth/logout/route.ts
git commit -m "feat: drop cookie auth for per-tab tokens; add scoped file-access tokens"
```

---

### Task 2: Client token storage — session token and file token, stored independently

**Files:**
- Modify: `lib/auth/client.ts` (full rewrite)
- Test: `lib/auth/client.test.ts` (new)

**Interfaces:**
- Consumes: nothing from Task 1 directly (this module only shapes what it stores; the server contract `{token, fileToken}` is assumed).
- Produces (used by Task 3):
  - `getStoredFileToken(): string | null`
  - `setStoredFileToken(token: string): void`
  - `clearStoredFileToken(): void`
  - `Session` interface gains `fileToken?: string`

- [ ] **Step 1: Write the failing test**

Create `lib/auth/client.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/auth/client.test.ts`
Expected: FAIL — `getStoredFileToken`/`setStoredFileToken`/`clearStoredFileToken` are not exported yet.

- [ ] **Step 3: Rewrite client.ts**

Replace the full contents of `lib/auth/client.ts`:

```ts
// Client-side auth helpers — thin fetch wrappers over /api/auth/*.
import type { Domain } from './types';

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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/auth/client.test.ts`
Expected: PASS (all cases)

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add lib/auth/client.ts lib/auth/client.test.ts
git commit -m "feat: store session and file tokens independently in sessionStorage"
```

---

### Task 3: Attachment file access — scoped tokens for GET, client components updated

**Files:**
- Modify: `app/api/files/[id]/route.ts`
- Modify: `components/AttachmentsPanel.tsx`
- Modify: `components/editor/MarkdownView.tsx`
- Test: `app/api/files/[id]/route.test.ts` (extend existing)
- Test: `components/editor/MarkdownView.test.tsx` (extend existing)
- Test: `components/AttachmentsPanel.test.tsx` (new)

**Interfaces:**
- Consumes: `getFileAccessUserId`, `getSessionFromRequest`, `signSession`, `signFileToken` (Task 1); `getStoredFileToken` (Task 2)
- Produces: nothing new for later tasks — this is the leaf consumer of the token scheme.

- [ ] **Step 1: Write the failing tests for the file route**

Replace `app/api/files/[id]/route.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { GET, DELETE } from './route';
import { signSession, signFileToken } from '@/lib/auth/session';

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe('/api/files/[id] auth guard', () => {
  it('GET returns 401 with no auth', async () => {
    const res = await GET(new Request('http://test/api/files/abc123'), ctx('abc123'));
    expect(res.status).toBe(401);
  });

  it('DELETE returns 401 with no auth', async () => {
    const res = await DELETE(new Request('http://test/api/files/abc123'), ctx('abc123'));
    expect(res.status).toBe(401);
  });

  it('GET accepts a full session via Authorization header', async () => {
    const token = signSession({ userId: 'u1', username: 'alice', domain: 'civil-engineering' });
    const req = new Request('http://test/api/files/abc123', { headers: { Authorization: `Bearer ${token}` } });
    const res = await GET(req, ctx('abc123'));
    expect(res.status).toBe(404); // no such blob, but auth passed the guard
  });

  it('GET accepts a file-scoped token via the query string', async () => {
    const token = signFileToken('u1');
    const req = new Request(`http://test/api/files/abc123?token=${token}`);
    const res = await GET(req, ctx('abc123'));
    expect(res.status).toBe(404); // no such blob, but auth passed the guard
  });

  it('GET rejects a full session token presented via the query string', async () => {
    const token = signSession({ userId: 'u1', username: 'alice', domain: 'civil-engineering' });
    const req = new Request(`http://test/api/files/abc123?token=${token}`);
    const res = await GET(req, ctx('abc123'));
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run it to verify the new cases fail**

Run: `npx vitest run app/api/files/[id]/route.test.ts`
Expected: FAIL on the three new cases — GET still uses `getSessionFromRequest` (header-only), so the query-token cases don't behave as expected yet (the "accepts a file-scoped token" case gets 401 instead of 404; the "rejects a full session token via query" case incidentally also 401s, but for the wrong reason — the header-only guard doesn't read the query at all yet).

- [ ] **Step 3: Update the file route**

Replace `app/api/files/[id]/route.ts`:

```ts
import { readBlob, deleteBlob, isValidBlobId } from '@/lib/repository/fileBlobStore';
import { getSessionFromRequest, getFileAccessUserId } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = getFileAccessUserId(req);
  if (!userId) return new Response(null, { status: 401 });
  const { id } = await params;
  if (!isValidBlobId(id)) return new Response(null, { status: 400 });
  const blob = await readBlob(id, userId);
  if (!blob) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(blob.bytes), {
    headers: {
      'Content-Type': blob.meta.mime,
      'Content-Disposition': `inline; filename="${blob.meta.name.replace(/"/g, '')}"`,
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return new Response(null, { status: 401 });
  const { id } = await params;
  if (!isValidBlobId(id)) return new Response(null, { status: 400 });
  await deleteBlob(id, session.userId);
  return new Response(null, { status: 204 });
}
```

- [ ] **Step 4: Run the file route test to verify it passes**

Run: `npx vitest run app/api/files/[id]/route.test.ts`
Expected: PASS (all cases)

- [ ] **Step 5: Write the failing tests for MarkdownView and AttachmentsPanel**

In `components/editor/MarkdownView.test.tsx`, add `vi` to the vitest import and a mock, then two new tests:

```ts
import { it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MarkdownView } from './MarkdownView';

vi.mock('@/lib/auth/client', () => ({ getStoredFileToken: () => 'file-tok' }));

// ...(existing tests unchanged)...

it('appends the stored file token to internal /api/files image URLs', () => {
  const { container } = render(<MarkdownView markdown={'![alt](/api/files/abc123)'} />);
  const img = container.querySelector('img');
  expect(img?.getAttribute('src')).toBe('/api/files/abc123?token=file-tok');
});

it('leaves external URLs untouched', () => {
  const { container } = render(<MarkdownView markdown={'[link](https://example.com)'} />);
  const a = container.querySelector('a');
  expect(a?.getAttribute('href')).toBe('https://example.com');
});
```

Create `components/AttachmentsPanel.test.tsx`:

```tsx
import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AttachmentsPanel } from './AttachmentsPanel';
import { useStore } from '@/store/useStore';
import type { Topic } from '@/lib/domain/types';

vi.mock('@/lib/auth/client', () => ({ getStoredFileToken: () => 'file-tok' }));

beforeEach(() => useStore.setState({ subjects: {}, chapters: {}, topics: {}, subjectOrder: [] }));

function topicWithAttachment(): Topic {
  const s = useStore.getState().addSubject('S');
  const c = useStore.getState().addChapter(s, 'C');
  const t = useStore.getState().addTopic(c, 'T');
  useStore.getState().addAttachment(t, {
    id: 'a1', name: 'diagram.png', kind: 'image', url: '/api/files/a1', createdAt: 1,
  });
  return useStore.getState().topics[t];
}

it('appends the stored file token to an internal attachment URL', () => {
  render(<AttachmentsPanel topic={topicWithAttachment()} />);
  const img = screen.getByAltText('diagram.png') as HTMLImageElement;
  expect(img.getAttribute('src')).toBe('/api/files/a1?token=file-tok');
});
```

- [ ] **Step 6: Run these to verify they fail**

Run: `npx vitest run components/editor/MarkdownView.test.tsx components/AttachmentsPanel.test.tsx`
Expected: FAIL — both components still import `getStoredToken`, which the mock in these tests doesn't provide (mock only exposes `getStoredFileToken`), so `addTokenToUrl` throws or returns the unmodified URL.

- [ ] **Step 7: Update the components**

In `components/AttachmentsPanel.tsx`, change the import and the token lookup inside `addTokenToUrl`:

```ts
import { getStoredFileToken } from '@/lib/auth/client';
```

```ts
function addTokenToUrl(url?: string): string {
  if (!url) return '';
  if (url.startsWith('/api/')) {
    const token = getStoredFileToken();
    if (token) {
      const separator = url.includes('?') ? '&' : '?';
      return `${url}${separator}token=${encodeURIComponent(token)}`;
    }
  }
  return url;
}
```

In `components/editor/MarkdownView.tsx`, make the identical change: import `getStoredFileToken` instead of `getStoredToken`, and use it inside `addTokenToUrl`.

- [ ] **Step 8: Run the component tests to verify they pass**

Run: `npx vitest run components/editor/MarkdownView.test.tsx components/AttachmentsPanel.test.tsx`
Expected: PASS (all cases)

- [ ] **Step 9: Run the full suite, typecheck, and lint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all green

- [ ] **Step 10: Commit**

```bash
git add app/api/files/\[id\]/route.ts app/api/files/\[id\]/route.test.ts \
  components/AttachmentsPanel.tsx components/AttachmentsPanel.test.tsx \
  components/editor/MarkdownView.tsx components/editor/MarkdownView.test.tsx
git commit -m "fix: use scoped file tokens (not the session token) for attachment URLs"
```

---

### Task 4: Fix the file GC route — require auth, scope by user

**Files:**
- Modify: `lib/repository/gc.ts`
- Modify: `app/api/files/gc/route.ts`
- Test: `lib/repository/gc.test.ts` (extend existing)
- Test: `app/api/files/gc/route.test.ts` (new)

**Interfaces:**
- Consumes: `getSessionFromRequest` (Task 1), `filesDir(userId?)`, `deleteBlob(id, userId?)`, `writeBlob(id, bytes, meta, userId?)` (existing, `lib/repository/fileBlobStore.ts`), `readData(userId?)` (existing, `lib/repository/fileStore.ts`)
- Produces: `sweepUnreferenced(referenced: Set<string>, now?: number, userId?: string): Promise<{ scanned: number; deleted: number }>` — signature gains a third optional param; existing two-arg calls keep working unchanged (legacy path).

- [ ] **Step 1: Write the failing test for per-user sweeping**

In `lib/repository/gc.test.ts`, update the `beforeEach`/`afterEach` to also set/clear `DATA_DIR` (needed for the per-user path, which ignores `DATA_FILE`):

```ts
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ce-gc-'));
  process.env.DATA_FILE = path.join(dir, 'appdata.json');
  process.env.DATA_DIR = dir;
});
afterEach(async () => {
  delete process.env.DATA_FILE;
  delete process.env.DATA_DIR;
  await fs.rm(dir, { recursive: true, force: true });
});
```

Then add a new describe block at the end of the file:

```ts
describe('sweepUnreferenced with a userId', () => {
  it('only touches that user\'s files directory', async () => {
    const { writeBlob, readBlob, GC_GRACE_MS } = await import('./fileBlobStore');
    const { sweepUnreferenced } = await import('./gc');
    const meta = { name: 'f', mime: 'image/png', size: 1 };
    await writeBlob('u1-blob', Buffer.from('a'), meta, 'user-1');
    await writeBlob('u2-blob', Buffer.from('b'), meta, 'user-2');
    const old = new Date(Date.now() - GC_GRACE_MS - 60_000);
    await fs.utimes(path.join(dir, 'users', 'user-1', 'files', 'u1-blob'), old, old);
    await fs.utimes(path.join(dir, 'users', 'user-2', 'files', 'u2-blob'), old, old);

    const result = await sweepUnreferenced(new Set(), Date.now(), 'user-1');
    expect(result).toEqual({ scanned: 1, deleted: 1 });
    expect(await readBlob('u1-blob', 'user-1')).toBeNull();
    expect(await readBlob('u2-blob', 'user-2')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/repository/gc.test.ts`
Expected: FAIL — `sweepUnreferenced` ignores the third argument today, so it sweeps the legacy dir (empty) instead of `user-1`'s dir, giving `{ scanned: 0, deleted: 0 }`.

- [ ] **Step 3: Thread userId through sweepUnreferenced**

In `lib/repository/gc.ts`, change the function signature and the two call sites that use the scoped directory/deletion:

```ts
export async function sweepUnreferenced(
  referenced: Set<string>,
  now = Date.now(),
  userId?: string,
): Promise<{ scanned: number; deleted: number }> {
  const dir = filesDir(userId);
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return { scanned: 0, deleted: 0 };
  }
  const ids = entries.filter((e) => !e.endsWith('.json'));
  let deleted = 0;
  for (const id of ids) {
    if (referenced.has(id)) continue;
    try {
      const stat = await fs.stat(path.join(dir, id));
      if (now - stat.mtimeMs < GC_GRACE_MS) continue;
      await deleteBlob(id, userId);
      deleted++;
    } catch {
      // Raced with another delete or unreadable entry — skip.
    }
  }
  return { scanned: ids.length, deleted };
}
```

(Only the signature line, the `filesDir(userId)` call, and the `deleteBlob(id, userId)` call change — the rest of the function body is unchanged.)

- [ ] **Step 4: Run the gc test to verify it passes**

Run: `npx vitest run lib/repository/gc.test.ts`
Expected: PASS (all cases, including the pre-existing legacy-path tests)

- [ ] **Step 5: Write the failing test for the GC route**

Create `app/api/files/gc/route.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { signSession } from '@/lib/auth/session';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ce-gc-route-'));
  process.env.DATA_DIR = dir;
});
afterEach(async () => {
  delete process.env.DATA_DIR;
  await fs.rm(dir, { recursive: true, force: true });
});

describe('POST /api/files/gc', () => {
  it('returns 401 with no session', async () => {
    const { POST } = await import('./route');
    const res = await POST(new Request('http://test/api/files/gc', { method: 'POST' }));
    expect(res.status).toBe(401);
  });

  it('only sweeps the authenticated user\'s files', async () => {
    const { writeBlob, readBlob, GC_GRACE_MS } = await import('@/lib/repository/fileBlobStore');
    const { POST } = await import('./route');
    const meta = { name: 'f', mime: 'image/png', size: 1 };
    await writeBlob('u1-blob', Buffer.from('a'), meta, 'user-1');
    await writeBlob('u2-blob', Buffer.from('b'), meta, 'user-2');
    const old = new Date(Date.now() - GC_GRACE_MS - 60_000);
    await fs.utimes(path.join(dir, 'users', 'user-1', 'files', 'u1-blob'), old, old);
    await fs.utimes(path.join(dir, 'users', 'user-2', 'files', 'u2-blob'), old, old);

    const token = signSession({ userId: 'user-1', username: 'alice', domain: 'civil-engineering' });
    const req = new Request('http://test/api/files/gc', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const res = await POST(req);
    expect(await res.json()).toEqual({ scanned: 1, deleted: 1 });
    expect(await readBlob('u1-blob', 'user-1')).toBeNull();
    expect(await readBlob('u2-blob', 'user-2')).not.toBeNull();
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run app/api/files/gc/route.test.ts`
Expected: FAIL — the route has no auth check and sweeps the legacy path, so both assertions fail.

- [ ] **Step 7: Update the GC route**

Replace `app/api/files/gc/route.ts`:

```ts
import { readData } from '@/lib/repository/fileStore';
import { referencedBlobIds, sweepUnreferenced } from '@/lib/repository/gc';
import { getSessionFromRequest } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const session = getSessionFromRequest(req);
  if (!session) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const data = await readData(session.userId);
  const result = await sweepUnreferenced(referencedBlobIds(data), Date.now(), session.userId);
  return Response.json(result);
}
```

- [ ] **Step 8: Run the GC route test to verify it passes**

Run: `npx vitest run app/api/files/gc/route.test.ts`
Expected: PASS (both cases)

- [ ] **Step 9: Run the full suite, typecheck, and lint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all green

- [ ] **Step 10: Commit**

```bash
git add lib/repository/gc.ts lib/repository/gc.test.ts \
  app/api/files/gc/route.ts app/api/files/gc/route.test.ts
git commit -m "fix: require auth and scope the file GC sweep by user"
```

---

### Task 5: Replace the hardcoded production SESSION_SECRET

**Files:**
- Modify: `docker-compose.yml`
- Modify: `.gitignore`
- Create: `.env.example`

**Interfaces:** None — infrastructure/config only, no code interfaces.

- [ ] **Step 1: Update docker-compose.yml to read the secret from the environment**

In `docker-compose.yml`, change:

```yaml
    environment:
      - SESSION_SECRET=development-only-session-secret-change-me-in-production
```

to:

```yaml
    environment:
      - SESSION_SECRET=${SESSION_SECRET}
```

- [ ] **Step 2: Un-ignore .env.example**

`.gitignore` already ignores everything matching `.env*` (see the "env files" section). Add a negation immediately after that line so the example file can be committed:

```
# env files (can opt-in for committing if needed)
.env*
!.env.example
```

- [ ] **Step 3: Create .env.example**

```
# Copy to .env and fill in a real value before running `docker compose up`.
# Generate one with: openssl rand -hex 32
SESSION_SECRET=
```

- [ ] **Step 4: Verify the compose file parses and substitutes correctly**

Run: `docker compose config`
Expected: valid YAML output; `SESSION_SECRET` resolves to whatever `.env`/shell environment provides (empty if neither is set yet — that's expected until Task 6's deploy step).

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml .gitignore .env.example
git commit -m "fix: read SESSION_SECRET from the environment instead of hardcoding it"
```

---

### Task 6: Full verification and deploy

**Files:** None (verification only; no code changes expected unless a prior step's checks surface an issue, in which case fix inline and re-run before committing).

- [ ] **Step 1: Full automated verification**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: zero type errors, zero lint warnings, all tests pass (the full suite, not just this feature's new files — confirms nothing outside the touched files regressed).

- [ ] **Step 2: Generate the production secret (confirm with the user before writing it or restarting the deployed container — this touches a live, shared service)**

```bash
openssl rand -hex 32
```

Write the output into a `.env` file at the repo root (gitignored, never committed):

```
SESSION_SECRET=<the generated value>
```

- [ ] **Step 3: Redeploy (confirm with the user first — this restarts the running container and logs every current user out once)**

```bash
docker compose build && docker compose up -d
```

- [ ] **Step 4: Manual cross-tab isolation check**

In a real browser against the deployed app:
1. Open two tabs to the app.
2. In tab 1, register or log in as user A.
3. In tab 2, register or log in as a different user B.
4. Confirm tab 1 still shows user A as logged in (reload tab 1 to be sure) — this is the original reported bug; it must no longer reproduce.
5. In each tab, open a topic with an image attachment (or upload one) and confirm the image loads.
6. Log out in tab 2; confirm tab 1 is unaffected.

- [ ] **Step 5: If any step above required a code fix, commit it**

```bash
git add -A
git commit -m "fix: <describe the specific fix made during verification>"
```

(Skip this step if verification passed with no changes needed.)

## Exit Criteria

- `npx tsc --noEmit`, `npm run lint`, and `npm test` all clean.
- Manual two-tab check in Task 6 Step 4 confirms no cross-tab session collision and that attachments still load.
- `docker-compose.yml` contains no literal secret; `.env` (gitignored) holds the real value on the host.
