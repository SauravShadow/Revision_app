// Server-only: single-use email tokens (see db/migrations/0002_email.sql).
// Only the SHA-256 hash is stored — the raw token exists only in the emailed
// link, so a database read can't hijack a pending verification or reset.
import crypto from 'node:crypto';
import { getPool } from './db';

const KINDS = {
  verification: { table: 'email_verification_tokens', ttlMs: 60 * 60 * 1000 },
  reset: { table: 'password_reset_tokens', ttlMs: 30 * 60 * 1000 },
} as const;

const COOLDOWN_MS = 60_000;

export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export async function issueToken(kind: keyof typeof KINDS, userId: string): Promise<string> {
  const { table, ttlMs } = KINDS[kind];
  const { rows } = await getPool().query<{ created_at: Date }>(
    `SELECT created_at FROM ${table} WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );
  if (rows[0] && Date.now() - rows[0].created_at.getTime() < COOLDOWN_MS) {
    throw new Error('COOLDOWN');
  }
  const raw = crypto.randomBytes(32).toString('hex');
  await getPool().query(
    `INSERT INTO ${table} (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`,
    [hashToken(raw), userId, new Date(Date.now() + ttlMs)],
  );
  return raw;
}

export async function consumeVerificationToken(raw: string): Promise<string | null> {
  const { rows } = await getPool().query<{ user_id: string }>(
    `DELETE FROM email_verification_tokens
     WHERE token_hash = $1 AND expires_at > now()
     RETURNING user_id`,
    [hashToken(raw)],
  );
  return rows[0]?.user_id ?? null;
}

export async function consumeResetToken(raw: string): Promise<string | null> {
  const { rows } = await getPool().query<{ user_id: string }>(
    `UPDATE password_reset_tokens SET used_at = now()
     WHERE token_hash = $1 AND expires_at > now() AND used_at IS NULL
     RETURNING user_id`,
    [hashToken(raw)],
  );
  return rows[0]?.user_id ?? null;
}
