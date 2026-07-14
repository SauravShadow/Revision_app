# Postgres Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the file-based `auth.json` user registry and per-user `appdata.json` snapshot with Postgres, so the app has a real relational base to build Institute/Faculty/Student roles on top of (Phases 2+, separate plans).

**Architecture:** Add a project-scoped Postgres instance via Docker Compose (not the host's shared native Postgres — see rationale below). Migrate the `users` table and a per-user `app_data` JSONB snapshot table via a minimal hand-rolled SQL migration runner (no ORM — two tables don't justify one). Keep the existing whole-document `AppData` JSON contract between client and server exactly as-is (`GET`/`PUT /api/data` unchanged); only the storage backend underneath `lib/auth/userStore.ts` and `lib/repository/fileStore.ts` changes. Uploaded file blobs stay on local disk for this phase — normalizing `subjects`/`chapters`/`topics` into their own tables and moving blobs to object storage are out of scope here; they're not required to unblock Institute/Faculty roles.

**Tech Stack:** PostgreSQL 16, `pg` (node-postgres), a small hand-written SQL migration runner, Docker Compose, Vitest for tests (against a real Postgres test database, not mocks).

## Global Constraints

- Do not touch `lib/repository/fileBlobStore.ts`'s on-disk blob layout — it keeps using `dataFilePath()` from `lib/repository/fileStore.ts` purely as a directory-path helper (see Task 4).
- Do not change the `AppData` JSON shape or the `GET`/`PUT /api/data` HTTP contract — `app/api/data/route.ts` must not need any changes.
- No ORM/query builder — this schema is two tables; `pg` with hand-written SQL is enough.
- All new DB-backed code must be tested against a real Postgres database (a `revision_app_test` database), not a mocked `pg` client — mocking the driver would not have caught the race condition this plan fixes.

---

## Why not the host's existing Postgres?

This machine already runs a native `postgresql@16-main` systemd service (port 5432), but it's a shared, system-wide instance that other projects on this box may depend on — colliding with its schema, roles, or resource usage risks breaking something unrelated. Instead, this plan adds a **project-scoped Postgres container** to `revision_app`'s own `docker-compose.yml`, with its own volume and a port (5433) that doesn't collide with the host's instance. This matches how `revision_app` already runs — self-contained, in its own Compose stack — and answers "can I use Postgres locally" with: yes, but as this project's own container, not the shared host service.

---

### Task 1: Local Postgres via Docker Compose

**Files:**
- Create: `db/init/001-databases.sql`
- Modify: `docker-compose.yml`
- Modify: `.env.example`

**Interfaces:**
- Produces: a reachable Postgres server at `127.0.0.1:5433` from the host, and at `db:5432` from other containers in the same Compose network, with two databases: `revision_app` (dev) and `revision_app_test` (test).

- [ ] **Step 1: Create the test-database init script**

```sql
-- db/init/001-databases.sql
-- Runs once, on first container init (official postgres image convention:
-- anything in /docker-entrypoint-initdb.d runs automatically). POSTGRES_DB
-- below creates `revision_app`; this creates the second database used by
-- the test suite so it never touches dev data.
CREATE DATABASE revision_app_test;
```

- [ ] **Step 2: Add the `db` service to docker-compose.yml**

Replace the file's contents with:

```yaml
services:
  db:
    image: postgres:16-alpine
    container_name: revision_app_db
    environment:
      - POSTGRES_USER=revision
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_DB=revision_app
    ports:
      - "127.0.0.1:5433:5432"
    volumes:
      - revision_app-db:/var/lib/postgresql/data
      - ./db/init:/docker-entrypoint-initdb.d:ro
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U revision -d revision_app"]
      interval: 5s
      timeout: 3s
      retries: 5

  app:
    image: revision_app:latest
    build: .
    container_name: revision_app
    ports:
      - "127.0.0.1:3200:3000"
    environment:
      - SESSION_SECRET=${SESSION_SECRET}
      - DATABASE_URL=postgres://revision:${POSTGRES_PASSWORD}@db:5432/revision_app
    volumes:
      - revision_app-data:/app/data
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

volumes:
  revision_app-data:
    external: true
  revision_app-db:
    external: true
```

- [ ] **Step 3: Document the new env vars**

Append to `.env.example`:

