# Email Verification & Password Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New signups require a verified email before first login, and any account with an email can recover a forgotten password via an emailed link — per `docs/superpowers/specs/2026-07-14-email-verification-password-reset-design.md`.

**Architecture:** All server changes live in `services/auth-service` (its own `revision_auth` Postgres database). Email goes out through a tiny `EmailSender` interface — Resend when `RESEND_API_KEY` is set, a console logger otherwise (so dev/smoke work before the Resend account is configured). The Next.js gateway (`apps/frontend`) grows six thin proxy routes and four pages (verify-email, forgot-password, reset-password, settings).

**Tech Stack:** Express 4 + pg (auth-service), vitest + supertest against real Postgres, Next.js 15 App Router + React 19 (frontend), vitest + testing-library (frontend tests).

## Global Constraints

- Run every command from the repo root: `/home/subaru/projects/revision_app`.
- Tests hit **real Postgres** (`revision_auth_test` via the compose `db` container on host port 5433) — never a mocked `pg` client.
- Test environment for every auth-service test/migrate command in this plan (set once per shell):
  ```bash
  export PGPW=$(grep -oP '(?<=^POSTGRES_PASSWORD=).*' .env)
  export SESSION_SECRET=$(grep -oP '(?<=^SESSION_SECRET=).*' .env)
  export DATABASE_URL="postgres://revision:${PGPW}@127.0.0.1:5433/revision_auth_test"
  ```
  (Requires `docker compose up -d db` if the db container isn't running.)
- Tokens: 32 random bytes as 64-char lowercase hex; only the SHA-256 hex hash is stored. Verification tokens expire in **1 hour**, reset tokens in **30 minutes**. Per-account **60-second cooldown** between token issues of the same kind (429 on violation).
- Grandfathered accounts (`email IS NULL`) log in exactly as before — no verification gate.
- Password reset does **not** revoke other sessions (stateless HMAC tokens — spec scope decision). No rate limiting beyond the cooldown.
- New auth-service env vars, all optional in dev: `RESEND_API_KEY`, `FROM_EMAIL`, `FRONTEND_URL` (default `http://127.0.0.1:3200`). Missing `RESEND_API_KEY` → emails are logged to stdout, not sent.
- Exact response copy (use verbatim):
  - REGISTER_OK: `Account created — check your email for a verification link.`
  - VERIFY_OK: `Email verified — you can now sign in.`
  - TOKEN_BAD: `This link is invalid or has expired.` (with `code: 'TOKEN_INVALID'`)
  - RESEND_GENERIC: `If that account exists and is unverified, a new verification email has been sent.`
  - FORGOT_GENERIC: `If an account with that email exists, a password-reset link has been sent.`
  - RESET_OK: `Password updated — you can now sign in.`
  - COOLDOWN_MSG: `Please wait a minute before requesting another email.` (HTTP 429)
  - UNVERIFIED_MSG: `Please verify your email before signing in.` (HTTP 403, `code: 'EMAIL_UNVERIFIED'`)
- Email format check (server and client): `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` on the trimmed value.
- Commit after every task. Do not commit `.env`.

---

### Task 1: Database migration `0002_email.sql`

**Files:**
- Create: `services/auth-service/db/migrations/0002_email.sql`

**Interfaces:**
- Produces: `users.email`, `users.email_lower` (generated), `users.email_verified_at`; tables `email_verification_tokens`, `password_reset_tokens`. All later tasks depend on this schema.

- [ ] **Step 1: Write the migration**

```sql
ALTER TABLE users
  ADD COLUMN email text,
  ADD COLUMN email_lower text GENERATED ALWAYS AS (lower(email)) STORED,
  ADD COLUMN email_verified_at timestamptz;

CREATE UNIQUE INDEX users_email_lower_idx ON users (email_lower) WHERE email_lower IS NOT NULL;

CREATE TABLE email_verification_tokens (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE password_reset_tokens (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

- [ ] **Step 2: Apply to the test database**

Run (with the Global Constraints env exports in place):
```bash
npm run db:migrate -w services/auth-service
```
Expected output includes: `applying: 0002_email.sql`

- [ ] **Step 3: Apply to the dev database too**

```bash
DATABASE_URL="postgres://revision:${PGPW}@127.0.0.1:5433/revision_auth" npm run db:migrate -w services/auth-service
```
Expected: `applying: 0002_email.sql`. (Production applies it automatically — the auth-service Dockerfile CMD runs `npm run db:migrate && npm start`.)

- [ ] **Step 4: Verify the schema**

```bash
PGPASSWORD=$PGPW psql -h 127.0.0.1 -p 5433 -U revision -d revision_auth_test -c '\d users' | grep email
```
Expected: three rows — `email`, `email_lower` (generated), `email_verified_at`.

- [ ] **Step 5: Confirm existing tests still pass, then commit**

```bash
npm test -w services/auth-service
```
Expected: all pass (schema change is additive).

```bash
git add services/auth-service/db/migrations/0002_email.sql
git commit -m "feat(auth): add email columns and verification/reset token tables"
```

---

### Task 2: Email fields in the user store

**Files:**
- Modify: `packages/shared/src/authTypes.ts` (UserRecord)
- Modify: `services/auth-service/src/userStore.ts`
- Test: `services/auth-service/src/userStore.test.ts`

**Interfaces:**
- Produces (all exported from `userStore.ts`):
  - `createUser(username: string, password: string, domain: Domain, email?: string | null): Promise<UserRecord>` — throws `Error('USERNAME_TAKEN')` / `Error('EMAIL_TAKEN')`
  - `findByEmail(email: string): Promise<UserRecord | null>` (case-insensitive)
  - `markEmailVerified(userId: string): Promise<void>`
  - `setEmail(userId: string, email: string): Promise<void>` — sets email, clears `email_verified_at`; throws `Error('EMAIL_TAKEN')`
  - `updatePassword(userId: string, newPassword: string): Promise<void>`
  - `UserRecord` gains `email: string | null; emailVerifiedAt: number | null;`

- [ ] **Step 1: Write the failing tests** — append to the `describe('userStore', …)` block in `services/auth-service/src/userStore.test.ts`:

```ts
  it('stores email on signup and finds the user by email case-insensitively', async () => {
    const { createUser, findByEmail } = await import('./userStore');
    const created = await createUser('emma', 'password123', 'civil-engineering', 'Emma@Example.com');
    expect(created.email).toBe('Emma@Example.com');
    expect(created.emailVerifiedAt).toBeNull();
    expect(await findByEmail('emma@example.COM')).toEqual(created);
  });

  it('rejects a second account with the same email', async () => {
    const { createUser } = await import('./userStore');
    await createUser('first', 'password123', 'civil-engineering', 'dup@example.com');
    await expect(
      createUser('second', 'password123', 'civil-engineering', 'DUP@example.com'),
    ).rejects.toThrow('EMAIL_TAKEN');
  });

  it('marks an email verified', async () => {
    const { createUser, markEmailVerified, findById } = await import('./userStore');
    const u = await createUser('verifyme', 'password123', 'civil-engineering', 'v@example.com');
    await markEmailVerified(u.id);
    const after = await findById(u.id);
    expect(after?.emailVerifiedAt).toBeTypeOf('number');
  });

  it('setEmail attaches an email to a grandfathered account and resets verification', async () => {
    const { createUser, setEmail, markEmailVerified, findById } = await import('./userStore');
    const u = await createUser('oldtimer', 'password123', 'civil-engineering'); // no email
    await setEmail(u.id, 'late@example.com');
    let after = await findById(u.id);
    expect(after?.email).toBe('late@example.com');
    expect(after?.emailVerifiedAt).toBeNull();
    await markEmailVerified(u.id);
    await setEmail(u.id, 'other@example.com'); // replacing resets verification
    after = await findById(u.id);
    expect(after?.emailVerifiedAt).toBeNull();
  });

  it('updatePassword changes the stored hash so the new password verifies', async () => {
    const { createUser, updatePassword, findById, verifyPassword } = await import('./userStore');
    const u = await createUser('rotator', 'oldpassword', 'civil-engineering');
    await updatePassword(u.id, 'newpassword');
    const after = await findById(u.id);
    expect(await verifyPassword('newpassword', after!.passwordHash)).toBe(true);
    expect(await verifyPassword('oldpassword', after!.passwordHash)).toBe(false);
  });
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test -w services/auth-service
```
Expected: FAIL — `findByEmail is not a function` (and TS errors for the extra `createUser` argument).

- [ ] **Step 3: Implement**

In `packages/shared/src/authTypes.ts`, extend `UserRecord`:

```ts
/** Persisted user record (server-only, never sent to client). */
export interface UserRecord {
  id: string;
  username: string;
  passwordHash: string;
  domain: Domain;
  createdAt: number;
  /** null for grandfathered accounts created before email existed */
  email: string | null;
  emailVerifiedAt: number | null;
}
```

In `services/auth-service/src/userStore.ts`, extend `UserRow` and `rowToUser`:

```ts
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
```

Replace `createUser` and add the new functions:

```ts
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
```

- [ ] **Step 4: Run tests and typecheck**

```bash
npm test -w services/auth-service
npx tsc --noEmit -p services/auth-service && npx tsc --noEmit -p packages/shared
```
Expected: all PASS, no type errors. If `tsc` flags other `UserRecord` object literals missing the new fields, add `email: null, emailVerifiedAt: null` there.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/authTypes.ts services/auth-service/src/userStore.ts services/auth-service/src/userStore.test.ts
git commit -m "feat(auth): email fields on users — findByEmail, setEmail, markEmailVerified, updatePassword"
```

---

### Task 3: Token store (verification + reset tokens, cooldown)

**Files:**
- Create: `services/auth-service/src/tokenStore.ts`
- Test: `services/auth-service/src/tokenStore.test.ts`

**Interfaces:**
- Produces (all exported):
  - `issueToken(kind: 'verification' | 'reset', userId: string): Promise<string>` — returns the **raw** 64-hex token; throws `Error('COOLDOWN')` if the same user got one of the same kind < 60 s ago
  - `consumeVerificationToken(raw: string): Promise<string | null>` — deletes the row, returns `user_id`, or `null` if unknown/expired
  - `consumeResetToken(raw: string): Promise<string | null>` — marks `used_at`, returns `user_id`, or `null` if unknown/expired/used
  - `hashToken(raw: string): string` — SHA-256 hex (exported for tests)

- [ ] **Step 1: Write the failing tests** — create `services/auth-service/src/tokenStore.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getPool } from './db';
import { createUser } from './userStore';
import { issueToken, consumeVerificationToken, consumeResetToken, hashToken } from './tokenStore';

beforeEach(async () => {
  await getPool().query('TRUNCATE users CASCADE'); // cascades into both token tables
});

afterAll(() => getPool().end());

async function makeUser(name = 'tokenuser') {
  return createUser(name, 'password123', 'civil-engineering', `${name}@example.com`);
}

describe('tokenStore', () => {
  it('issues a 64-hex token and consuming it verifies exactly once', async () => {
    const user = await makeUser();
    const raw = await issueToken('verification', user.id);
    expect(raw).toMatch(/^[a-f0-9]{64}$/);
    expect(await consumeVerificationToken(raw)).toBe(user.id);
    expect(await consumeVerificationToken(raw)).toBeNull(); // single-use
  });

  it('rejects an expired verification token', async () => {
    const user = await makeUser();
    const raw = 'a'.repeat(64);
    await getPool().query(
      `INSERT INTO email_verification_tokens (token_hash, user_id, expires_at)
       VALUES ($1, $2, now() - interval '1 minute')`,
      [hashToken(raw), user.id],
    );
    expect(await consumeVerificationToken(raw)).toBeNull();
  });

  it('enforces the 60-second per-account cooldown per token kind', async () => {
    const user = await makeUser();
    await issueToken('verification', user.id);
    await expect(issueToken('verification', user.id)).rejects.toThrow('COOLDOWN');
    // a different kind is a separate cooldown bucket
    await expect(issueToken('reset', user.id)).resolves.toMatch(/^[a-f0-9]{64}$/);
  });

  it('reset tokens are single-use via used_at', async () => {
    const user = await makeUser();
    const raw = await issueToken('reset', user.id);
    expect(await consumeResetToken(raw)).toBe(user.id);
    expect(await consumeResetToken(raw)).toBeNull();
  });

  it('rejects an unknown token outright', async () => {
    expect(await consumeVerificationToken('f'.repeat(64))).toBeNull();
    expect(await consumeResetToken('f'.repeat(64))).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test -w services/auth-service
```
Expected: FAIL — `Cannot find module './tokenStore'`.

- [ ] **Step 3: Implement** — create `services/auth-service/src/tokenStore.ts`:

```ts
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
```

- [ ] **Step 4: Run tests**

```bash
npm test -w services/auth-service
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/auth-service/src/tokenStore.ts services/auth-service/src/tokenStore.test.ts
git commit -m "feat(auth): hashed single-use verification/reset tokens with 60s cooldown"
```

---

### Task 4: Email module (`EmailSender`, templates, Resend, console fallback)

**Files:**
- Create: `services/auth-service/src/email/emailSender.ts`
- Create: `services/auth-service/src/email/templates.ts`
- Create: `services/auth-service/src/email/resendEmailSender.ts`
- Create: `services/auth-service/src/email/consoleEmailSender.ts`
- Create: `services/auth-service/src/email/index.ts`
- Test: `services/auth-service/src/email/email.test.ts`

**Interfaces:**
- Produces:
  - `interface EmailSender { send(to: string, subject: string, html: string): Promise<void> }` (from `emailSender.ts`, re-exported from `index.ts`)
  - `verificationEmail(link: string): { subject: string; html: string }` and `passwordResetEmail(link: string): { subject: string; html: string }` — html contains `<a href="${link}">`
  - `createDefaultEmailSender(): EmailSender` — `ResendEmailSender` when `RESEND_API_KEY` is set, else `ConsoleEmailSender`
  - `class ResendEmailSender implements EmailSender { constructor(apiKey: string, from: string) }`
  - `class ConsoleEmailSender implements EmailSender` — `console.log`s recipient/subject/body (dev + smoke-test path)

- [ ] **Step 1: Write the failing tests** — create `services/auth-service/src/email/email.test.ts`:

```ts
import { describe, it, expect, afterEach, vi } from 'vitest';
import { verificationEmail, passwordResetEmail } from './templates';
import { createDefaultEmailSender } from './index';
import { ResendEmailSender } from './resendEmailSender';
import { ConsoleEmailSender } from './consoleEmailSender';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('templates', () => {
  it('both templates embed the link and mention their expiry', () => {
    const v = verificationEmail('https://x/verify-email?token=abc');
    expect(v.subject).toContain('Verify');
    expect(v.html).toContain('href="https://x/verify-email?token=abc"');
    expect(v.html).toContain('1 hour');

    const r = passwordResetEmail('https://x/reset-password?token=abc');
    expect(r.subject.toLowerCase()).toContain('reset');
    expect(r.html).toContain('href="https://x/reset-password?token=abc"');
    expect(r.html).toContain('30 minutes');
  });
});

describe('createDefaultEmailSender', () => {
  it('falls back to the console sender when RESEND_API_KEY is unset', () => {
    vi.stubEnv('RESEND_API_KEY', '');
    expect(createDefaultEmailSender()).toBeInstanceOf(ConsoleEmailSender);
  });

  it('uses Resend when RESEND_API_KEY is set', () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_key');
    vi.stubEnv('FROM_EMAIL', 'noreply@example.com');
    expect(createDefaultEmailSender()).toBeInstanceOf(ResendEmailSender);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test -w services/auth-service
```
Expected: FAIL — `Cannot find module './templates'`.

- [ ] **Step 3: Implement the five files**

`services/auth-service/src/email/emailSender.ts`:
```ts
// The seam everything else talks to — nothing outside this directory may
// reference Resend directly, so switching providers is a one-file change.
export interface EmailSender {
  send(to: string, subject: string, html: string): Promise<void>;
}
```

`services/auth-service/src/email/templates.ts`:
```ts
// Plain functional HTML — deliberately not a design priority (see spec).
export function verificationEmail(link: string): { subject: string; html: string } {
  return {
    subject: 'Verify your email — RevisionOS',
    html: `<p>Welcome to RevisionOS!</p>
<p><a href="${link}">Click here to verify your email address</a>. This link expires in 1 hour.</p>
<p>If you didn't create this account, you can ignore this email.</p>`,
  };
}

