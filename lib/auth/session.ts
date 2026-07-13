// Server-only: HMAC-SHA256 signed session tokens stored in HTTP-only cookies.
// No external JWT library needed — uses Node's built-in crypto module.
import crypto from 'node:crypto';
import type { Session } from './types';

const COOKIE_NAME = 'revision_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

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

export function signSession(session: Session): string {
  const payload = b64url(JSON.stringify(session));
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

export function verifySession(token: string): Session | null {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  // Constant-time comparison to prevent timing attacks
  const expected = sign(payload);
  if (
    expected.length !== sig.length ||
    !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
  ) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Session;
  } catch {
    return null;
  }
}

// ── Cookie helpers ────────────────────────────────────────────────────────────

export { COOKIE_NAME, MAX_AGE_SECONDS };

export function sessionCookieHeader(token: string): string {
  const flags = [
    `${COOKIE_NAME}=${token}`,
    `Max-Age=${MAX_AGE_SECONDS}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    ...(process.env.NODE_ENV === 'production' ? ['Secure'] : []),
  ];
  return flags.join('; ');
}

export function clearCookieHeader(): string {
  return `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`;
}

/** Read the session cookie from a Next.js Request. */
export function getSessionFromRequest(req: Request): Session | null {
  const cookieHeader = req.headers.get('cookie') ?? '';
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (!match) return null;
  return verifySession(decodeURIComponent(match[1]));
}