```
# Postgres (see docs/superpowers/plans/2026-07-13-postgres-foundation.md)
POSTGRES_PASSWORD=
# Used by the app and by `npm run db:migrate` outside Docker (host -> container via the published port).
DATABASE_URL=postgres://revision:changeme@127.0.0.1:5433/revision_app
# Used only by the test suite (npm test) — a separate database so tests never touch dev data.
TEST_DATABASE_URL=postgres://revision:changeme@127.0.0.1:5433/revision_app_test
```

Then copy it and fill in real values:

```bash
cp .env.example .env  # if you don't already have one — otherwise edit .env directly
```

Set `POSTGRES_PASSWORD` to a generated value (`openssl rand -hex 16`), and set the same password in the `DATABASE_URL`/`TEST_DATABASE_URL` lines.

- [ ] **Step 4: Create the external volume and start the db service**

```bash
docker volume create revision_app-db
docker compose up -d db
```

Expected: `docker compose ps` shows `revision_app_db` with state `Up (healthy)` within ~10s.

- [ ] **Step 5: Verify both databases exist**

```bash
docker compose exec db psql -U revision -d revision_app -c '\l' | grep revision_app
```

Expected output includes both `revision_app` and `revision_app_test` rows.

- [ ] **Step 6: Commit**

```bash
git add db/init/001-databases.sql docker-compose.yml .env.example
git commit -m "chore: add project-scoped Postgres via docker compose"
```

---

### Task 2: Migration runner + initial schema (`users`, `app_data`)

**Files:**
- Create: `db/migrations/0001_init.sql`
- Create: `scripts/migrate.mjs`
- Create: `lib/db/pool.ts`
- Create: `lib/db/schema.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `DATABASE_URL` / `TEST_DATABASE_URL` from Task 1.
- Produces: `getPool(): Pool` from `lib/db/pool.ts` (consumed by Tasks 3 and 4). Schema: `users(id uuid pk, username text, username_lower text generated, password_hash text, domain text, created_at timestamptz)` with a unique index on `username_lower`; `app_data(user_id uuid pk references users, data jsonb, updated_at timestamptz)`.

- [ ] **Step 1: Add dependencies**

```bash
npm install pg dotenv
npm install -D @types/pg
```

- [ ] **Step 2: Write the initial schema migration**

```sql
-- db/migrations/0001_init.sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL,
  username_lower text GENERATED ALWAYS AS (lower(username)) STORED,
  password_hash text NOT NULL,
  domain text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX users_username_lower_idx ON users (username_lower);