export function passwordResetEmail(link: string): { subject: string; html: string } {
  return {
    subject: 'Reset your password — RevisionOS',
    html: `<p><a href="${link}">Click here to reset your password</a>. This link expires in 30 minutes and can be used once.</p>
<p>If you didn't request this, you can ignore this email — your password is unchanged.</p>`,
  };
}
```

`services/auth-service/src/email/resendEmailSender.ts`:
```ts
import type { EmailSender } from './emailSender';

export class ResendEmailSender implements EmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(to: string, subject: string, html: string): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ from: this.from, to, subject, html }),
    });
    if (!res.ok) {
      throw new Error(`Resend API error ${res.status}: ${await res.text()}`);
    }
  }
}
```

`services/auth-service/src/email/consoleEmailSender.ts`:
```ts
import type { EmailSender } from './emailSender';

// Dev/smoke fallback when RESEND_API_KEY is unset: the verification/reset
// link is only reachable via these log lines (scripts/smoke-test.mjs greps
// them out of `docker logs`), so they must go to stdout via console.log.
export class ConsoleEmailSender implements EmailSender {
  async send(to: string, subject: string, html: string): Promise<void> {
    console.log(`[email] RESEND_API_KEY not set — NOT sending to ${to}: ${subject}`);
    console.log(`[email] body: ${html.replace(/\n/g, ' ')}`);
  }
}
```

`services/auth-service/src/email/index.ts`:
```ts
import type { EmailSender } from './emailSender';
import { ResendEmailSender } from './resendEmailSender';
import { ConsoleEmailSender } from './consoleEmailSender';

