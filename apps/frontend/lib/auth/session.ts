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