CREATE TABLE app_data (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

- [ ] **Step 3: Write the connection pool**

```ts
// lib/db/pool.ts
import { Pool } from 'pg';

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL env var must be set');
    pool = new Pool({ connectionString });
  }
  return pool;
}
```

- [ ] **Step 4: Write the migration runner**

```js
// scripts/migrate.mjs
import 'dotenv/config';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;

const useTestDb = process.argv.includes('--test');
const connectionString = useTestDb
  ? process.env.TEST_DATABASE_URL
  : process.env.DATABASE_URL;

if (!connectionString) {
  console.error(useTestDb ? 'TEST_DATABASE_URL is not set' : 'DATABASE_URL is not set');
  process.exit(1);
}

async function main() {
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    const dir = path.join(process.cwd(), 'db', 'migrations');
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

    for (const file of files) {
      const { rows } = await client.query(
        'SELECT 1 FROM schema_migrations WHERE filename = $1',
        [file],
      );
      if (rows.length > 0) {
        console.log(`skip (already applied): ${file}`);
        continue;
      }
      const sql = readFileSync(path.join(dir, file), 'utf8');
      console.log(`applying: ${file}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 5: Add npm scripts**

In `package.json`, add to `"scripts"`:

```json
"db:migrate": "node scripts/migrate.mjs",
"db:migrate:test": "node scripts/migrate.mjs --test"
```

- [ ] **Step 6: Run the migration against both databases**

```bash
npm run db:migrate
npm run db:migrate:test
```

Expected: both print `applying: 0001_init.sql` on first run.

- [ ] **Step 7: Write a schema-verification test**

```ts
// lib/db/schema.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { getPool } from './pool';

afterAll(async () => {
  await getPool().end();
});

describe('schema', () => {
  it('creates the users table with a unique lowercase-username index', async () => {
    const { rows } = await getPool().query(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'users' AND indexname = 'users_username_lower_idx'`,
    );
    expect(rows).toHaveLength(1);
  });

  it('creates the app_data table referencing users', async () => {
    const { rows } = await getPool().query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'app_data' ORDER BY ordinal_position`,
    );
    expect(rows.map((r) => r.column_name)).toEqual(['user_id', 'data', 'updated_at']);
  });
});
```

- [ ] **Step 8: Point the test suite at the test database and run it**

In `vitest.setup.ts`, add at the very top (before the existing `vi.stubGlobal` line):

```ts
import 'dotenv/config';

// Route all app code (which reads DATABASE_URL) at the test database when running under vitest,
// so tests never touch dev data.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
```

Run:

```bash
npx vitest run lib/db/schema.test.ts
```

Expected: `2 passed`.

- [ ] **Step 9: Commit**

```bash
git add db/migrations/0001_init.sql scripts/migrate.mjs lib/db/pool.ts lib/db/schema.test.ts vitest.setup.ts package.json package-lock.json
git commit -m "feat: add Postgres migration runner and initial users/app_data schema"
```

---

### Task 3: Migrate `lib/auth/userStore.ts` to Postgres (fixes the signup race condition)

**Files:**
- Modify: `lib/auth/userStore.ts`
- Create: `lib/auth/userStore.test.ts`

**Interfaces:**
- Consumes: `getPool()` from `lib/db/pool.ts` (Task 2).
- Produces: unchanged public API — `listUsers(): Promise<UserRecord[]>`, `findByUsername(username): Promise<UserRecord | null>`, `findById(id): Promise<UserRecord | null>`, `createUser(username, password, domain): Promise<UserRecord>`, `hashPassword`, `verifyPassword` — so `app/api/auth/*` routes need no changes.

- [ ] **Step 1: Write the failing regression test for the race condition**

This test targets the *current* file-based implementation and demonstrates the bug this task fixes: two concurrent signups with the same username can both succeed, because `readStore` → mutate → `writeStore` isn't atomic across the whole read-modify-write.

```ts
// lib/auth/userStore.test.ts
import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getPool } from '@/lib/db/pool';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ce-userstore-'));
  process.env.DATA_DIR = dir;
  await getPool().query('TRUNCATE users CASCADE');
});

afterEach(async () => {
  delete process.env.DATA_DIR;
  await fs.rm(dir, { recursive: true, force: true });
});

afterAll(async () => {
  await getPool().end();
});

describe('userStore', () => {
  it('returns null for an unknown username', async () => {
    const { findByUsername } = await import('./userStore');
    expect(await findByUsername('nobody')).toBeNull();
  });

  it('creates a user and finds it by id and username', async () => {
    const { createUser, findById, findByUsername } = await import('./userStore');
    const created = await createUser('alice', 'password123', 'civil-engineering');
    expect(await findById(created.id)).toEqual(created);
    expect(await findByUsername('ALICE')).toEqual(created); // case-insensitive lookup
  });

  it('rejects the loser of a concurrent duplicate-username signup race', async () => {
    const { createUser } = await import('./userStore');
    const results = await Promise.allSettled([
      createUser('racer', 'password123', 'civil-engineering'),
      createUser('racer', 'password456', 'civil-engineering'),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run it against the current (file-based) implementation**

```bash
npx vitest run lib/auth/userStore.test.ts
```

Expected: the first two tests pass, but "rejects the loser of a concurrent duplicate-username signup race" is flaky/fails — both `createUser` calls can resolve successfully because the file-based read-modify-write has no locking. (If it happens to pass once, re-run a few times — the race is timing-dependent, which is exactly the bug.)

- [ ] **Step 3: Rewrite `userStore.ts` against Postgres**

```ts
// lib/auth/userStore.ts
// Server-only: manages the user registry in Postgres (see db/migrations/0001_init.sql).
import crypto from 'node:crypto';
import { getPool } from '@/lib/db/pool';
import type { Domain, UserRecord } from './types';

interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  domain: Domain;
  created_at: Date;
}

function rowToUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    domain: row.domain,
    createdAt: row.created_at.getTime(),
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

export async function createUser(
  username: string,
  password: string,
  domain: Domain,
): Promise<UserRecord> {
  const passwordHash = await hashPassword(password);
  // ON CONFLICT DO NOTHING + RETURNING makes the uniqueness check atomic:
  // under concurrent signups with the same username, exactly one INSERT
  // returns a row and the other returns none — no read-modify-write race.
  const { rows } = await getPool().query<UserRow>(
    `INSERT INTO users (username, password_hash, domain)
     VALUES ($1, $2, $3)
     ON CONFLICT (username_lower) DO NOTHING
     RETURNING *`,
    [username, passwordHash, domain],
  );
  if (rows.length === 0) throw new Error('USERNAME_TAKEN');
  return rowToUser(rows[0]);
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
```

- [ ] **Step 4: Drop the now-unused file-system setup from the test and re-run**

Remove the `beforeEach`/`afterEach` file-system lines (`fs.mkdtemp`, `process.env.DATA_DIR`, `fs.rm`) from `lib/auth/userStore.test.ts` — they're no longer relevant once the store is Postgres-backed. Keep the `TRUNCATE users CASCADE` and `afterAll(getPool().end())`.

```bash
npx vitest run lib/auth/userStore.test.ts
```

Expected: `3 passed` — including the race test, now deterministically.

- [ ] **Step 5: Run the full test suite to confirm nothing else broke**

```bash
npm test
```

Expected: all tests pass (the auth API route tests — `app/api/auth/*/route.test.ts` — exercise `userStore` indirectly and should be unaffected since the public API didn't change).

- [ ] **Step 6: Commit**

```bash
git add lib/auth/userStore.ts lib/auth/userStore.test.ts
git commit -m "fix: move user registry to Postgres, closing the concurrent-signup race"
```

---

### Task 4: Migrate `lib/repository/fileStore.ts` to Postgres

**Files:**
- Modify: `lib/repository/fileStore.ts`
- Modify: `lib/repository/fileStore.test.ts`

**Interfaces:**
- Consumes: `getPool()` from `lib/db/pool.ts` (Task 2).
- Produces: unchanged public API — `readData(userId?): Promise<AppData | null>`, `writeData(data, userId?): Promise<void>`, `dataFilePath(userId?): string` (kept only for `lib/repository/fileBlobStore.ts`'s directory derivation — blobs stay on disk in this phase). Every real caller (`app/api/data/route.ts`, `app/api/files/gc/route.ts`) already always passes a `userId`, so the legacy no-`userId` snapshot path is dropped rather than ported.

- [ ] **Step 1: Rewrite the test for Postgres-backed behavior**

```ts
// lib/repository/fileStore.test.ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getPool } from '@/lib/db/pool';
import { seedData } from './seed';

const USER_ID = '11111111-1111-1111-1111-111111111111';

beforeEach(async () => {
  await getPool().query('TRUNCATE users, app_data CASCADE');
  await getPool().query(
    `INSERT INTO users (id, username, password_hash, domain) VALUES ($1, 'seeduser', 'x', 'civil-engineering')`,
    [USER_ID],
  );
});

afterAll(async () => {
  await getPool().end();
});

describe('fileStore', () => {
  it('returns null before anything is written', async () => {
    const { readData } = await import('./fileStore');
    expect(await readData(USER_ID)).toBeNull();
  });

  it('round-trips written data', async () => {
    const { readData, writeData } = await import('./fileStore');
    const data = seedData();
    await writeData(data, USER_ID);
    expect(await readData(USER_ID)).toEqual(data);
  });

  it('overwrites prior snapshots', async () => {
    const { readData, writeData } = await import('./fileStore');
    const first = seedData();
    await writeData(first, USER_ID);
    const second = seedData();
    await writeData(second, USER_ID);
    const loaded = await readData(USER_ID);
    expect(loaded!.subjectOrder).toEqual(second.subjectOrder);
  });
});
```

- [ ] **Step 2: Run it against the current implementation to confirm it fails**

```bash
npx vitest run lib/repository/fileStore.test.ts
```

Expected: FAIL — the current implementation reads/writes local files under `data/users/<uuid>/appdata.json`, not the `app_data` table, so `readData(USER_ID)` after `writeData` finds nothing written by Postgres (or errors if `getPool()` can't resolve `DATABASE_URL` in this file's context — either way, red).

- [ ] **Step 3: Rewrite `fileStore.ts`**

```ts
// lib/repository/fileStore.ts
import path from 'node:path';
import type { AppData } from '@/lib/domain/types';
import { getPool } from '@/lib/db/pool';

// Snapshot data lives in the Postgres `app_data` table (see readData/writeData
// below). `dataFilePath` is kept only so lib/repository/fileBlobStore.ts can
// still derive the on-disk directory for uploaded file blobs, which remain
// on local disk in this phase — the path it returns is no longer read or
// written as a JSON file.
function dataRoot(): string {
  return process.env.DATA_DIR ?? path.join(process.cwd(), 'data');
}

export function dataFilePath(userId?: string): string {
  if (userId) {
    return path.join(dataRoot(), 'users', userId, 'appdata.json');
  }
  return process.env.DATA_FILE ?? path.join(dataRoot(), 'appdata.json');
}

export async function readData(userId?: string): Promise<AppData | null> {
  if (!userId) return null;
  const { rows } = await getPool().query<{ data: AppData }>(
    'SELECT data FROM app_data WHERE user_id = $1',
    [userId],
  );
  return rows[0]?.data ?? null;
}

export async function writeData(data: AppData, userId?: string): Promise<void> {
  if (!userId) throw new Error('writeData requires a userId');
  await getPool().query(
    `INSERT INTO app_data (user_id, data, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
    [userId, JSON.stringify(data)],
  );
}
```

- [ ] **Step 4: Run the test again to confirm it passes**

```bash
npx vitest run lib/repository/fileStore.test.ts
```

Expected: `3 passed`.

- [ ] **Step 5: Run the full suite**

```bash
npm test
```

Expected: all pass, including `lib/repository/fileBlobStore.test.ts` unchanged (it never touched `readData`/`writeData`, only `dataFilePath` via `filesDir()`) and `app/api/data/route.test.ts` if present (exercises the route against the new backend transparently, since the route only calls the unchanged `readData`/`writeData` signatures).

- [ ] **Step 6: Commit**

```bash
git add lib/repository/fileStore.ts lib/repository/fileStore.test.ts
git commit -m "feat: move per-user app-data snapshots from JSON files to Postgres"
```

---

### Task 5: Wire the containerized app to Postgres and verify end-to-end

**Files:**
- Modify: `README.md` (setup instructions)

**Interfaces:**
- Consumes: everything from Tasks 1–4. No new code — this task is verification that the full Docker Compose stack (already updated in Task 1) actually works end-to-end.

- [ ] **Step 1: Run migrations against the containerized dev database**

```bash
npm run db:migrate
```

Expected: applies `0001_init.sql` (or reports it already applied, if Task 2's manual run already did).

- [ ] **Step 2: Rebuild and start the full stack**

```bash
docker compose up -d --build
docker compose ps
```

Expected: both `revision_app_db` and `revision_app` show `Up`/`Up (healthy)`.

- [ ] **Step 3: Register a user through the running app and confirm it lands in Postgres**

```bash
curl -s -X POST http://127.0.0.1:3200/api/auth/register \
  -H 'content-type: application/json' \
  -d '{"username":"pilotuser","password":"password123","domain":"civil-engineering"}'
```

Expected: `201` with a JSON body containing `token` and `fileToken`. Then:

```bash
docker compose exec db psql -U revision -d revision_app -c "SELECT username, domain FROM users;"
```

Expected: one row, `pilotuser | civil-engineering`.

- [ ] **Step 4: Confirm the app-data snapshot round-trips through the container**

Using the `token` from Step 3 (substitute below):

```bash
TOKEN="<paste token here>"
curl -s http://127.0.0.1:3200/api/data -H "Authorization: Bearer $TOKEN" | head -c 200
docker compose exec db psql -U revision -d revision_app -c "SELECT user_id, jsonb_array_length(data->'subjectOrder') FROM app_data;"
```

Expected: the `GET` returns the seeded `AppData` JSON, and the `app_data` row shows the same subject count.

- [ ] **Step 5: Confirm data survives an app container restart**

```bash
docker compose restart app
curl -s http://127.0.0.1:3200/api/data -H "Authorization: Bearer $TOKEN" | head -c 200
```

Expected: identical response — data lived in Postgres, not in-process memory, so a restart doesn't lose it.

- [ ] **Step 6: Update README setup instructions**

Add a section to `README.md` documenting: copy `.env.example` to `.env`, set `POSTGRES_PASSWORD`/`SESSION_SECRET`, `docker volume create revision_app-data revision_app-db`, `docker compose up -d --build`, `npm run db:migrate`.

- [ ] **Step 7: Commit**

```bash
git add README.md
git commit -m "docs: document Postgres setup for local dev"
```

---

## Roadmap after this plan (separate plans, not detailed here)

This plan only builds the foundation. The institute-facing features discussed are staged as their own plans, each producing working software on its own:

- **Phase 2 — Institute & Roles**: `institutes` table, `role`/`institute_id` columns on `users`, faculty roster read endpoint.
- **Phase 3 — Faculty-Assigned Tasks**: assignment records, student-side "assigned by faculty" view.
- **Phase 4 — Institute Analytics Dashboard**: aggregate progress/engagement queries across a roster.
- **Phase 5 — Bulk Student Onboarding**: CSV import / invite codes for faculty and admins.

Say the word when you're ready to start Phase 2 and I'll write that plan in the same detail as this one.