export type { EmailSender } from './emailSender';
export { verificationEmail, passwordResetEmail } from './templates';

export function createDefaultEmailSender(): EmailSender {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return new ConsoleEmailSender();
  return new ResendEmailSender(apiKey, process.env.FROM_EMAIL ?? 'noreply@localhost');
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -w services/auth-service
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/auth-service/src/email
git commit -m "feat(auth): EmailSender seam — Resend implementation with console fallback"
```

---

### Task 5: Server — register requires email, verify-email, resend-verification, login gate

**Files:**
- Modify: `services/auth-service/src/server.ts`
- Test: `services/auth-service/src/server.test.ts` (existing register tests change too)

**Interfaces:**
- Consumes: Task 2–4 exports (`createUser` with email, `findByEmail`, `markEmailVerified`, `issueToken`, `consumeVerificationToken`, `EmailSender`, `createDefaultEmailSender`, `verificationEmail`).
- Produces:
  - `createApp(emailSender: EmailSender = createDefaultEmailSender())` — the injection seam tests use
  - `POST /register` body `{username, password, domain, email}` → 201 `{message}` (no session token) | 400 | 409
  - `GET /verify-email?token=…` → 200 `{message}` | 400 `{error, code: 'TOKEN_INVALID'}`
  - `POST /resend-verification` body `{identifier}` (username **or** email) → 200 `{message}` (generic) | 429
  - `POST /login` → 403 `{error, code: 'EMAIL_UNVERIFIED'}` when email present but unverified; unchanged otherwise

- [ ] **Step 1: Rewrite the test file** — replace `services/auth-service/src/server.test.ts` in full (the old register tests assumed register returns a session; that contract is gone):

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { getPool } from './db';
import { createApp } from './server';
import { createUser } from './userStore';
import type { EmailSender } from './email';

class FakeEmailSender implements EmailSender {
  sent: Array<{ to: string; subject: string; html: string }> = [];
  async send(to: string, subject: string, html: string) {
    this.sent.push({ to, subject, html });
  }
  lastToken(): string {
    const m = this.sent.at(-1)?.html.match(/token=([a-f0-9]{64})/);
    if (!m) throw new Error('no token found in last email');
    return m[1];
  }
}

const emails = new FakeEmailSender();
const app = createApp(emails);

const REG = { username: 'alice', password: 'password123', domain: 'civil-engineering', email: 'alice@example.com' };

beforeEach(async () => {
  await getPool().query('TRUNCATE users CASCADE');
  emails.sent = [];
});

afterAll(async () => {
  await getPool().end();
});

describe('POST /register with email verification', () => {
  it('requires a valid email', async () => {
    const noEmail = await request(app).post('/register').send({ ...REG, email: undefined });
    expect(noEmail.status).toBe(400);
    const badEmail = await request(app).post('/register').send({ ...REG, email: 'not-an-email' });
    expect(badEmail.status).toBe(400);
  });

  it('creates the account, emails a verification link, and returns no session token', async () => {
    const res = await request(app).post('/register').send(REG);
    expect(res.status).toBe(201);
    expect(res.body.token).toBeUndefined();
    expect(res.body.message).toContain('check your email');
    expect(emails.sent).toHaveLength(1);
    expect(emails.sent[0].to).toBe('alice@example.com');
    expect(emails.sent[0].html).toContain('/verify-email?token=');
  });

  it('rejects a duplicate email with 409', async () => {
    await request(app).post('/register').send(REG);
    const res = await request(app).post('/register').send({ ...REG, username: 'alice2' });
    expect(res.status).toBe(409);
  });
});

describe('login gate + GET /verify-email', () => {
  it('blocks login until the emailed token is used, then allows it', async () => {
    await request(app).post('/register').send(REG);

    const before = await request(app).post('/login').send({ username: 'alice', password: 'password123' });
    expect(before.status).toBe(403);
    expect(before.body.code).toBe('EMAIL_UNVERIFIED');

    const verify = await request(app).get(`/verify-email?token=${emails.lastToken()}`);
    expect(verify.status).toBe(200);

    const after = await request(app).post('/login').send({ username: 'alice', password: 'password123' });
    expect(after.status).toBe(200);
    expect(typeof after.body.token).toBe('string');
  });

  it('rejects an unknown or missing token', async () => {
    const bogus = await request(app).get(`/verify-email?token=${'f'.repeat(64)}`);
    expect(bogus.status).toBe(400);
    expect(bogus.body.code).toBe('TOKEN_INVALID');
    const missing = await request(app).get('/verify-email');
    expect(missing.status).toBe(400);
  });

  it('grandfathered accounts (no email) log in with no verification gate', async () => {
    await createUser('oldtimer', 'password123', 'civil-engineering'); // email IS NULL
    const res = await request(app).post('/login').send({ username: 'oldtimer', password: 'password123' });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
  });

  it('still rejects a wrong password', async () => {
    await createUser('bob', 'password123', 'civil-engineering');
    const res = await request(app).post('/login').send({ username: 'bob', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('a valid login token still works on /me', async () => {
    await createUser('carol', 'password123', 'civil-engineering');
    const login = await request(app).post('/login').send({ username: 'carol', password: 'password123' });
    const me = await request(app).get('/me').set('Authorization', `Bearer ${login.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.username).toBe('carol');
  });
});

