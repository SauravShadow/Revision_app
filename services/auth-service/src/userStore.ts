// Server-only: manages the user registry in Postgres (see db/migrations/0001_init.sql).
import crypto from 'node:crypto';
import { getPool } from './db';
import type { Domain, UserRecord } from '@revision-app/shared';

interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  domain: Domain;
  created_at: Date;
  email: string | null;
  email_verified_at: Date | null;
}

function rowToUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    domain: row.domain,
    createdAt: row.created_at.getTime(),
    email: row.email,
    emailVerifiedAt: row.email_verified_at ? row.email_verified_at.getTime() : null,
  };
}

export async function listUsers(): Promise<UserRecord[]> {
  const { rows } = await getPool().query<UserRow>('SELECT * FROM users ORDER BY created_at');
  return rows.map(rowToUser);
}

export async function findByUsername(username: string): Promise<UserRecord | null> {
  const { rows } = await getPool().query<UserRow>(
    'SELECT * FROM users WHERE username_lower = lower($1)',
    [username],
  );
  return rows[0] ? rowToUser(rows[0]) : null;
}

export async function findById(id: string): Promise<UserRecord | null> {
  const { rows } = await getPool().query<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0] ? rowToUser(rows[0]) : null;
}

// A pg unique-violation on the partial email index arrives as error 23505 with
// the index name in `constraint` — the username conflict never throws (it's
// absorbed by ON CONFLICT DO NOTHING), so 23505 here can only mean the email.
function isEmailUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null &&
    (err as { code?: string }).code === '23505' &&
    (err as { constraint?: string }).constraint === 'users_email_lower_idx'
  );
}

export async function createUser(
  username: string,
  password: string,
  domain: Domain,
  email?: string | null,
): Promise<UserRecord> {
  const passwordHash = await hashPassword(password);
  // ON CONFLICT DO NOTHING + RETURNING makes the uniqueness check atomic:
  // under concurrent signups with the same username, exactly one INSERT
  // returns a row and the other returns none — no read-modify-write race.
  try {
    const { rows } = await getPool().query<UserRow>(
      `INSERT INTO users (username, password_hash, domain, email)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (username_lower) DO NOTHING
       RETURNING *`,
      [username, passwordHash, domain, email ?? null],
    );
    if (rows.length === 0) throw new Error('USERNAME_TAKEN');
    return rowToUser(rows[0]);
  } catch (err) {
    if (isEmailUniqueViolation(err)) throw new Error('EMAIL_TAKEN');
    throw err;
  }
}

export async function findByEmail(email: string): Promise<UserRecord | null> {
  const { rows } = await getPool().query<UserRow>(
    'SELECT * FROM users WHERE email_lower = lower($1)',
    [email],
  );
  return rows[0] ? rowToUser(rows[0]) : null;
}

export async function markEmailVerified(userId: string): Promise<void> {
  await getPool().query('UPDATE users SET email_verified_at = now() WHERE id = $1', [userId]);
}

export async function setEmail(userId: string, email: string): Promise<void> {
  try {
    await getPool().query(
      'UPDATE users SET email = $2, email_verified_at = NULL WHERE id = $1',
      [userId, email],
    );
  } catch (err) {
    if (isEmailUniqueViolation(err)) throw new Error('EMAIL_TAKEN');
    throw err;
  }
}

export async function updatePassword(userId: string, newPassword: string): Promise<void> {
  const passwordHash = await hashPassword(newPassword);
  await getPool().query('UPDATE users SET password_hash = $2 WHERE id = $1', [userId, passwordHash]);
}

// ── Password hashing (PBKDF2-SHA256 via Node crypto, no extra deps) ──────────

const ITERATIONS = 310_000;
const KEY_LEN = 32;
const DIGEST = 'sha256';

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await new Promise<Buffer>((resolve, reject) => {
    crypto.pbkdf2(password, salt, ITERATIONS, KEY_LEN, DIGEST, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
  // Store as "iterations:salt_hex:key_hex"
  return `${ITERATIONS}:${salt.toString('hex')}:${key.toString('hex')}`;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [iters, saltHex, keyHex] = hash.split(':');
  if (!iters || !saltHex || !keyHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(keyHex, 'hex');
  const key = await new Promise<Buffer>((resolve, reject) => {
    crypto.pbkdf2(password, salt, parseInt(iters, 10), expected.length, DIGEST, (err, dk) => {
      if (err) reject(err);
      else resolve(dk);
    });
  });
  return crypto.timingSafeEqual(key, expected);
}