describe('POST /resend-verification', () => {
  it('is cooldown-limited right after registration', async () => {
    await request(app).post('/register').send(REG); // issued a token seconds ago
    const res = await request(app).post('/resend-verification').send({ identifier: 'alice' });
    expect(res.status).toBe(429);
  });

  it('answers generically for unknown identifiers and sends nothing', async () => {
    const res = await request(app).post('/resend-verification').send({ identifier: 'ghost@example.com' });
    expect(res.status).toBe(200);
    expect(emails.sent).toHaveLength(0);
  });

  it('answers generically for already-verified accounts and sends nothing', async () => {
    await request(app).post('/register').send(REG);
    await request(app).get(`/verify-email?token=${emails.lastToken()}`);
    emails.sent = [];
    const res = await request(app).post('/resend-verification').send({ identifier: 'alice@example.com' });
    expect(res.status).toBe(200);
    expect(emails.sent).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test -w services/auth-service
```
Expected: FAIL — `createApp` takes no argument yet / register returns 201 with token / 404 on `/verify-email`.

- [ ] **Step 3: Implement in `server.ts`**

Update the imports and `createApp` signature:

```ts
import express from 'express';
import { findByUsername, findByEmail, createUser, verifyPassword, markEmailVerified } from './userStore';
import { issueToken, consumeVerificationToken } from './tokenStore';
import { createDefaultEmailSender, verificationEmail } from './email';
import type { EmailSender } from './email';
import { DOMAIN_LABELS } from '@revision-app/shared';
import type { Domain } from '@revision-app/shared';
import { signSession, signFileToken, verifySession } from '@revision-app/shared/server';

const ALLOW_REGISTRATION = process.env.ALLOW_REGISTRATION !== 'false';
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://127.0.0.1:3200';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function createApp(emailSender: EmailSender = createDefaultEmailSender()) {
```

Inside `createApp`, add a helper right after `app.use(express.json())` (used again by Task 7):

```ts
  async function sendVerification(userId: string, to: string): Promise<void> {
    const raw = await issueToken('verification', userId);
    const { subject, html } = verificationEmail(`${FRONTEND_URL}/verify-email?token=${raw}`);
    try {
      await emailSender.send(to, subject, html);
    } catch (err) {
      // The account/token are already in place — the user can hit
      // resend-verification once the mail provider recovers.
      console.error('[email] failed to send verification email', err);
    }
  }
```

In `POST /register`, add email validation after the existing password check:

```ts
    const { username, password, domain, email } = req.body ?? {};
    // …existing username/password/domain checks stay as they are…
    if (!email || typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      return res.status(400).json({ error: 'A valid email address is required' });
    }
```

and replace the success path + error handling:

```ts
    try {
      const user = await createUser(username.trim(), password, domain as Domain, email.trim());
      await sendVerification(user.id, user.email!);
      res.status(201).json({ message: 'Account created — check your email for a verification link.' });
    } catch (err) {
      if (err instanceof Error && err.message === 'USERNAME_TAKEN') {
        return res.status(409).json({ error: 'Username is already taken' });
      }
      if (err instanceof Error && err.message === 'EMAIL_TAKEN') {
        return res.status(409).json({ error: 'An account with that email already exists' });
      }
      console.error('[register]', err);
      res.status(500).json({ error: 'Server error' });
    }
```

In `POST /login`, add the gate between the password check and the session response:

```ts
    if (user.email && !user.emailVerifiedAt) {
      return res.status(403).json({ error: 'Please verify your email before signing in.', code: 'EMAIL_UNVERIFIED' });
    }
```

Add the two new endpoints (before `return app`):

```ts
  app.get('/verify-email', async (req, res) => {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    if (!token) return res.status(400).json({ error: 'Missing token' });
    try {
      const userId = await consumeVerificationToken(token);
      if (!userId) {
        return res.status(400).json({ error: 'This link is invalid or has expired.', code: 'TOKEN_INVALID' });
      }
      await markEmailVerified(userId);
      res.json({ message: 'Email verified — you can now sign in.' });
    } catch (err) {
      console.error('[verify-email]', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/resend-verification', async (req, res) => {
    const { identifier } = req.body ?? {};
    const generic = { message: 'If that account exists and is unverified, a new verification email has been sent.' };
    if (!identifier || typeof identifier !== 'string') {
      return res.status(400).json({ error: 'Username or email is required' });
    }
    try {
      const user = (await findByUsername(identifier.trim())) ?? (await findByEmail(identifier.trim()));
      // Same generic answer whether the account is missing, has no email, or
      // is already verified — no account enumeration through this endpoint.
      if (!user?.email || user.emailVerifiedAt) return res.json(generic);
      await sendVerification(user.id, user.email);
      res.json(generic);
    } catch (err) {
      if (err instanceof Error && err.message === 'COOLDOWN') {
        return res.status(429).json({ error: 'Please wait a minute before requesting another email.' });
      }
      console.error('[resend-verification]', err);
      res.status(500).json({ error: 'Server error' });
    }
  });
```

Note: `sendVerification` calls `issueToken`, which throws `COOLDOWN` — in `/resend-verification` that propagates to the catch above. In `/register` it cannot fire (first token for a brand-new user).

- [ ] **Step 4: Run tests**

```bash
npm test -w services/auth-service
```
Expected: PASS (all files).

- [ ] **Step 5: Commit**

```bash
git add services/auth-service/src/server.ts services/auth-service/src/server.test.ts
git commit -m "feat(auth): email-verified registration — verify-email, resend-verification, login gate"
```

---

### Task 6: Server — forgot-password / reset-password

**Files:**
- Modify: `services/auth-service/src/server.ts`
- Test: `services/auth-service/src/server.test.ts` (append)

**Interfaces:**
- Consumes: `findByEmail`, `updatePassword` (Task 2); `issueToken`, `consumeResetToken` (Task 3); `passwordResetEmail` (Task 4).
- Produces:
  - `POST /forgot-password` body `{email}` → always 200 `{message}` (generic) | 429 on cooldown
  - `POST /reset-password` body `{token, newPassword}` → 200 `{message}` | 400 `{error[, code: 'TOKEN_INVALID']}`

- [ ] **Step 1: Write the failing tests** — append to `server.test.ts`:

```ts
describe('password reset', () => {
  async function registerAndVerify() {
    await request(app).post('/register').send(REG);
    await request(app).get(`/verify-email?token=${emails.lastToken()}`);
    emails.sent = [];
  }

  it('forgot-password answers generically for unknown emails and sends nothing', async () => {
    const res = await request(app).post('/forgot-password').send({ email: 'ghost@example.com' });
    expect(res.status).toBe(200);
    expect(emails.sent).toHaveLength(0);
  });

  it('emails a reset link that changes the password exactly once', async () => {
    await registerAndVerify();

    const forgot = await request(app).post('/forgot-password').send({ email: 'alice@example.com' });
    expect(forgot.status).toBe(200);
    expect(emails.sent).toHaveLength(1);
    expect(emails.sent[0].html).toContain('/reset-password?token=');
    const token = emails.lastToken();

    const reset = await request(app).post('/reset-password').send({ token, newPassword: 'newpassword1' });
    expect(reset.status).toBe(200);

    expect((await request(app).post('/login').send({ username: 'alice', password: 'password123' })).status).toBe(401);
    expect((await request(app).post('/login').send({ username: 'alice', password: 'newpassword1' })).status).toBe(200);

    // token is single-use
    const again = await request(app).post('/reset-password').send({ token, newPassword: 'anotherpass' });
    expect(again.status).toBe(400);
    expect(again.body.code).toBe('TOKEN_INVALID');
  });

  it('rejects a too-short new password without consuming the token', async () => {
    await registerAndVerify();
    await request(app).post('/forgot-password').send({ email: 'alice@example.com' });
    const token = emails.lastToken();

    const short = await request(app).post('/reset-password').send({ token, newPassword: 'tiny' });
    expect(short.status).toBe(400);

    const ok = await request(app).post('/reset-password').send({ token, newPassword: 'longenough' });
    expect(ok.status).toBe(200);
  });

  it('forgot-password enforces the cooldown', async () => {
    await registerAndVerify();
    await request(app).post('/forgot-password').send({ email: 'alice@example.com' });
    const res = await request(app).post('/forgot-password').send({ email: 'alice@example.com' });
    expect(res.status).toBe(429);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test -w services/auth-service
```
Expected: FAIL — 404 on `/forgot-password`.

- [ ] **Step 3: Implement** — extend the imports:

```ts
import { findByUsername, findByEmail, createUser, verifyPassword, markEmailVerified, updatePassword } from './userStore';
import { issueToken, consumeVerificationToken, consumeResetToken } from './tokenStore';
import { createDefaultEmailSender, verificationEmail, passwordResetEmail } from './email';
```

Add the endpoints inside `createApp`:

```ts
  app.post('/forgot-password', async (req, res) => {
    const { email } = req.body ?? {};
    const generic = { message: 'If an account with that email exists, a password-reset link has been sent.' };
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email is required' });
    }
    try {
      const user = await findByEmail(email.trim());
      if (!user?.email) return res.json(generic); // same answer — no enumeration
      const raw = await issueToken('reset', user.id);
      const { subject, html } = passwordResetEmail(`${FRONTEND_URL}/reset-password?token=${raw}`);
      try {
        await emailSender.send(user.email, subject, html);
      } catch (err) {
        console.error('[email] failed to send reset email', err);
      }
      res.json(generic);
    } catch (err) {
      if (err instanceof Error && err.message === 'COOLDOWN') {
        return res.status(429).json({ error: 'Please wait a minute before requesting another email.' });
      }
      console.error('[forgot-password]', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/reset-password', async (req, res) => {
    const { token, newPassword } = req.body ?? {};
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Missing token' });
    }
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    try {
      const userId = await consumeResetToken(token);
      if (!userId) {
        return res.status(400).json({ error: 'This link is invalid or has expired.', code: 'TOKEN_INVALID' });
      }
      // Deliberately does NOT revoke existing sessions — stateless HMAC
      // tokens aren't revocable without rotating SESSION_SECRET (spec scope).
      await updatePassword(userId, newPassword);
      res.json({ message: 'Password updated — you can now sign in.' });
    } catch (err) {
      console.error('[reset-password]', err);
      res.status(500).json({ error: 'Server error' });
    }
  });
```

- [ ] **Step 4: Run tests**

```bash
npm test -w services/auth-service
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/auth-service/src/server.ts services/auth-service/src/server.test.ts
git commit -m "feat(auth): forgot-password / reset-password with single-use emailed tokens"
```

---

### Task 7: Server — email-status / set-email (settings support for grandfathered accounts)

**Files:**
- Modify: `services/auth-service/src/server.ts`
- Test: `services/auth-service/src/server.test.ts` (append)

**Interfaces:**
- Consumes: `findById`, `setEmail` (Task 2); `sendVerification` helper (Task 5).
- Produces (both require `Authorization: Bearer <session token>`):
  - `GET /email-status` → 200 `{email: string | null, verified: boolean}` | 401
  - `POST /set-email` body `{email}` → 200 `{message}` (sends verification) | 400 | 401 | 409 (already verified / email taken) | 429

- [ ] **Step 1: Write the failing tests** — append to `server.test.ts`:

```ts
describe('email-status / set-email (settings)', () => {
  async function grandfatheredToken(name = 'settler') {
    await createUser(name, 'password123', 'civil-engineering');
    const login = await request(app).post('/login').send({ username: name, password: 'password123' });
    return login.body.token as string;
  }

  it('requires authentication', async () => {
    expect((await request(app).get('/email-status')).status).toBe(401);
    expect((await request(app).post('/set-email').send({ email: 'a@b.co' })).status).toBe(401);
  });

  it('reports none → unverified → verified as a grandfathered account adds an email', async () => {
    const token = await grandfatheredToken();
    const auth = { Authorization: `Bearer ${token}` };

    let status = await request(app).get('/email-status').set(auth);
    expect(status.body).toEqual({ email: null, verified: false });

    const set = await request(app).post('/set-email').set(auth).send({ email: 'settler@example.com' });
    expect(set.status).toBe(200);
    expect(emails.sent.at(-1)?.to).toBe('settler@example.com');

    status = await request(app).get('/email-status').set(auth);
    expect(status.body).toEqual({ email: 'settler@example.com', verified: false });

    await request(app).get(`/verify-email?token=${emails.lastToken()}`);
    status = await request(app).get('/email-status').set(auth);
    expect(status.body).toEqual({ email: 'settler@example.com', verified: true });
  });

  it('refuses to overwrite a verified email and rejects taken emails', async () => {
    const token = await grandfatheredToken('taken1');
    const auth = { Authorization: `Bearer ${token}` };
    await request(app).post('/set-email').set(auth).send({ email: 'taken1@example.com' });
    await request(app).get(`/verify-email?token=${emails.lastToken()}`);

    const overwrite = await request(app).post('/set-email').set(auth).send({ email: 'new@example.com' });
    expect(overwrite.status).toBe(409);

    const token2 = await grandfatheredToken('taken2');
    const dup = await request(app)
      .post('/set-email')
      .set({ Authorization: `Bearer ${token2}` })
      .send({ email: 'TAKEN1@example.com' });
    expect(dup.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test -w services/auth-service
```
Expected: FAIL — 404 on `/email-status`.

- [ ] **Step 3: Implement**

Extend the userStore import with `findById` and `setEmail`. Add a session helper inside `createApp` (and refactor `/me` to use it — same logic, one place):

```ts
  function sessionFrom(req: express.Request) {
    // Express's req.headers.authorization is a plain string, not a Fetch
    // Request — getSessionFromRequest (Fetch-shaped) doesn't apply here.
    const authHeader = req.headers.authorization ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    return token ? verifySession(token) : null;
  }
```

`/me` becomes:

```ts
  app.get('/me', (req, res) => {
    const session = sessionFrom(req);
    if (!session) return res.status(401).json({ error: 'Not authenticated' });
    res.json({ ...session, token: signSession(session), fileToken: signFileToken(session.userId) });
  });
```

New endpoints:

```ts
  app.get('/email-status', async (req, res) => {
    const session = sessionFrom(req);
    if (!session) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const user = await findById(session.userId);
      if (!user) return res.status(401).json({ error: 'Not authenticated' });
      res.json({ email: user.email, verified: user.emailVerifiedAt !== null });
    } catch (err) {
      console.error('[email-status]', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/set-email', async (req, res) => {
    const session = sessionFrom(req);
    if (!session) return res.status(401).json({ error: 'Not authenticated' });
    const { email } = req.body ?? {};
    if (!email || typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      return res.status(400).json({ error: 'A valid email address is required' });
    }
    try {
      const user = await findById(session.userId);
      if (!user) return res.status(401).json({ error: 'Not authenticated' });
      if (user.email && user.emailVerifiedAt) {
        return res.status(409).json({ error: 'This account already has a verified email' });
      }
      await setEmail(user.id, email.trim());
      await sendVerification(user.id, email.trim());
      res.json({ message: 'Verification email sent — check your inbox.' });
    } catch (err) {
      if (err instanceof Error && err.message === 'EMAIL_TAKEN') {
        return res.status(409).json({ error: 'An account with that email already exists' });
      }
      if (err instanceof Error && err.message === 'COOLDOWN') {
        return res.status(429).json({ error: 'Please wait a minute before requesting another email.' });
      }
      console.error('[set-email]', err);
      res.status(500).json({ error: 'Server error' });
    }
  });
```

- [ ] **Step 4: Run tests + typecheck**

```bash
npm test -w services/auth-service && npx tsc --noEmit -p services/auth-service
```
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add services/auth-service/src/server.ts services/auth-service/src/server.test.ts
git commit -m "feat(auth): email-status and set-email endpoints for grandfathered accounts"
```

---

### Task 8: Gateway proxy routes, public paths, env plumbing

**Files:**
- Create: `apps/frontend/app/api/auth/verify-email/route.ts`
- Create: `apps/frontend/app/api/auth/resend-verification/route.ts`
- Create: `apps/frontend/app/api/auth/forgot-password/route.ts`
- Create: `apps/frontend/app/api/auth/reset-password/route.ts`
- Create: `apps/frontend/app/api/auth/email-status/route.ts`
- Create: `apps/frontend/app/api/auth/set-email/route.ts`
- Modify: `apps/frontend/components/AuthProvider.tsx` (PUBLIC_PATHS)
- Modify: `docker-compose.yml` (auth-service env)
- Modify: `.env.example`

**Interfaces:**
- Consumes: `proxyRequest` from `apps/frontend/lib/serviceProxy.ts` (existing).
- Produces: `/api/auth/<name>` gateway routes matching Task 5–7 endpoints; `/verify-email`, `/forgot-password`, `/reset-password` reachable while logged out.

- [ ] **Step 1: Create the six route files** (pattern copied from `apps/frontend/app/api/auth/register/route.ts`).

`apps/frontend/app/api/auth/verify-email/route.ts` — the only one that must forward a query string:
```ts
import { proxyRequest } from '@/lib/serviceProxy';

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? 'http://127.0.0.1:4001';

export async function GET(req: Request) {
  const { search } = new URL(req.url);
  return proxyRequest(req, `${AUTH_SERVICE_URL}/verify-email${search}`);
}
```

`apps/frontend/app/api/auth/resend-verification/route.ts`:
```ts
import { proxyRequest } from '@/lib/serviceProxy';

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? 'http://127.0.0.1:4001';

export async function POST(req: Request) {
  return proxyRequest(req, `${AUTH_SERVICE_URL}/resend-verification`);
}
```

`apps/frontend/app/api/auth/forgot-password/route.ts`:
```ts
import { proxyRequest } from '@/lib/serviceProxy';

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? 'http://127.0.0.1:4001';

export async function POST(req: Request) {
  return proxyRequest(req, `${AUTH_SERVICE_URL}/forgot-password`);
}
```

`apps/frontend/app/api/auth/reset-password/route.ts`:
```ts
import { proxyRequest } from '@/lib/serviceProxy';

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? 'http://127.0.0.1:4001';

export async function POST(req: Request) {
  return proxyRequest(req, `${AUTH_SERVICE_URL}/reset-password`);
}
```

`apps/frontend/app/api/auth/set-email/route.ts`:
```ts
import { proxyRequest } from '@/lib/serviceProxy';

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? 'http://127.0.0.1:4001';

export async function POST(req: Request) {
  return proxyRequest(req, `${AUTH_SERVICE_URL}/set-email`);
}
```

`email-status/route.ts`:
```ts
import { proxyRequest } from '@/lib/serviceProxy';

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? 'http://127.0.0.1:4001';

export async function GET(req: Request) {
  return proxyRequest(req, `${AUTH_SERVICE_URL}/email-status`);
}
```

- [ ] **Step 2: Open the new pages to logged-out visitors** — in `apps/frontend/components/AuthProvider.tsx`, replace the `PUBLIC_PATHS` constant and the authenticated-redirect effect's check:

```ts
const PUBLIC_PATHS = ['/login', '/register', '/verify-email', '/forgot-password', '/reset-password'];
// Only bounce signed-in users off the pure sign-in/sign-up pages —
// /verify-email must stay reachable while logged in (a grandfathered account
// adding an email from /settings clicks its link in the same browser).
const AUTH_REDIRECT_PATHS = ['/login', '/register'];
```

and in the second `useEffect`, change `PUBLIC_PATHS.includes(pathname)` to `AUTH_REDIRECT_PATHS.includes(pathname)`. (The first effect — the logged-out guard — keeps using `PUBLIC_PATHS`.)

- [ ] **Step 3: Env plumbing** — in `docker-compose.yml`, add to the `auth-service` service's `environment` list:

```yaml
      - FRONTEND_URL=${FRONTEND_URL:-http://127.0.0.1:3200}
      - RESEND_API_KEY=${RESEND_API_KEY:-}
      - FROM_EMAIL=${FROM_EMAIL:-}
```

Append to `.env.example`:

```bash
# Email sending (auth-service). Leave RESEND_API_KEY empty until the Resend
# account + sending domain are set up — auth-service then logs the
# verification/reset links to its stdout instead of sending real email
# (view them with: docker logs revision_auth_service).
RESEND_API_KEY=
FROM_EMAIL=
# Public base URL used inside emailed links.
FRONTEND_URL=http://127.0.0.1:3200
```

- [ ] **Step 4: Typecheck the frontend**

```bash
npx tsc --noEmit -p apps/frontend
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/app/api/auth apps/frontend/components/AuthProvider.tsx docker-compose.yml .env.example
git commit -m "feat(gateway): proxy routes for email verification/reset; public auth paths; email env plumbing"
```

---

### Task 9: Frontend — auth client helpers + register page email step

**Files:**
- Modify: `apps/frontend/lib/auth/client.ts`
- Modify: `apps/frontend/app/(auth)/register/page.tsx`
- Test: `apps/frontend/app/(auth)/register/page.test.tsx` (new)

**Interfaces:**
- Consumes: gateway routes from Task 8.
- Produces (from `lib/auth/client.ts`, used by Tasks 10–12):
  - `register(username, password, domain, email): Promise<{ message: string } | { error: string }>` (**breaking**: no longer returns a session)
  - `login(...)` failure shape becomes `{ error: string; code?: string }`
  - `verifyEmail(token: string): Promise<{ message?: string; error?: string }>`
  - `resendVerification(identifier: string)`, `forgotPassword(email: string)`, `resetPassword(token: string, newPassword: string)` — all `Promise<{ message?: string; error?: string }>`
  - `getEmailStatus(): Promise<{ email: string | null; verified: boolean } | null>` (authenticated)
  - `updateEmail(email: string): Promise<{ message?: string; error?: string }>` (authenticated; named to avoid clashing with React state setters)

Note: domain seeding is unaffected by registration no longer returning a session — seeding happens client-side on first hydrate from `session.domain` (see `lib/repository/seed.ts`), which now simply runs at first login instead of at registration.

- [ ] **Step 1: Extend `lib/auth/client.ts`**

Replace the existing `register` function and add the new helpers at the end of the file:

```ts
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
```

Also update `login`'s failure branch to carry the code:

```ts
    if (!res.ok) {
      const errBody = body as { error?: string; code?: string };
      return { error: errBody.error ?? 'Login failed', code: errBody.code };
    }
```

and its return type to `Promise<{ session: Session } | { error: string; code?: string }>`.

- [ ] **Step 2: Update the register page** — `apps/frontend/app/(auth)/register/page.tsx`:

1. Extend the step union and state:
```ts
  const [step, setStep] = useState<'credentials' | 'domain' | 'done'>('credentials');
  const [email, setEmail] = useState('');
  const [resendNotice, setResendNotice] = useState('');
```
2. In `handleCredentialsSubmit`, after the username checks add:
```ts
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address');
      return;
    }
```
3. Replace `handleRegister` and add `handleResend`:
```ts
  async function handleRegister() {
    if (!selectedDomain) return;
    setError('');
    setLoading(true);
    const result = await register(username.trim(), password, selectedDomain, email.trim());
    setLoading(false);
    if ('error' in result) {
      setError(result.error);
      setStep('credentials');
    } else {
      setStep('done');
    }
  }

  async function handleResend() {
    setResendNotice('');
    const r = await resendVerification(username.trim());
    setResendNotice(r.error ?? r.message ?? '');
  }
```
   (import `resendVerification` alongside `register`; `useRouter`/`useAuth` become unused — remove those imports and the `router`/`setSession` lines.)
4. Add the email field to the credentials form, between the username and password fields:
```tsx
              <div className="auth-field">
                <label htmlFor="reg-email" className="auth-label">Email</label>
                <input
                  id="reg-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="auth-input"
                  placeholder="you@example.com"
                  required
                />
              </div>
```
   and add `|| !email` to the Continue button's `disabled` condition.
5. Turn the JSX into a three-way branch — `{step === 'credentials' ? (…existing…) : step === 'domain' ? (…existing…) : (…new done panel…)}`:
```tsx
          <>
            <h1 className="auth-title">Check your email</h1>
            <p className="auth-subtitle">
              We sent a verification link to <strong>{email.trim()}</strong>.
              Click it, then sign in.
            </p>
            {resendNotice && <p className="auth-footer">{resendNotice}</p>}
            <button type="button" id="reg-resend" className="auth-btn-ghost" onClick={handleResend}>
              Resend email
            </button>
            <p className="auth-footer">
              <Link href="/login" className="auth-link">Go to sign in</Link>
            </p>
          </>
```

- [ ] **Step 3: Write the page test** — create `apps/frontend/app/(auth)/register/page.test.tsx`:

```tsx
import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({
  register: vi.fn(),
  resendVerification: vi.fn(),
}));
vi.mock('@/lib/auth/client', () => ({
  register: mocks.register,
  resendVerification: mocks.resendVerification,
}));

import RegisterPage from './page';

beforeEach(() => {
  vi.clearAllMocks();
});

async function fillCredentials(email: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Username'), 'newuser');
  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), 'password123');
  await user.type(screen.getByLabelText('Confirm Password'), 'password123');
  await user.click(screen.getByRole('button', { name: /continue/i }));
  return user;
}

it('rejects an invalid email before advancing to domain selection', async () => {
  render(<RegisterPage />);
  await fillCredentials('not-an-email');
  expect(screen.getByText('Enter a valid email address')).toBeInTheDocument();
});

it('shows the check-your-email panel after successful registration', async () => {
  mocks.register.mockResolvedValue({ message: 'Account created — check your email for a verification link.' });
  render(<RegisterPage />);
  const user = await fillCredentials('newuser@example.com');
  await user.click(screen.getByText('Civil Engineering'));
  await user.click(screen.getByRole('button', { name: /create account/i }));
  await waitFor(() => expect(screen.getByText('Check your email')).toBeInTheDocument());
  expect(mocks.register).toHaveBeenCalledWith('newuser', 'password123', 'civil-engineering', 'newuser@example.com');
});
```

If `@testing-library/user-event` isn't installed (check `apps/frontend/package.json`), install it first: `npm install -D -w apps/frontend @testing-library/user-event`.

- [ ] **Step 4: Run frontend tests + typecheck**

```bash
npm test -w apps/frontend
npx tsc --noEmit -p apps/frontend
```
Expected: PASS. `tsc` will surface any other `register`/`login` call sites broken by the signature change — fix them the same way as the register page.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/lib/auth/client.ts "apps/frontend/app/(auth)/register/page.tsx" "apps/frontend/app/(auth)/register/page.test.tsx" apps/frontend/package.json package-lock.json
git commit -m "feat(frontend): email at registration with check-your-email step; auth client helpers"
```

---

### Task 10: Frontend — verify-email page

**Files:**
- Create: `apps/frontend/app/(auth)/verify-email/page.tsx`
- Test: `apps/frontend/app/(auth)/verify-email/page.test.tsx`

**Interfaces:**
- Consumes: `verifyEmail`, `resendVerification` from `lib/auth/client.ts` (Task 9).

- [ ] **Step 1: Write the failing test** — create `apps/frontend/app/(auth)/verify-email/page.test.tsx`:

```tsx
import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  verifyEmail: vi.fn(),
  resendVerification: vi.fn(),
  searchParams: new URLSearchParams('token=abc123'),
}));
vi.mock('@/lib/auth/client', () => ({
  verifyEmail: mocks.verifyEmail,
  resendVerification: mocks.resendVerification,
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => mocks.searchParams,
}));

import VerifyEmailPage from './page';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.searchParams = new URLSearchParams('token=abc123');
});

it('verifies the token from the URL and shows success with a sign-in link', async () => {
  mocks.verifyEmail.mockResolvedValue({ message: 'Email verified — you can now sign in.' });
  render(<VerifyEmailPage />);
  await waitFor(() => expect(screen.getByText('Email verified — you can now sign in.')).toBeInTheDocument());
  expect(mocks.verifyEmail).toHaveBeenCalledWith('abc123');
  expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login');
});

it('shows the error state with a resend form for an expired token', async () => {
  mocks.verifyEmail.mockResolvedValue({ error: 'This link is invalid or has expired.' });
  render(<VerifyEmailPage />);
  await waitFor(() => expect(screen.getByText('This link is invalid or has expired.')).toBeInTheDocument());
  expect(screen.getByLabelText('Username or email')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test -w apps/frontend -- verify-email
```
Expected: FAIL — module `./page` not found.

- [ ] **Step 3: Implement** — create `apps/frontend/app/(auth)/verify-email/page.tsx` (the `useSearchParams` hook must sit under a `Suspense` boundary in the App Router):

```tsx
'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { verifyEmail, resendVerification } from '@/lib/auth/client';

function VerifyEmailInner() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [message, setMessage] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [resendNotice, setResendNotice] = useState('');

  useEffect(() => {
    if (!token) {
      setState('error');
      setMessage('This verification link is missing its token.');
      return;
    }
    verifyEmail(token).then((r) => {
      if (r.error) {
        setState('error');
        setMessage(r.error);
      } else {
        setState('success');
        setMessage(r.message ?? 'Email verified — you can now sign in.');
      }
    });
  }, [token]);

  async function handleResend(e: React.FormEvent) {
    e.preventDefault();
    setResendNotice('');
    const r = await resendVerification(identifier.trim());
    setResendNotice(r.error ?? r.message ?? '');
  }

  return (
    <div className="auth-card-wrap">
      <div className="auth-glow auth-glow--a" />
      <div className="auth-glow auth-glow--b" />
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-brand-icon">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect width="28" height="28" rx="8" fill="currentColor" opacity=".15" />
              <path d="M7 21V14l7-7 7 7v7H17v-5h-6v5H7Z" fill="currentColor" />
            </svg>
          </div>
          <span className="auth-brand-name">RevisionOS</span>
        </div>

        {state === 'verifying' && (
          <>
            <h1 className="auth-title">Verifying…</h1>
            <p className="auth-subtitle">Checking your verification link.</p>
          </>
        )}

        {state === 'success' && (
          <>
            <h1 className="auth-title">You&apos;re verified</h1>
            <p className="auth-subtitle">{message}</p>
            <p className="auth-footer">
              <Link href="/login" className="auth-link">Sign in</Link>
            </p>
          </>
        )}

        {state === 'error' && (
          <>
            <h1 className="auth-title">Link problem</h1>
            <p className="auth-error">{message}</p>
            <form onSubmit={handleResend} className="auth-form" noValidate>
              <div className="auth-field">
                <label htmlFor="verify-identifier" className="auth-label">Username or email</label>
                <input
                  id="verify-identifier"
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="auth-input"
                  placeholder="your_username"
                  required
                />
              </div>
              {resendNotice && <p className="auth-footer">{resendNotice}</p>}
              <button type="submit" className="auth-btn" disabled={!identifier}>
                Send a new link
              </button>
            </form>
            <p className="auth-footer">
              <Link href="/login" className="auth-link">Back to sign in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailInner />
    </Suspense>
  );
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -w apps/frontend -- verify-email
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "apps/frontend/app/(auth)/verify-email"
git commit -m "feat(frontend): verify-email page with success/expired states and resend"
```

---

### Task 11: Frontend — forgot-password, reset-password, login page links

**Files:**
- Create: `apps/frontend/app/(auth)/forgot-password/page.tsx`
- Create: `apps/frontend/app/(auth)/reset-password/page.tsx`
- Modify: `apps/frontend/app/(auth)/login/page.tsx`
- Test: `apps/frontend/app/(auth)/forgot-password/page.test.tsx`, `apps/frontend/app/(auth)/reset-password/page.test.tsx`

**Interfaces:**
- Consumes: `forgotPassword`, `resetPassword`, `resendVerification`, updated `login` (Task 9).

- [ ] **Step 1: Write the failing tests**

`apps/frontend/app/(auth)/forgot-password/page.test.tsx`:
```tsx
import { it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({ forgotPassword: vi.fn() }));
vi.mock('@/lib/auth/client', () => ({ forgotPassword: mocks.forgotPassword }));

import ForgotPasswordPage from './page';

it('submits the email and shows the generic confirmation', async () => {
  mocks.forgotPassword.mockResolvedValue({ message: 'If an account with that email exists, a password-reset link has been sent.' });
  render(<ForgotPasswordPage />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email'), 'me@example.com');
  await user.click(screen.getByRole('button', { name: /send reset link/i }));
  await waitFor(() =>
    expect(screen.getByText('If an account with that email exists, a password-reset link has been sent.')).toBeInTheDocument(),
  );
  expect(mocks.forgotPassword).toHaveBeenCalledWith('me@example.com');
});
```

`apps/frontend/app/(auth)/reset-password/page.test.tsx`:
```tsx
import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({
  resetPassword: vi.fn(),
  searchParams: new URLSearchParams('token=tok123'),
}));
vi.mock('@/lib/auth/client', () => ({ resetPassword: mocks.resetPassword }));
vi.mock('next/navigation', () => ({ useSearchParams: () => mocks.searchParams }));

import ResetPasswordPage from './page';

beforeEach(() => vi.clearAllMocks());

it('submits matching passwords and shows success with a sign-in link', async () => {
  mocks.resetPassword.mockResolvedValue({ message: 'Password updated — you can now sign in.' });
  render(<ResetPasswordPage />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('New password'), 'newpassword1');
  await user.type(screen.getByLabelText('Confirm new password'), 'newpassword1');
  await user.click(screen.getByRole('button', { name: /reset password/i }));
  await waitFor(() => expect(screen.getByText('Password updated — you can now sign in.')).toBeInTheDocument());
  expect(mocks.resetPassword).toHaveBeenCalledWith('tok123', 'newpassword1');
  expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login');
});

it('blocks mismatched passwords client-side', async () => {
  render(<ResetPasswordPage />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('New password'), 'newpassword1');
  await user.type(screen.getByLabelText('Confirm new password'), 'different1');
  await user.click(screen.getByRole('button', { name: /reset password/i }));
  expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
  expect(mocks.resetPassword).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test -w apps/frontend -- password
```
Expected: FAIL — pages don't exist.

- [ ] **Step 3: Implement the two pages**

`apps/frontend/app/(auth)/forgot-password/page.tsx`:
```tsx
'use client';
import { useState } from 'react';
import Link from 'next/link';
import { forgotPassword } from '@/lib/auth/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const r = await forgotPassword(email.trim());
    setLoading(false);
    if (r.error) setError(r.error);
    else setMessage(r.message ?? '');
  }

  return (
    <div className="auth-card-wrap">
      <div className="auth-glow auth-glow--a" />
      <div className="auth-glow auth-glow--b" />
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-brand-icon">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect width="28" height="28" rx="8" fill="currentColor" opacity=".15" />
              <path d="M7 21V14l7-7 7 7v7H17v-5h-6v5H7Z" fill="currentColor" />
            </svg>
          </div>
          <span className="auth-brand-name">RevisionOS</span>
        </div>

        <h1 className="auth-title">Forgot your password?</h1>
        <p className="auth-subtitle">Enter your account email and we&apos;ll send a reset link.</p>

        {message ? (
          <p className="auth-subtitle">{message}</p>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form" noValidate>
            <div className="auth-field">
              <label htmlFor="forgot-email" className="auth-label">Email</label>
              <input
                id="forgot-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="auth-input"
                placeholder="you@example.com"
                required
                disabled={loading}
              />
            </div>
            {error && <p className="auth-error">{error}</p>}
            <button type="submit" className="auth-btn" disabled={loading || !email}>
              {loading ? <span className="auth-spinner" /> : 'Send reset link'}
            </button>
          </form>
        )}

        <p className="auth-footer">
          <Link href="/login" className="auth-link">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
```

`apps/frontend/app/(auth)/reset-password/page.tsx`:
```tsx
'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { resetPassword } from '@/lib/auth/client';

function ResetPasswordInner() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPwd) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    const r = await resetPassword(token, password);
    setLoading(false);
    if (r.error) setError(r.error);
    else setMessage(r.message ?? '');
  }

  return (
    <div className="auth-card-wrap">
      <div className="auth-glow auth-glow--a" />
      <div className="auth-glow auth-glow--b" />
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-brand-icon">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect width="28" height="28" rx="8" fill="currentColor" opacity=".15" />
              <path d="M7 21V14l7-7 7 7v7H17v-5h-6v5H7Z" fill="currentColor" />
            </svg>
          </div>
          <span className="auth-brand-name">RevisionOS</span>
        </div>

        <h1 className="auth-title">Choose a new password</h1>

        {message ? (
          <>
            <p className="auth-subtitle">{message}</p>
            <p className="auth-footer">
              <Link href="/login" className="auth-link">Sign in</Link>
            </p>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form" noValidate>
            <div className="auth-field">
              <label htmlFor="reset-password" className="auth-label">New password</label>
              <input
                id="reset-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="auth-input"
                placeholder="Min 6 characters"
                required
                disabled={loading}
              />
            </div>
            <div className="auth-field">
              <label htmlFor="reset-confirm" className="auth-label">Confirm new password</label>
              <input
                id="reset-confirm"
                type="password"
                autoComplete="new-password"
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                className="auth-input"
                placeholder="Re-enter password"
                required
                disabled={loading}
              />
            </div>
            {error && <p className="auth-error">{error}</p>}
            <button type="submit" className="auth-btn" disabled={loading || !password || !confirmPwd}>
              {loading ? <span className="auth-spinner" /> : 'Reset password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  );
}
```

- [ ] **Step 4: Update the login page** — in `apps/frontend/app/(auth)/login/page.tsx`:

1. Import `resendVerification` alongside `login`; add state:
```ts
  const [unverified, setUnverified] = useState(false);
  const [notice, setNotice] = useState('');
```
2. In `handleSubmit`'s error branch:
```ts
    if ('error' in result) {
      setError(result.error);
      setUnverified(result.code === 'EMAIL_UNVERIFIED');
    } else {
```
3. After the `{error && …}` line inside the form, add:
```tsx
          {unverified && (
            <button
              type="button"
              className="auth-btn-ghost"
              onClick={async () => {
                const r = await resendVerification(username.trim());
                setNotice(r.error ?? r.message ?? '');
              }}
            >
              Resend verification email
            </button>
          )}
          {notice && <p className="auth-footer">{notice}</p>}
```
4. Below the existing "Create one" footer paragraph, add:
```tsx
        <p className="auth-footer">
          <Link href="/forgot-password" className="auth-link">Forgot password?</Link>
        </p>
```

- [ ] **Step 5: Run tests + typecheck, then commit**

```bash
npm test -w apps/frontend && npx tsc --noEmit -p apps/frontend
```
Expected: PASS.

```bash
git add "apps/frontend/app/(auth)/forgot-password" "apps/frontend/app/(auth)/reset-password" "apps/frontend/app/(auth)/login/page.tsx"
git commit -m "feat(frontend): forgot/reset password pages; login links for reset and resend-verification"
```

---

### Task 12: Frontend — minimal settings page (grandfathered accounts add an email)

**Files:**
- Create: `apps/frontend/app/settings/page.tsx`
- Test: `apps/frontend/app/settings/page.test.tsx`

**Interfaces:**
- Consumes: `getEmailStatus`, `updateEmail` (Task 9); `useAuth` from `@/components/AuthProvider`.
- Scope guard (from spec): this page shows email status + an add/verify form — nothing else goes in it this phase.

- [ ] **Step 1: Write the failing test** — create `apps/frontend/app/settings/page.test.tsx`:

```tsx
import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({
  getEmailStatus: vi.fn(),
  updateEmail: vi.fn(),
  useAuth: vi.fn(),
}));
vi.mock('@/lib/auth/client', () => ({
  getEmailStatus: mocks.getEmailStatus,
  updateEmail: mocks.updateEmail,
}));
vi.mock('@/components/AuthProvider', () => ({ useAuth: mocks.useAuth }));

import SettingsPage from './page';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useAuth.mockReturnValue({ session: { userId: 'u1', username: 'oldtimer', domain: 'civil-engineering' }, loading: false });
});

it('lets a grandfathered account submit an email for verification', async () => {
  mocks.getEmailStatus.mockResolvedValue({ email: null, verified: false });
  mocks.updateEmail.mockResolvedValue({ message: 'Verification email sent — check your inbox.' });
  render(<SettingsPage />);
  await waitFor(() => expect(screen.getByText('No email on this account')).toBeInTheDocument());

  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email'), 'late@example.com');
  await user.click(screen.getByRole('button', { name: /send verification/i }));
  await waitFor(() => expect(screen.getByText('Verification email sent — check your inbox.')).toBeInTheDocument());
  expect(mocks.updateEmail).toHaveBeenCalledWith('late@example.com');
});

it('shows verified status without the form', async () => {
  mocks.getEmailStatus.mockResolvedValue({ email: 'done@example.com', verified: true });
  render(<SettingsPage />);
  // The status line interpolates several values into one <p>, so match the
  // paragraph's full text with a regex rather than an exact string.
  await waitFor(() => expect(screen.getByText(/done@example\.com — Verified/)).toBeInTheDocument());
  expect(screen.queryByRole('button', { name: /send verification/i })).toBeNull();
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test -w apps/frontend -- settings
```
Expected: FAIL — page doesn't exist.

- [ ] **Step 3: Implement** — create `apps/frontend/app/settings/page.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { getEmailStatus, updateEmail } from '@/lib/auth/client';

type EmailStatus = { email: string | null; verified: boolean };

export default function SettingsPage() {
  const { session, loading } = useAuth();
  const [status, setStatus] = useState<EmailStatus | null>(null);
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!session) return;
    getEmailStatus().then(setStatus);
  }, [session]);

  if (loading || !session) return null; // AuthProvider redirects logged-out visitors

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address');
      return;
    }
    setBusy(true);
    const r = await updateEmail(email.trim());
    setBusy(false);
    if (r.error) {
      setError(r.error);
    } else {
      setNotice(r.message ?? '');
      setStatus({ email: email.trim(), verified: false });
    }
  }

  return (
    <div className="auth-card-wrap">
      <div className="auth-card">
        <h1 className="auth-title">Account settings</h1>
        <p className="auth-subtitle">Signed in as {session.username}</p>

        <div className="auth-field">
          <span className="auth-label">Email</span>
          {status === null ? (
            <p className="auth-subtitle">Loading…</p>
          ) : status.email === null ? (
            <p className="auth-subtitle">No email on this account</p>
          ) : (
            <p className="auth-subtitle">
              {status.email} — {status.verified ? 'Verified' : 'Awaiting verification'}
            </p>
          )}
        </div>

        {status !== null && !status.verified && (
          <form onSubmit={handleSubmit} className="auth-form" noValidate>
            <div className="auth-field">
              <label htmlFor="settings-email" className="auth-label">Email</label>
              <input
                id="settings-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="auth-input"
                placeholder="you@example.com"
                required
                disabled={busy}
              />
            </div>
            {error && <p className="auth-error">{error}</p>}
            {notice && <p className="auth-footer">{notice}</p>}
            <button type="submit" className="auth-btn" disabled={busy || !email}>
              {busy ? <span className="auth-spinner" /> : 'Send verification email'}
            </button>
          </form>
        )}

        <p className="auth-footer">
          <Link href="/" className="auth-link">← Back to the app</Link>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -w apps/frontend -- settings
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/app/settings
git commit -m "feat(frontend): minimal settings page — add and verify an email on grandfathered accounts"
```

---

### Task 13: Smoke test update, full gates, docs

**Files:**
- Modify: `scripts/smoke-test.mjs`
- Modify: `README.md` (roadmap/architecture mention, one or two lines)

**Interfaces:**
- Consumes: everything above. The smoke test relies on the ConsoleEmailSender logging links to stdout when `RESEND_API_KEY` is unset (Task 4) — it extracts the verification token from `docker logs revision_auth_service`.

- [ ] **Step 1: Update the smoke test** — in `scripts/smoke-test.mjs`, replace the register block (registration no longer returns a token):

```js
import { execSync } from 'node:child_process';
```

```js
  const username = `smoke_${Date.now()}`;
  const email = `${username}@example.com`;

  const register = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'password123', domain: 'civil-engineering', email }),
  });
  if (register.status !== 201) throw new Error(`register failed: ${register.status}`);

  // With RESEND_API_KEY unset, auth-service logs the verification link
  // instead of emailing it — fish the token out of the container logs.
  // (Requires the compose stack; real-key environments can't run this script.)
  const logs = execSync('docker logs revision_auth_service --since 2m 2>&1', { encoding: 'utf8' });
  const tokens = [...logs.matchAll(/verify-email\?token=([a-f0-9]{64})/g)];
  const verifyToken = tokens.at(-1)?.[1];
  if (!verifyToken) throw new Error('no verification token found in auth-service logs — is RESEND_API_KEY set?');

  const verify = await fetch(`${BASE}/api/auth/verify-email?token=${verifyToken}`);
  if (verify.status !== 200) throw new Error(`verify-email failed: ${verify.status}`);

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'password123' }),
  });
  if (login.status !== 200) throw new Error(`login failed: ${login.status}`);
  const { token } = await login.json();
```

(The rest of the script — `/api/data` GET/PUT and the upload — is unchanged; it already uses `token`.)

- [ ] **Step 2: README** — in `README.md`, update the roadmap/architecture text: auth-service now also handles email verification and password reset (Resend behind an `EmailSender` seam; links logged to stdout when `RESEND_API_KEY` is unset). Keep it to the style of the surrounding lines.

- [ ] **Step 3: Run every gate**

```bash
npm test -w services/auth-service
npm test -w apps/frontend
npm test -w packages/shared
npx tsc --noEmit -p services/auth-service && npx tsc --noEmit -p apps/frontend && npx tsc --noEmit -p packages/shared
npm run lint -w apps/frontend
```
Expected: all PASS / no errors.

- [ ] **Step 4: End-to-end verification against the real stack**

```bash
docker compose up -d --build
sleep 15
npm run smoke-test
```
Expected: `smoke test passed`. (The rebuild also applies `0002_email.sql` to the real `revision_auth` database via the container's migrate-on-start CMD. `RESEND_API_KEY` must be empty in `.env` for the smoke test's log-scrape to work.)

Also verify the grandfathered path end-to-end: log in through the UI at `http://127.0.0.1:3200/login` with an existing account — it must succeed with no verification prompt.

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke-test.mjs README.md
git commit -m "test: smoke test covers email verification; document email flow"
```

---

## Post-plan notes (not tasks)

- **When the Resend account is ready:** set `RESEND_API_KEY` and `FROM_EMAIL` (an address on the verified sending domain) in `.env`, set `FRONTEND_URL` to the public URL, and `docker compose up -d auth-service`. No code changes. Until then, verification links for any real signup are readable via `docker logs revision_auth_service`.
- **Deliverability caveat (from spec):** an unverified/shared Resend domain may limit or degrade sending until the domain is verified.
- **Phase 2 (Google Sign-In)** is a separate future spec and intentionally absent here.
