# Microservices Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `revision_app` from a single Next.js monolith into four independently deployable pieces — `auth-service`, `content-service`, `files-service`, and the `apps/frontend` Next.js app acting as UI + gateway — in one npm-workspaces monorepo, with per-service Postgres ownership and CODEOWNERS-based two-person collaboration.

**Architecture:** Strangler-fig migration in five phases, each leaving the app fully deployable: (0) land the in-flight Postgres migration, (1) reshape into a monorepo skeleton with a shared types/session package, (2)-(4) extract auth, files, and content one at a time behind gateway proxy routes, (5) add ownership/CI scaffolding and a full-stack smoke test. Backend services are small Express apps run via `tsx` (no separate build step); the frontend keeps its existing Next.js build. Session tokens keep their current HMAC-signed format — only *where* they're verified changes.

**Tech Stack:** Node 20, TypeScript, Express 4, `pg` (node-postgres, no ORM), `tsx` for running services, `zod` for request validation, npm workspaces, Docker Compose, Vitest + Supertest (against real Postgres, never mocked).

## Global Constraints

- No ORM — hand-written SQL via `pg`, matching the existing project convention.
- All DB-backed tests run against a real Postgres test database, never a mocked `pg` client (see `docs/superpowers/plans/2026-07-13-postgres-foundation.md`).
- Session tokens are HMAC-SHA256, base64url payload + signature, exactly the current format in `lib/auth/session.ts` — do not change the wire format, only relocate the code.
- Only `auth-service` issues tokens; `content-service` and `files-service` verify them locally via a shared `SESSION_SECRET` env var — no service ever calls another service to check a session.
- The gateway (`apps/frontend`'s `app/api/*` routes) never verifies sessions itself — it forwards the `Authorization` header unchanged and relays the backend's response, including its status code.
- Shared package name: `@revision-app/shared`, `"private": true`, imported as raw TypeScript (no build step) — Next.js via `transpilePackages`, services via `tsx`.
- New services are plain Express apps run with `tsx src/server.ts` — no separate `tsc` build stage, to keep this split's Docker setup simple.
- Every Docker Compose service that owns a Postgres database gets its own database name; no two services share a database.

---

## Phase 0: Reconcile & Merge the In-Flight Postgres Migration

### Task 1: Merge `worktree-postgres-foundation` into master

**Context:** Master's working tree currently has *uncommitted* changes to `lib/repository/fileStore.ts` and `lib/repository/fileStore.test.ts` that are byte-identical to the committed versions on branch `worktree-postgres-foundation` (verified via `diff`). That branch has 5 commits doing the full migration (Postgres via Docker Compose, `users` + `app_data` tables, `lib/db/pool.ts`, a migration runner) and is a clean merge candidate — `git merge-base master worktree-postgres-foundation` shows master has only one commit ahead (the design-spec doc, no code overlap).

**Files:**
- Discard (superseded by merge): `lib/repository/fileStore.ts`, `lib/repository/fileStore.test.ts`
- Merge in from the branch: `lib/db/pool.ts`, `lib/auth/userStore.ts`, `lib/auth/userStore.test.ts`, `lib/db/schema.test.ts`, `db/init/001-databases.sql`, `db/migrations/0001_init.sql`, `scripts/migrate.mjs`, `docker-compose.yml`, `.env.example`, `vitest.config.ts`, `vitest.setup.ts`, `package.json`, `package-lock.json`, `app/api/auth/login/route.test.ts`, `app/api/auth/register/route.test.ts`, `app/api/files/gc/route.test.ts`

**Interfaces:**
- Produces: `getPool(): Pool` from `lib/db/pool.ts` (reads `DATABASE_URL`), and the Postgres-backed `readData`/`writeData` (`lib/repository/fileStore.ts`) and `findByUsername`/`createUser`/`verifyPassword` (`lib/auth/userStore.ts`) that later tasks build on.

- [ ] **Step 1: Discard master's stray uncommitted changes to the two files the merge will restore anyway**

```bash
git restore lib/repository/fileStore.ts lib/repository/fileStore.test.ts
git status --short   # should now show a clean working tree except for untracked docs/.claude noise
```

- [ ] **Step 2: Merge the branch**

```bash
git merge worktree-postgres-foundation -m "merge: land postgres-foundation (users + app_data in Postgres)"
```

Expected: clean merge, no conflicts (confirmed via the merge-base check above — master has no competing commits touching these files).

- [ ] **Step 3: Provision the local Postgres container and run migrations**

```bash
cp .env.example .env   # if not already present; fill in SESSION_SECRET and POSTGRES_PASSWORD
docker compose up -d db
npm run db:migrate        # applies db/migrations/*.sql to revision_app
npm run db:migrate -- --test   # applies to revision_app_test
```

Expected: `scripts/migrate.mjs` reports `applying: 0001_init.sql` then exits 0 for both runs.

- [ ] **Step 4: Run the full test suite against real Postgres**

```bash
npm test
```

Expected: all suites pass, including `lib/repository/fileStore.test.ts` and `lib/auth/userStore.test.ts` running against `revision_app_test`.

- [ ] **Step 5: Remove the now-merged worktree**

```bash
git worktree remove .claude/worktrees/postgres-foundation
git branch -d worktree-postgres-foundation
```

- [ ] **Step 6: Commit**

(The merge commit from Step 2 already covers this — verify it's the tip.)

```bash
git log --oneline -3
```

### Task 2: Verify the merged app end-to-end via Docker Compose

**Files:** none (verification only)

**Interfaces:** none

- [ ] **Step 1: Build and start the full stack**

```bash
docker compose up -d --build
```

- [ ] **Step 2: Register a user and confirm data round-trips through Postgres**

```bash
curl -s -X POST http://127.0.0.1:3200/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"smoketest","password":"smoketest123","domain":"civil-engineering"}'
```

Expected: `201` with a JSON body containing `token` and `fileToken`.

- [ ] **Step 3: Confirm `GET /api/data` seeds and returns data for that user, using the token from Step 2**

```bash
curl -s http://127.0.0.1:3200/api/data -H "Authorization: Bearer <token-from-step-2>"
```

Expected: `200` with a JSON `AppData` object (subjects/chapters/topics).

- [ ] **Step 4: Tear down**

```bash
docker compose down
```

---

## Phase 1: Monorepo Skeleton & Shared Package

### Task 3: Establish npm workspaces and move the app into `apps/frontend`

**Files:**
- Create: `package.json` (new root, replaces the current one)
- Move: everything currently at the repo root that belongs to the Next.js app (`app/`, `components/`, `store/`, `lib/`, `public/`, `next.config.mjs`, `next-env.d.ts`, `tsconfig.json`, `tsconfig.tsbuildinfo`, `vitest.config.ts`, `vitest.setup.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `Dockerfile`, `data/`, `scripts/`) into `apps/frontend/`
- Create: `apps/frontend/package.json` (the current root `package.json`, renamed)
- Modify: `docker-compose.yml` (point the `app` service's build at the new path)

**Interfaces:**
- Produces: `apps/frontend` as a workspace named `frontend`, buildable independently via `npm run build -w apps/frontend`.

- [ ] **Step 1: Create the directory and move files with `git mv` (preserves history)**

```bash
mkdir -p apps/frontend
for p in app components store lib public next.config.mjs next-env.d.ts \
         tsconfig.json vitest.config.ts vitest.setup.ts postcss.config.mjs \
         eslint.config.mjs Dockerfile data scripts; do
  git mv "$p" "apps/frontend/$p"
done
git mv package.json apps/frontend/package.json
git mv package-lock.json apps/frontend/package-lock.json.bak   # temporary, see Step 3
rm -f tsconfig.tsbuildinfo   # build artifact, not tracked meaningfully
```

- [ ] **Step 2: Rename the workspace package**

Edit `apps/frontend/package.json`, change the `"name"` field:

```json
{
  "name": "frontend",
  "version": "0.1.0",
  "private": true,
```

(leave every other field as-is — scripts, dependencies, devDependencies unchanged)

- [ ] **Step 3: Create the new root `package.json`**

```json
{
  "name": "revision-app-monorepo",
  "private": true,
  "workspaces": [
    "apps/*",
    "services/*",
    "packages/*"
  ]
}
```

```bash
rm apps/frontend/package-lock.json.bak
npm install   # regenerates a single root package-lock.json covering all workspaces
```

- [ ] **Step 4: Update `docker-compose.yml`'s `app` service to build from the new Dockerfile location with a repo-root context**

```yaml
  app:
    build:
      context: .
      dockerfile: apps/frontend/Dockerfile
    container_name: revision_app
    ports:
      - "127.0.0.1:3200:3000"
    environment:
      - SESSION_SECRET=${SESSION_SECRET}
      - DATABASE_URL=postgres://revision:${POSTGRES_PASSWORD}@db:5432/revision_app
    volumes:
      - revision_app-data:/repo/apps/frontend/data
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped
```

- [ ] **Step 5: Update `apps/frontend/Dockerfile` for the monorepo build context**

```dockerfile
# syntax=docker/dockerfile:1

FROM node:20-slim AS builder
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/frontend/package.json apps/frontend/package.json
RUN npm ci
COPY apps/frontend apps/frontend
WORKDIR /repo/apps/frontend
RUN npm run build

FROM node:20-slim AS runner
WORKDIR /repo
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY package.json package-lock.json ./
COPY apps/frontend/package.json apps/frontend/package.json
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /repo/apps/frontend/.next apps/frontend/.next
COPY --from=builder /repo/apps/frontend/public apps/frontend/public
COPY --from=builder /repo/apps/frontend/next.config.mjs apps/frontend/next.config.mjs
WORKDIR /repo/apps/frontend
EXPOSE 3000
CMD ["npm", "start"]
```

- [ ] **Step 6: Verify the move didn't break anything**

```bash
npm test -w apps/frontend
npm run build -w apps/frontend
```

Expected: same test results as before the move; build succeeds.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: move app into apps/frontend, establish npm workspaces"
```

### Task 4: Create `packages/shared` with domain types, session tokens, and GC logic

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/types.ts` (moved from `apps/frontend/lib/domain/types.ts`)
- Create: `packages/shared/src/id.ts` (moved from `apps/frontend/lib/domain/id.ts`)
- Create: `packages/shared/src/authTypes.ts` (moved from `apps/frontend/lib/auth/types.ts`)
- Create: `packages/shared/src/session.ts` (moved from `apps/frontend/lib/auth/session.ts`)
- Create: `packages/shared/src/session.test.ts` (moved from `apps/frontend/lib/auth/session.test.ts`)
- Create: `packages/shared/src/referencedBlobIds.ts` (extracted pure function from `apps/frontend/lib/repository/gc.ts`)
- Create: `packages/shared/src/referencedBlobIds.test.ts`
- Create: `packages/shared/src/index.ts`

**Interfaces:**
- Produces: `AppData`, `Subject`, `Chapter`, `Topic`, `Tag`, `Attachment`, `Flashcard`, `Revision`, `Difficulty`, `Priority`, `AttachmentKind` (types), `makeId(): string`, `Domain`, `Session`, `UserRecord`, `DOMAIN_LABELS`, `signSession(session: Session): string`, `verifySession(token: string): Session | null`, `signFileToken(userId: string): string`, `verifyFileToken(token: string): string | null`, `getSessionFromRequest(req: Request): Session | null`, `getFileAccessUserId(req: Request): string | null`, `referencedBlobIds(data: AppData | null): Set<string>`.

- [ ] **Step 1: Scaffold the package**

```json
// packages/shared/package.json
{
  "name": "@revision-app/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts"
}
```

```json
// packages/shared/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 2: Move domain and auth types verbatim**

```bash
git mv apps/frontend/lib/domain/types.ts packages/shared/src/types.ts
git mv apps/frontend/lib/domain/id.ts packages/shared/src/id.ts
git mv apps/frontend/lib/auth/types.ts packages/shared/src/authTypes.ts
```

- [ ] **Step 3: Move session token logic verbatim**

```bash
git mv apps/frontend/lib/auth/session.ts packages/shared/src/session.ts
git mv apps/frontend/lib/auth/session.test.ts packages/shared/src/session.test.ts
```

In `packages/shared/src/session.ts`, update the type import:

```typescript
import type { Session } from './authTypes';
```

In `packages/shared/src/session.test.ts`, update the type import:

```typescript
import type { Session } from './authTypes';
```

- [ ] **Step 4: Extract `referencedBlobIds` as a standalone pure function**

```typescript
// packages/shared/src/referencedBlobIds.ts
import type { AppData } from './types';

const UPLOAD_URL_RE = /^\/api\/files\/([A-Za-z0-9-]+)$/;

export function referencedBlobIds(data: AppData | null): Set<string> {
  const ids = new Set<string>();
  if (!data) return ids;
  for (const t of Object.values(data.topics)) {
    for (const a of t.attachments ?? []) {
      const m = a.url.match(UPLOAD_URL_RE);
      if (m) ids.add(m[1]);
    }
  }
  return ids;
}
```

```typescript
// packages/shared/src/referencedBlobIds.test.ts
import { describe, it, expect } from 'vitest';
import { referencedBlobIds } from './referencedBlobIds';
import type { AppData } from './types';

function emptyData(): AppData {
  return { subjects: {}, chapters: {}, topics: {}, subjectOrder: [], tags: {}, tagOrder: [] };
}

describe('referencedBlobIds', () => {
  it('returns an empty set for null data', () => {
    expect(referencedBlobIds(null)).toEqual(new Set());
  });

  it('collects ids from attachment URLs matching /api/files/<id>', () => {
    const data = emptyData();
    data.topics['t1'] = {
      id: 't1', chapterId: 'c1', title: 'Topic', notes: '', order: 0,
      difficulty: 'Easy', priority: 'Low', revisionHistory: [], createdAt: 0, updatedAt: 0,
      attachments: [
        { id: 'a1', name: 'x.png', kind: 'image', url: '/api/files/blob-1', createdAt: 0 },
        { id: 'a2', name: 'ext', kind: 'link', url: 'https://example.com/x', createdAt: 0 },
      ],
    };
    expect(referencedBlobIds(data)).toEqual(new Set(['blob-1']));
  });
});
```

- [ ] **Step 5: Write the barrel export**

```typescript
// packages/shared/src/index.ts
export * from './types';
export * from './id';
export * from './authTypes';
export * from './session';
export * from './referencedBlobIds';
```

- [ ] **Step 6: Add `@revision-app/shared` as a workspace dependency of `apps/frontend`**

In `apps/frontend/package.json`, add to `dependencies`:

```json
"@revision-app/shared": "*"
```

In `apps/frontend/next.config.mjs`, add `transpilePackages`:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@revision-app/shared'],
};

export default nextConfig;
```

```bash
npm install
```

- [ ] **Step 7: Run the shared package's own tests**

```bash
npm test -w packages/shared
```

Expected: `session.test.ts` and `referencedBlobIds.test.ts` pass.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: extract packages/shared (domain types, session tokens, referencedBlobIds)"
```

### Task 5: Point `apps/frontend` at `packages/shared`, remove duplicated modules, add the content-client seam

**Context:** This task deletes the now-duplicated `lib/domain`, `lib/auth/types.ts`, `lib/auth/session.ts` from `apps/frontend` and repoints every import at `@revision-app/shared`. It also introduces `apps/frontend/lib/contentClient.ts` — a thin wrapper around `readData`/`writeData` that Task 16 (Phase 4) will later repoint at `content-service` over HTTP instead of the local DB, without touching its callers.

**Files:**
- Delete: `apps/frontend/lib/domain/types.ts`, `apps/frontend/lib/domain/id.ts`, `apps/frontend/lib/auth/types.ts`, `apps/frontend/lib/auth/session.ts`, `apps/frontend/lib/auth/session.test.ts`
- Create: `apps/frontend/lib/contentClient.ts`
- Modify: every file importing from `@/lib/domain/types`, `@/lib/domain/id`, `@/lib/auth/types`, `@/lib/auth/session` (grep-driven, see Step 2)
- Modify: `apps/frontend/app/api/data/route.ts`, `apps/frontend/app/api/files/gc/route.ts` (use `contentClient`)

**Interfaces:**
- Produces: `apps/frontend/lib/contentClient.ts` exporting `getAppData(userId: string): Promise<AppData | null>` and `putAppData(userId: string, data: AppData): Promise<void>` — Task 16 changes only this file's internals.

- [ ] **Step 1: Delete the now-duplicated files**

```bash
git rm apps/frontend/lib/domain/types.ts apps/frontend/lib/domain/id.ts \
       apps/frontend/lib/auth/types.ts apps/frontend/lib/auth/session.ts \
       apps/frontend/lib/auth/session.test.ts
```

- [ ] **Step 2: Repoint every import**

```bash
cd apps/frontend
grep -rl "@/lib/domain/types\|@/lib/domain/id\|@/lib/auth/types\|@/lib/auth/session" \
  app components store lib | while read -r f; do
  sed -i \
    -e "s#@/lib/domain/types#@revision-app/shared#g" \
    -e "s#@/lib/domain/id#@revision-app/shared#g" \
    -e "s#@/lib/auth/types#@revision-app/shared#g" \
    -e "s#@/lib/auth/session#@revision-app/shared#g" \
    "$f"
done
cd ../..
```

- [ ] **Step 3: Create the content-client seam**

```typescript
// apps/frontend/lib/contentClient.ts
// Thin wrapper so callers don't know whether app data comes from the local
// Postgres connection or (post-extraction) content-service over HTTP.
import type { AppData } from '@revision-app/shared';
import { readData, writeData } from './repository/fileStore';

export async function getAppData(userId: string): Promise<AppData | null> {
  return readData(userId);
}

export async function putAppData(userId: string, data: AppData): Promise<void> {
  await writeData(data, userId);
}
```

- [ ] **Step 4: Update the two routes that need `AppData` server-side to use it**

```typescript
// apps/frontend/app/api/data/route.ts
import type { NextRequest } from 'next/server';
import type { AppData } from '@revision-app/shared';
import { getAppData, putAppData } from '@/lib/contentClient';
import { getSessionFromRequest } from '@revision-app/shared';
import { seedDataForDomain } from '@/lib/repository/seed';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const data = await getAppData(session.userId);
  if (!data) {
    const seeded = seedDataForDomain(session.domain);
    await putAppData(session.userId, seeded);
    return Response.json(seeded);
  }
  return Response.json(data);
}

export async function PUT(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const body = (await req.json()) as AppData;
  await putAppData(session.userId, body);
  return new Response(null, { status: 204 });
}
```

```typescript
// apps/frontend/app/api/files/gc/route.ts
import { referencedBlobIds, getSessionFromRequest } from '@revision-app/shared';
import { getAppData } from '@/lib/contentClient';
import { sweepUnreferenced } from '@/lib/repository/gc';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const session = getSessionFromRequest(req);
  if (!session) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const data = await getAppData(session.userId);
  const result = await sweepUnreferenced(referencedBlobIds(data), Date.now(), session.userId);
  return Response.json(result);
}
```

In `apps/frontend/lib/repository/gc.ts`, remove the now-duplicated `referencedBlobIds` export (keep only `sweepUnreferenced`, importing `GC_GRACE_MS` and `filesDir`/`deleteBlob` as before) and drop its now-unused `AppData` import.

- [ ] **Step 5: Run the full test suite and typecheck**

```bash
npm test -w apps/frontend
npx tsc --noEmit -p apps/frontend/tsconfig.json
```

Expected: all tests pass; no type errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: repoint apps/frontend at @revision-app/shared, add contentClient seam"
```

---

## Phase 2: Extract `auth-service`

### Task 6: Scaffold `services/auth-service` with its own Postgres database

**Files:**
- Create: `services/auth-service/package.json`
- Create: `services/auth-service/tsconfig.json`
- Create: `services/auth-service/Dockerfile`
- Create: `services/auth-service/src/db.ts`
- Create: `services/auth-service/db/migrations/0001_init.sql`
- Create: `db/init/002-auth-databases.sql` (repo-root Postgres init, for fresh volumes)

**Interfaces:**
- Produces: `getPool(): Pool` in `services/auth-service/src/db.ts` (reads `DATABASE_URL`, same shape as `packages/shared` needs nothing from this — it's service-local).

- [ ] **Step 1: Package and TS config**

```json
// services/auth-service/package.json
{
  "name": "auth-service",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "start": "tsx src/server.ts",
    "test": "vitest run",
    "db:migrate": "node ../../scripts/migrate.mjs"
  },
  "dependencies": {
    "@revision-app/shared": "*",
    "express": "^4.21.0",
    "pg": "^8.22.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/supertest": "^6.0.2",
    "supertest": "^7.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5",
    "vitest": "^3.2.7"
  }
}
```

```json
// services/auth-service/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 2: DB pool and migration**

```typescript
// services/auth-service/src/db.ts
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

```sql
-- services/auth-service/db/migrations/0001_init.sql
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
```

```sql
-- db/init/002-auth-databases.sql
-- Runs on first container init alongside 001-databases.sql (revision_app).
CREATE DATABASE revision_auth;
CREATE DATABASE revision_auth_test;
```

- [ ] **Step 3: Dockerfile (single-stage, runs via `tsx`)**

```dockerfile
# syntax=docker/dockerfile:1
FROM node:20-slim
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY services/auth-service/package.json services/auth-service/package.json
RUN npm ci
COPY packages/shared packages/shared
COPY services/auth-service services/auth-service
WORKDIR /repo/services/auth-service
EXPOSE 4001
CMD ["npm", "start"]
```

- [ ] **Step 4: Install and confirm the workspace resolves**

```bash
npm install
```

Expected: `node_modules/auth-service` symlink appears (npm workspaces convention), no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold services/auth-service package and its Postgres database"
```

### Task 7: Implement `auth-service`'s HTTP API and move `userStore`

**Files:**
- Create: `services/auth-service/src/userStore.ts` (moved from `apps/frontend/lib/auth/userStore.ts`, targeting this service's own pool)
- Create: `services/auth-service/src/userStore.test.ts` (moved from `apps/frontend/lib/auth/userStore.test.ts`)
- Create: `services/auth-service/src/server.ts`
- Create: `services/auth-service/src/server.test.ts`
- Delete: `apps/frontend/lib/auth/userStore.ts`, `apps/frontend/lib/auth/userStore.test.ts`

**Interfaces:**
- Consumes: `getPool` from `./db`; `Domain`, `UserRecord`, `Session`, `signSession`, `signFileToken` from `@revision-app/shared`.
- Produces: HTTP API — `POST /register`, `POST /login`, `GET /me`, `POST /logout` — identical request/response shapes to the current `apps/frontend/app/api/auth/*` routes.

- [ ] **Step 1: Move `userStore.ts`, repointing its pool import**

```bash
git mv apps/frontend/lib/auth/userStore.ts services/auth-service/src/userStore.ts
git mv apps/frontend/lib/auth/userStore.test.ts services/auth-service/src/userStore.test.ts
```

In `services/auth-service/src/userStore.ts`, change the imports:

```typescript
import { getPool } from './db';
import type { Domain, UserRecord } from '@revision-app/shared';
```

(function bodies stay exactly as in the merged `apps/frontend/lib/auth/userStore.ts` from Task 1 — `listUsers`, `findByUsername`, `findById`, `createUser` with its `ON CONFLICT ... RETURNING` atomic-insert pattern, `hashPassword`, `verifyPassword`)

In `services/auth-service/src/userStore.test.ts`, update the DB setup to point at this service's own test database (`revision_auth_test` via `DATABASE_URL`/`TEST_DATABASE_URL`) — keep the existing `TRUNCATE users CASCADE` / seed-row pattern from the merged test file, dropping the `app_data` truncate (this service doesn't own that table).

- [ ] **Step 2: Write the Express server**

```typescript
// services/auth-service/src/server.ts
import express from 'express';
import { findByUsername, createUser, verifyPassword } from './userStore';
import { signSession, signFileToken, verifySession, DOMAIN_LABELS } from '@revision-app/shared';
import type { Domain } from '@revision-app/shared';

const ALLOW_REGISTRATION = process.env.ALLOW_REGISTRATION !== 'false';

export function createApp() {
  const app = express();
  app.use(express.json());

  app.post('/register', async (req, res) => {
    if (!ALLOW_REGISTRATION) {
      return res.status(403).json({ error: 'Registration is disabled' });
    }
    const { username, password, domain } = req.body ?? {};
    if (!username || typeof username !== 'string' || username.trim().length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    if (!domain || !(domain in DOMAIN_LABELS)) {
      return res.status(400).json({ error: 'Invalid domain selected' });
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
      return res.status(400).json({ error: 'Username may only contain letters, numbers, and underscores' });
    }
    try {
      const user = await createUser(username.trim(), password, domain as Domain);
      const session = { userId: user.id, username: user.username, domain: user.domain };
      res.status(201).json({ ...session, token: signSession(session), fileToken: signFileToken(user.id) });
    } catch (err) {
      if (err instanceof Error && err.message === 'USERNAME_TAKEN') {
        return res.status(409).json({ error: 'Username is already taken' });
      }
      console.error('[register]', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/login', async (req, res) => {
    const { username, password } = req.body ?? {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    const user = await findByUsername(username);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    const session = { userId: user.id, username: user.username, domain: user.domain };
    res.json({ ...session, token: signSession(session), fileToken: signFileToken(user.id) });
  });

  app.get('/me', (req, res) => {
    // Express's req.headers.authorization is a plain string, not a Fetch
    // Request — getSessionFromRequest (Fetch-shaped) doesn't apply here, so
    // this reads the header directly and calls verifySession itself.
    const authHeader = req.headers.authorization ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    const session = token ? verifySession(token) : null;
    if (!session) return res.status(401).json({ error: 'Not authenticated' });
    res.json({ ...session, token: signSession(session), fileToken: signFileToken(session.userId) });
  });

  app.post('/logout', (_req, res) => {
    res.status(204).end();
  });

  return app;
}

if (process.env.NODE_ENV !== 'test') {
  createApp().listen(4001, () => console.log('auth-service listening on 4001'));
}
```

- [ ] **Step 3: Write the server test with Supertest against the real test database**

```typescript
// services/auth-service/src/server.test.ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { getPool } from './db';
import { createApp } from './server';

const app = createApp();

beforeEach(async () => {
  await getPool().query('TRUNCATE users CASCADE');
});

afterAll(async () => {
  await getPool().end();
});

describe('POST /register then /login', () => {
  it('registers a user and returns a session token', async () => {
    const res = await request(app)
      .post('/register')
      .send({ username: 'alice', password: 'password123', domain: 'civil-engineering' });
    expect(res.status).toBe(201);
    expect(res.body.username).toBe('alice');
    expect(typeof res.body.token).toBe('string');
  });

  it('rejects login with a wrong password', async () => {
    await request(app).post('/register').send({ username: 'bob', password: 'password123', domain: 'civil-engineering' });
    const res = await request(app).post('/login').send({ username: 'bob', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('logs in with correct credentials and returns a usable token for /me', async () => {
    await request(app).post('/register').send({ username: 'carol', password: 'password123', domain: 'civil-engineering' });
    const login = await request(app).post('/login').send({ username: 'carol', password: 'password123' });
    expect(login.status).toBe(200);
    const me = await request(app).get('/me').set('Authorization', `Bearer ${login.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.username).toBe('carol');
  });
});
```

- [ ] **Step 4: Set env vars and run the tests**

```bash
export DATABASE_URL=postgres://revision:changeme@127.0.0.1:5433/revision_auth_test
export SESSION_SECRET=dev-secret-change-me
npm test -w services/auth-service
```

Expected: all three tests pass against the real `revision_auth_test` database.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: implement auth-service (register/login/me/logout)"
```

### Task 8: Turn `apps/frontend`'s `/api/auth/*` routes into gateway proxies

**Files:**
- Create: `apps/frontend/lib/serviceProxy.ts`
- Modify: `apps/frontend/app/api/auth/register/route.ts`, `apps/frontend/app/api/auth/login/route.ts`, `apps/frontend/app/api/auth/me/route.ts`, `apps/frontend/app/api/auth/logout/route.ts`

**Interfaces:**
- Produces: `proxyRequest(req: Request, targetUrl: string): Promise<Response>` — a generic forwarder reused by Phases 3 and 4's proxy routes too.

- [ ] **Step 1: Write the shared proxy helper**

```typescript
// apps/frontend/lib/serviceProxy.ts
// Forwards a request to a backend service unchanged (method, headers, body)
// and relays its response unchanged (status, body). No session logic here —
// each backend service verifies its own bearer token. A 5s timeout and a
// clean 502/503 on failure keep one backend's outage from hanging the
// browser or taking down unrelated routes (e.g. files-service being down
// must not block login).
export const PROXY_TIMEOUT_MS = 5000;

export async function proxyRequest(req: Request, targetUrl: string): Promise<Response> {
  const headers = new Headers(req.headers);
  headers.delete('host');
  headers.delete('content-length');

  const init: RequestInit = {
    method: req.method,
    headers,
    // GET/HEAD must not carry a body.
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : await req.arrayBuffer(),
    signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
  };

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, init);
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError';
    return Response.json(
      { error: timedOut ? 'Upstream service timed out' : 'Upstream service unavailable' },
      { status: timedOut ? 504 : 502 },
    );
  }
  const body = await upstream.arrayBuffer();
  const resHeaders = new Headers(upstream.headers);
  return new Response(body, { status: upstream.status, headers: resHeaders });
}
```

- [ ] **Step 2: Rewrite the four auth routes as proxies**

```typescript
// apps/frontend/app/api/auth/register/route.ts
import { proxyRequest } from '@/lib/serviceProxy';

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? 'http://127.0.0.1:4001';

export async function POST(req: Request) {
  return proxyRequest(req, `${AUTH_SERVICE_URL}/register`);
}
```

```typescript
// apps/frontend/app/api/auth/login/route.ts
import { proxyRequest } from '@/lib/serviceProxy';

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? 'http://127.0.0.1:4001';

export async function POST(req: Request) {
  return proxyRequest(req, `${AUTH_SERVICE_URL}/login`);
}
```

```typescript
// apps/frontend/app/api/auth/me/route.ts
import { proxyRequest } from '@/lib/serviceProxy';

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? 'http://127.0.0.1:4001';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return proxyRequest(req, `${AUTH_SERVICE_URL}/me`);
}
```

```typescript
// apps/frontend/app/api/auth/logout/route.ts
import { proxyRequest } from '@/lib/serviceProxy';

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? 'http://127.0.0.1:4001';

export async function POST(req: Request) {
  return proxyRequest(req, `${AUTH_SERVICE_URL}/logout`);
}
```

- [ ] **Step 3: Delete the now-obsolete route tests that exercised local logic directly (superseded by `services/auth-service/src/server.test.ts` and Task 9's end-to-end check)**

```bash
git rm apps/frontend/app/api/auth/login/route.test.ts apps/frontend/app/api/auth/register/route.test.ts
```

- [ ] **Step 4: Run auth-service locally and confirm the proxy works**

```bash
DATABASE_URL=postgres://revision:changeme@127.0.0.1:5433/revision_auth SESSION_SECRET=dev-secret-change-me \
  npm start -w services/auth-service &
AUTH_SERVICE_URL=http://127.0.0.1:4001 npm run dev -w apps/frontend &
sleep 2
curl -s -X POST http://127.0.0.1:3000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"proxytest","password":"password123","domain":"civil-engineering"}'
```

Expected: `201` response with `token`/`fileToken`, proving the gateway → auth-service round trip works. Kill both background processes afterward.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: gateway proxies /api/auth/* to auth-service"
```

### Task 9: Wire `auth-service` into Docker Compose and verify end-to-end

**Files:**
- Modify: `docker-compose.yml`
- Modify: `.env.example`

**Interfaces:** none (integration wiring)

- [ ] **Step 1: Add the `auth-service` block and the gateway's `AUTH_SERVICE_URL`**

```yaml
  auth-service:
    build:
      context: .
      dockerfile: services/auth-service/Dockerfile
    container_name: revision_auth_service
    environment:
      - DATABASE_URL=postgres://revision:${POSTGRES_PASSWORD}@db:5432/revision_auth
      - SESSION_SECRET=${SESSION_SECRET}
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped
```

Add to the `app` service's `environment`:

```yaml
      - AUTH_SERVICE_URL=http://auth-service:4001
```

Add `auth-service` to the `app` service's `depends_on` (default `service_started` condition — these are plain Express apps without a healthcheck endpoint yet, which is an acceptable simplification for this split).

- [ ] **Step 2: Full stack up, register/login/me through the gateway**

```bash
docker compose up -d --build
curl -s -X POST http://127.0.0.1:3200/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"e2etest","password":"password123","domain":"civil-engineering"}'
```

Expected: `201`, and the response's `userId` is a valid uuid from the `revision_auth` database (not `revision_app`).

```bash
docker compose exec db psql -U revision -d revision_auth -c "SELECT username FROM users WHERE username = 'e2etest';"
```

Expected: one row.

- [ ] **Step 3: Tear down and commit**

```bash
docker compose down
git add -A
git commit -m "chore: wire auth-service into docker-compose"
```

---

## Phase 3: Extract `files-service`

### Task 10: Scaffold `services/files-service`

**Context:** Files have no relational data today — just a blob and a `<id>.json` metadata sidecar on disk, keyed by user directory (`lib/repository/fileBlobStore.ts`). This service owns its own Docker volume, not a Postgres database — introducing an unused DB here would violate YAGNI.

**Files:**
- Create: `services/files-service/package.json`
- Create: `services/files-service/tsconfig.json`
- Create: `services/files-service/Dockerfile`

- [ ] **Step 1: Package and TS config**

```json
// services/files-service/package.json
{
  "name": "files-service",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "start": "tsx src/server.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@revision-app/shared": "*",
    "express": "^4.21.0",
    "multer": "^1.4.5-lts.1"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/multer": "^1.4.12",
    "@types/supertest": "^6.0.2",
    "supertest": "^7.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5",
    "vitest": "^3.2.7"
  }
}
```

```json
// services/files-service/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 2: Dockerfile**

```dockerfile
# syntax=docker/dockerfile:1
FROM node:20-slim
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY services/files-service/package.json services/files-service/package.json
RUN npm ci
COPY packages/shared packages/shared
COPY services/files-service services/files-service
WORKDIR /repo/services/files-service
EXPOSE 4003
CMD ["npm", "start"]
```

- [ ] **Step 3: Install and commit**

```bash
npm install
git add -A
git commit -m "chore: scaffold services/files-service package"
```

### Task 11: Implement `files-service`'s HTTP API and move blob storage

**Files:**
- Create: `services/files-service/src/blobStore.ts` (moved from `apps/frontend/lib/repository/fileBlobStore.ts`, simplified — this service owns its own flat `FILES_DIR`, no more borrowing `dataFilePath`'s directory from the content store)
- Create: `services/files-service/src/blobStore.test.ts`
- Create: `services/files-service/src/gc.ts` (moved `sweepUnreferenced` from `apps/frontend/lib/repository/gc.ts`)
- Create: `services/files-service/src/gc.test.ts`
- Create: `services/files-service/src/server.ts`
- Create: `services/files-service/src/server.test.ts`
- Delete: `apps/frontend/lib/repository/fileBlobStore.ts`, `apps/frontend/lib/repository/fileBlobStore.test.ts`, `apps/frontend/lib/repository/gc.ts`, `apps/frontend/lib/repository/gc.test.ts`

**Interfaces:**
- Produces: HTTP API — `POST /upload` (multipart, `Authorization: Bearer`), `GET /:id` (bearer header or `?token=` file-scoped token), `DELETE /:id` (bearer), `POST /gc` (bearer, body `{ referencedIds: string[] }`).

- [ ] **Step 1: Move and adapt blob storage to own its directory directly**

```typescript
// services/files-service/src/blobStore.ts
import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface BlobMeta {
  name: string;
  mime: string;
  size: number;
}

const BLOB_ID_RE = /^[A-Za-z0-9-]{1,64}$/;

export function isValidBlobId(id: string): boolean {
  return BLOB_ID_RE.test(id);
}

function filesRoot(): string {
  return process.env.FILES_DIR ?? path.join(process.cwd(), 'data', 'files');
}

export function filesDir(userId: string): string {
  return path.join(filesRoot(), userId);
}

export async function writeBlob(id: string, bytes: Buffer, meta: BlobMeta, userId: string): Promise<void> {
  const dir = filesDir(userId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, id), bytes);
  await fs.writeFile(path.join(dir, `${id}.json`), JSON.stringify(meta), 'utf8');
}

export async function readBlob(id: string, userId: string): Promise<{ bytes: Buffer; meta: BlobMeta } | null> {
  if (!isValidBlobId(id)) return null;
  const dir = filesDir(userId);
  try {
    const bytes = await fs.readFile(path.join(dir, id));
    const meta = JSON.parse(await fs.readFile(path.join(dir, `${id}.json`), 'utf8')) as BlobMeta;
    return { bytes, meta };
  } catch {
    return null;
  }
}

export async function deleteBlob(id: string, userId: string): Promise<void> {
  if (!isValidBlobId(id)) return;
  const dir = filesDir(userId);
  await fs.rm(path.join(dir, id), { force: true });
  await fs.rm(path.join(dir, `${id}.json`), { force: true });
}

export const GC_GRACE_MS = 24 * 60 * 60 * 1000;
```

```typescript
// services/files-service/src/blobStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeBlob, readBlob, deleteBlob } from './blobStore';

beforeEach(async () => {
  process.env.FILES_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'files-service-'));
});

describe('blobStore', () => {
  it('round-trips a blob and its metadata for a user', async () => {
    await writeBlob('abc123', Buffer.from('hello'), { name: 'x.png', mime: 'image/png', size: 5 }, 'user-1');
    const result = await readBlob('abc123', 'user-1');
    expect(result?.bytes.toString()).toBe('hello');
    expect(result?.meta.name).toBe('x.png');
  });

  it('isolates blobs per user', async () => {
    await writeBlob('abc123', Buffer.from('hello'), { name: 'x.png', mime: 'image/png', size: 5 }, 'user-1');
    expect(await readBlob('abc123', 'user-2')).toBeNull();
  });

  it('deletes a blob and its metadata', async () => {
    await writeBlob('abc123', Buffer.from('hello'), { name: 'x.png', mime: 'image/png', size: 5 }, 'user-1');
    await deleteBlob('abc123', 'user-1');
    expect(await readBlob('abc123', 'user-1')).toBeNull();
  });
});
```

- [ ] **Step 2: Move GC sweep logic**

```typescript
// services/files-service/src/gc.ts
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { filesDir, deleteBlob, GC_GRACE_MS } from './blobStore';

export async function sweepUnreferenced(
  referenced: Set<string>,
  userId: string,
  now = Date.now(),
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

```typescript
// services/files-service/src/gc.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeBlob } from './blobStore';
import { sweepUnreferenced } from './gc';

beforeEach(async () => {
  process.env.FILES_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'files-service-gc-'));
});

describe('sweepUnreferenced', () => {
  it('deletes unreferenced blobs older than the grace period', async () => {
    await writeBlob('old-blob', Buffer.from('x'), { name: 'x', mime: 'image/png', size: 1 }, 'user-1');
    const future = Date.now() + 25 * 60 * 60 * 1000; // past the 24h grace period
    const result = await sweepUnreferenced(new Set(), 'user-1', future);
    expect(result.deleted).toBe(1);
  });

  it('keeps referenced blobs regardless of age', async () => {
    await writeBlob('kept-blob', Buffer.from('x'), { name: 'x', mime: 'image/png', size: 1 }, 'user-1');
    const future = Date.now() + 25 * 60 * 60 * 1000;
    const result = await sweepUnreferenced(new Set(['kept-blob']), 'user-1', future);
    expect(result.deleted).toBe(0);
  });
});
```

- [ ] **Step 3: Write the Express server**

```typescript
// services/files-service/src/server.ts
import express from 'express';
import multer from 'multer';
import { makeId, verifySession, verifyFileToken } from '@revision-app/shared';
import { writeBlob, readBlob, deleteBlob, isValidBlobId } from './blobStore';
import { sweepUnreferenced } from './gc';

const MAX_UPLOAD = 25 * 1024 * 1024;
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml', 'application/pdf']);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD } });

function sessionUserId(req: express.Request): string | null {
  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  if (token) {
    const session = verifySession(token);
    if (session) return session.userId;
  }
  const qToken = typeof req.query.token === 'string' ? req.query.token : null;
  if (qToken) return verifyFileToken(qToken);
  return null;
}

export function createApp() {
  const app = express();
  app.use(express.json());

  app.post('/upload', upload.single('file'), async (req, res) => {
    const userId = sessionUserId(req);
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'no file' });
    if (!ALLOWED.has(file.mimetype)) return res.status(400).json({ error: 'unsupported type' });

    const id = makeId();
    await writeBlob(id, file.buffer, { name: file.originalname || id, mime: file.mimetype, size: file.size }, userId);
    res.json({ id, url: `/api/files/${id}`, name: file.originalname || id, mime: file.mimetype, size: file.size });
  });

  app.get('/:id', async (req, res) => {
    const userId = sessionUserId(req);
    if (!userId) return res.status(401).end();
    if (!isValidBlobId(req.params.id)) return res.status(400).end();
    const blob = await readBlob(req.params.id, userId);
    if (!blob) return res.status(404).end();
    res.set('Content-Type', blob.meta.mime);
    res.set('Content-Disposition', `inline; filename="${blob.meta.name.replace(/"/g, '')}"`);
    res.set('Cache-Control', 'private, max-age=31536000, immutable');
    res.send(blob.bytes);
  });

  app.delete('/:id', async (req, res) => {
    const userId = sessionUserId(req);
    if (!userId) return res.status(401).end();
    if (!isValidBlobId(req.params.id)) return res.status(400).end();
    await deleteBlob(req.params.id, userId);
    res.status(204).end();
  });

  app.post('/gc', async (req, res) => {
    const userId = sessionUserId(req);
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const referencedIds: string[] = Array.isArray(req.body?.referencedIds) ? req.body.referencedIds : [];
    const result = await sweepUnreferenced(new Set(referencedIds), userId);
    res.json(result);
  });

  return app;
}

if (process.env.NODE_ENV !== 'test') {
  createApp().listen(4003, () => console.log('files-service listening on 4003'));
}
```

- [ ] **Step 4: Write the server test**

```typescript
// services/files-service/src/server.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { signSession } from '@revision-app/shared';
import { createApp } from './server';

const app = createApp();
const token = signSession({ userId: 'user-1', username: 'alice', domain: 'civil-engineering' });

beforeEach(async () => {
  process.env.FILES_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'files-service-server-'));
});

describe('files-service HTTP API', () => {
  it('uploads and then fetches a file', async () => {
    const upload = await request(app)
      .post('/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('fake-png-bytes'), { filename: 'x.png', contentType: 'image/png' });
    expect(upload.status).toBe(200);
    const id = upload.body.id;

    const get = await request(app).get(`/${id}`).set('Authorization', `Bearer ${token}`);
    expect(get.status).toBe(200);
    expect(get.text).toBe('fake-png-bytes');
  });

  it('rejects upload without a valid session', async () => {
    const res = await request(app)
      .post('/upload')
      .attach('file', Buffer.from('x'), { filename: 'x.png', contentType: 'image/png' });
    expect(res.status).toBe(401);
  });

  it('gc deletes only unreferenced blobs the caller owns', async () => {
    const upload = await request(app)
      .post('/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('x'), { filename: 'x.png', contentType: 'image/png' });
    const gc = await request(app)
      .post('/gc')
      .set('Authorization', `Bearer ${token}`)
      .send({ referencedIds: [] });
    expect(gc.status).toBe(200);
    // Freshly uploaded blob is within the grace period, so it survives this sweep.
    expect(gc.body.deleted).toBe(0);
    void upload;
  });
});
```

- [ ] **Step 5: Delete the old frontend copies and run tests**

```bash
git rm apps/frontend/lib/repository/fileBlobStore.ts apps/frontend/lib/repository/fileBlobStore.test.ts \
       apps/frontend/lib/repository/gc.ts apps/frontend/lib/repository/gc.test.ts
npm test -w services/files-service
```

Expected: all files-service tests pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: implement files-service (upload/get/delete/gc)"
```

### Task 12: Turn `apps/frontend`'s `/api/files/*` routes into gateway proxies

**Files:**
- Modify: `apps/frontend/app/api/files/route.ts`, `apps/frontend/app/api/files/[id]/route.ts`, `apps/frontend/app/api/files/gc/route.ts`
- Modify: `apps/frontend/lib/files/uploadFile.ts` (import path only)

**Interfaces:** consumes `proxyRequest` from Task 8.

- [ ] **Step 1: Rewrite the upload and per-id routes as proxies**

```typescript
// apps/frontend/app/api/files/route.ts
import { proxyRequest } from '@/lib/serviceProxy';

const FILES_SERVICE_URL = process.env.FILES_SERVICE_URL ?? 'http://127.0.0.1:4003';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  return proxyRequest(req, `${FILES_SERVICE_URL}/upload`);
}
```

```typescript
// apps/frontend/app/api/files/[id]/route.ts
import { proxyRequest } from '@/lib/serviceProxy';

const FILES_SERVICE_URL = process.env.FILES_SERVICE_URL ?? 'http://127.0.0.1:4003';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyRequest(req, `${FILES_SERVICE_URL}/${id}`);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyRequest(req, `${FILES_SERVICE_URL}/${id}`);
}
```

- [ ] **Step 2: Rewrite the GC route — it still needs `AppData` to compute `referencedIds`, so it stays a real handler, not a pure proxy**

```typescript
// apps/frontend/app/api/files/gc/route.ts
import { referencedBlobIds, getSessionFromRequest } from '@revision-app/shared';
import { getAppData } from '@/lib/contentClient';
import { PROXY_TIMEOUT_MS } from '@/lib/serviceProxy';

const FILES_SERVICE_URL = process.env.FILES_SERVICE_URL ?? 'http://127.0.0.1:4003';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const session = getSessionFromRequest(req);
  if (!session) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const data = await getAppData(session.userId);
  const referencedIds = Array.from(referencedBlobIds(data));

  let upstream: Response;
  try {
    upstream = await fetch(`${FILES_SERVICE_URL}/gc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: req.headers.get('Authorization') ?? '' },
      body: JSON.stringify({ referencedIds }),
      signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
    });
  } catch {
    return Response.json({ error: 'files-service unavailable' }, { status: 502 });
  }
  return new Response(await upstream.text(), { status: upstream.status });
}
```

- [ ] **Step 3: Update `uploadFile.ts`'s import**

```typescript
// apps/frontend/lib/files/uploadFile.ts
import type { Attachment, AttachmentKind } from '@revision-app/shared';
import { authFetch } from '@/lib/auth/client';
```

- [ ] **Step 4: Delete the now-obsolete route tests superseded by `services/files-service/src/server.test.ts`**

```bash
git rm apps/frontend/app/api/files/gc/route.test.ts apps/frontend/app/api/files/\[id\]/route.test.ts
```

- [ ] **Step 5: Run both workspaces' tests**

```bash
npm test -w apps/frontend
npm test -w services/files-service
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: gateway proxies /api/files/* to files-service"
```

### Task 13: Wire `files-service` into Docker Compose and verify end-to-end

**Files:** Modify `docker-compose.yml`

- [ ] **Step 1: Add the `files-service` block with its own volume**

```yaml
  files-service:
    build:
      context: .
      dockerfile: services/files-service/Dockerfile
    container_name: revision_files_service
    environment:
      - SESSION_SECRET=${SESSION_SECRET}
      - FILES_DIR=/data/files
    volumes:
      - revision_files-data:/data/files
    restart: unless-stopped
```

Add to the `app` service's `environment`:

```yaml
      - FILES_SERVICE_URL=http://files-service:4003
```

Add `files-service` to `app`'s `depends_on`. Add to the `volumes:` section at the bottom:

```yaml
  revision_files-data:
    external: true
```

```bash
docker volume create revision_files-data
```

- [ ] **Step 2: Full stack up, upload/fetch/gc through the gateway**

```bash
docker compose up -d --build
TOKEN=$(curl -s -X POST http://127.0.0.1:3200/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"filetest","password":"password123","domain":"civil-engineering"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
curl -s -X POST http://127.0.0.1:3200/api/files \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@apps/frontend/public/favicon.ico;type=image/x-icon" 2>/dev/null || true
```

(adjust the sample file to any small image already in `apps/frontend/public/` if `favicon.ico` isn't present)

Expected: `200` with `{ id, url, name, mime, size }`.

- [ ] **Step 3: Tear down and commit**

```bash
docker compose down
git add -A
git commit -m "chore: wire files-service into docker-compose"
```

---

## Phase 4: Extract `content-service`

### Task 14: Scaffold `services/content-service` with its own Postgres database

**Files:**
- Create: `services/content-service/package.json`, `tsconfig.json`, `Dockerfile`, `src/db.ts`
- Create: `services/content-service/db/migrations/0001_init.sql`
- Create: `db/init/003-content-databases.sql`
- Modify: `packages/shared/src/schema.ts` (new — zod validation for `AppData`)
- Modify: `packages/shared/src/index.ts`, `packages/shared/package.json` (add `zod` dependency)

- [ ] **Step 1: Package, TS config, Dockerfile — identical pattern to Task 6, service name `content-service`, port 4002**

```json
// services/content-service/package.json
{
  "name": "content-service",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "start": "tsx src/server.ts",
    "test": "vitest run",
    "db:migrate": "node ../../scripts/migrate.mjs"
  },
  "dependencies": {
    "@revision-app/shared": "*",
    "express": "^4.21.0",
    "pg": "^8.22.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/supertest": "^6.0.2",
    "supertest": "^7.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5",
    "vitest": "^3.2.7"
  }
}
```

```json
// services/content-service/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "strict": true, "esModuleInterop": true, "skipLibCheck": true, "noEmit": true
  },
  "include": ["src"]
}
```

```dockerfile
# syntax=docker/dockerfile:1
FROM node:20-slim
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY services/content-service/package.json services/content-service/package.json
RUN npm ci
COPY packages/shared packages/shared
COPY services/content-service services/content-service
WORKDIR /repo/services/content-service
EXPOSE 4002
CMD ["npm", "start"]
```

```typescript
// services/content-service/src/db.ts
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

- [ ] **Step 2: Migration — `app_data` with no cross-database foreign key (the `users` table now lives in `revision_auth`)**

```sql
-- services/content-service/db/migrations/0001_init.sql
CREATE TABLE app_data (
  user_id uuid PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

```sql
-- db/init/003-content-databases.sql
CREATE DATABASE revision_content;
CREATE DATABASE revision_content_test;
```

- [ ] **Step 3: Add a zod `AppData` schema to `packages/shared`**

```bash
npm install zod -w packages/shared
```

```typescript
// packages/shared/src/schema.ts
import { z } from 'zod';

const revisionSchema = z.object({ id: z.string(), timestamp: z.number() });
const attachmentSchema = z.object({
  id: z.string(), name: z.string(), kind: z.enum(['image', 'pdf', 'link', 'video']),
  url: z.string(), mime: z.string().optional(), size: z.number().optional(), createdAt: z.number(),
});
const flashcardSchema = z.object({ id: z.string(), front: z.string(), back: z.string(), createdAt: z.number() });
const topicSchema = z.object({
  id: z.string(), chapterId: z.string(), title: z.string(), notes: z.string(), order: z.number(),
  difficulty: z.enum(['Easy', 'Medium', 'Hard']), priority: z.enum(['Low', 'Medium', 'High']),
  revisionHistory: z.array(revisionSchema), createdAt: z.number(), updatedAt: z.number(),
  archivedAt: z.number().optional(), attachments: z.array(attachmentSchema).optional(),
  flashcards: z.array(flashcardSchema).optional(), bookmarkedAt: z.number().optional(),
  tagIds: z.array(z.string()).optional(),
});
const chapterSchema = z.object({
  id: z.string(), subjectId: z.string(), name: z.string(), order: z.number(),
  difficulty: z.enum(['Easy', 'Medium', 'Hard']), priority: z.enum(['Low', 'Medium', 'High']),
  topicIds: z.array(z.string()), archivedAt: z.number().optional(),
});
const subjectSchema = z.object({
  id: z.string(), name: z.string(), color: z.string(), icon: z.string(), order: z.number(),
  chapterIds: z.array(z.string()), archivedAt: z.number().optional(),
});
const tagSchema = z.object({
  id: z.string(), name: z.string(), color: z.string(), icon: z.string(),
  description: z.string().optional(), order: z.number(),
});

export const appDataSchema = z.object({
  subjects: z.record(z.string(), subjectSchema),
  chapters: z.record(z.string(), chapterSchema),
  topics: z.record(z.string(), topicSchema),
  subjectOrder: z.array(z.string()),
  tags: z.record(z.string(), tagSchema),
  tagOrder: z.array(z.string()),
});
```

Add `export * from './schema';` to `packages/shared/src/index.ts`.

- [ ] **Step 4: Install and commit**

```bash
npm install
git add -A
git commit -m "chore: scaffold services/content-service and its Postgres database, add AppData zod schema"
```

### Task 15: Implement `content-service`'s HTTP API

**Files:**
- Create: `services/content-service/src/appDataStore.ts`
- Create: `services/content-service/src/appDataStore.test.ts`
- Create: `services/content-service/src/server.ts`
- Create: `services/content-service/src/server.test.ts`

**Interfaces:**
- Produces: `GET /app-data` (bearer), `PUT /app-data` (bearer, zod-validated JSON body) — response shapes identical to the current `GET`/`PUT /api/data`.

- [ ] **Step 1: Data store**

```typescript
// services/content-service/src/appDataStore.ts
import type { AppData } from '@revision-app/shared';
import { getPool } from './db';

export async function readData(userId: string): Promise<AppData | null> {
  const { rows } = await getPool().query<{ data: AppData }>(
    'SELECT data FROM app_data WHERE user_id = $1',
    [userId],
  );
  return rows[0]?.data ?? null;
}

export async function writeData(userId: string, data: AppData): Promise<void> {
  await getPool().query(
    `INSERT INTO app_data (user_id, data, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
    [userId, JSON.stringify(data)],
  );
}
```

```typescript
// services/content-service/src/appDataStore.test.ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getPool } from './db';
import { readData, writeData } from './appDataStore';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const sample = { subjects: {}, chapters: {}, topics: {}, subjectOrder: [], tags: {}, tagOrder: [] };

beforeEach(async () => {
  await getPool().query('TRUNCATE app_data');
});

afterAll(async () => {
  await getPool().end();
});

describe('appDataStore', () => {
  it('returns null before anything is written', async () => {
    expect(await readData(USER_ID)).toBeNull();
  });

  it('round-trips written data', async () => {
    await writeData(USER_ID, sample);
    expect(await readData(USER_ID)).toEqual(sample);
  });
});
```

- [ ] **Step 2: Server, with a small seed-on-first-load helper moved alongside it**

```typescript
// services/content-service/src/server.ts
import express from 'express';
import { verifySession, appDataSchema } from '@revision-app/shared';
import { readData, writeData } from './appDataStore';

function sessionUserId(req: express.Request): { userId: string; domain: string } | null {
  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  if (!token) return null;
  const session = verifySession(token);
  return session ? { userId: session.userId, domain: session.domain } : null;
}

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  app.get('/app-data', async (req, res) => {
    const session = sessionUserId(req);
    if (!session) return res.status(401).json({ error: 'Not authenticated' });
    const data = await readData(session.userId);
    if (!data) return res.status(404).json({ error: 'No data yet' });
    res.json(data);
  });

  app.put('/app-data', async (req, res) => {
    const session = sessionUserId(req);
    if (!session) return res.status(401).json({ error: 'Not authenticated' });
    const parsed = appDataSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid AppData', issues: parsed.error.issues });
    }
    await writeData(session.userId, parsed.data);
    res.status(204).end();
  });

  return app;
}

if (process.env.NODE_ENV !== 'test') {
  createApp().listen(4002, () => console.log('content-service listening on 4002'));
}
```

Note: `GET /app-data` now returns `404` rather than seeding — seeding needs `seedDataForDomain`, which is UI-domain-specific presentation data. That responsibility stays in the gateway (Task 16), which seeds and calls `PUT` on first load instead of content-service seeding itself.

- [ ] **Step 3: Server test**

```typescript
// services/content-service/src/server.test.ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { signSession } from '@revision-app/shared';
import { getPool } from './db';
import { createApp } from './server';

const app = createApp();
const token = signSession({ userId: '11111111-1111-1111-1111-111111111111', username: 'alice', domain: 'civil-engineering' });
const sample = { subjects: {}, chapters: {}, topics: {}, subjectOrder: [], tags: {}, tagOrder: [] };

beforeEach(async () => {
  await getPool().query('TRUNCATE app_data');
});

afterAll(async () => {
  await getPool().end();
});

describe('content-service HTTP API', () => {
  it('404s before anything is written', async () => {
    const res = await request(app).get('/app-data').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('round-trips data through PUT then GET', async () => {
    const put = await request(app).put('/app-data').set('Authorization', `Bearer ${token}`).send(sample);
    expect(put.status).toBe(204);
    const get = await request(app).get('/app-data').set('Authorization', `Bearer ${token}`);
    expect(get.status).toBe(200);
    expect(get.body).toEqual(sample);
  });

  it('rejects a malformed body', async () => {
    const res = await request(app).put('/app-data').set('Authorization', `Bearer ${token}`).send({ nonsense: true });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 4: Run tests**

```bash
export DATABASE_URL=postgres://revision:changeme@127.0.0.1:5433/revision_content_test
export SESSION_SECRET=dev-secret-change-me
npm test -w services/content-service
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: implement content-service (GET/PUT app-data with zod validation)"
```

### Task 16: Point the gateway's data routes at `content-service`; retire `revision_app`

**Files:**
- Modify: `apps/frontend/lib/contentClient.ts`
- Modify: `apps/frontend/app/api/data/route.ts`
- Delete: `apps/frontend/lib/repository/fileStore.ts`, `apps/frontend/lib/repository/fileStore.test.ts`

**Interfaces:** `getAppData`/`putAppData` signatures unchanged — only their implementation moves from a local DB call to an HTTP call.

- [ ] **Step 1: Repoint `contentClient` at `content-service` over HTTP**

```typescript
// apps/frontend/lib/contentClient.ts
import type { AppData } from '@revision-app/shared';
import { PROXY_TIMEOUT_MS } from '@/lib/serviceProxy';

const CONTENT_SERVICE_URL = process.env.CONTENT_SERVICE_URL ?? 'http://127.0.0.1:4002';

// Thrown on a network failure/timeout talking to content-service, so callers
// (the API routes) can turn it into a clean 502/504 instead of a hang or a
// raw 500 with a leaked stack trace.
export class ContentServiceError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function callContentService(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`${CONTENT_SERVICE_URL}${path}`, { ...init, signal: AbortSignal.timeout(PROXY_TIMEOUT_MS) });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError';
    throw new ContentServiceError(timedOut ? 504 : 502, 'content-service unavailable');
  }
}

export async function getAppData(userId: string, authHeader: string): Promise<AppData | null> {
  const res = await callContentService('/app-data', { headers: { Authorization: authHeader } });
  if (res.status === 404) return null;
  if (!res.ok) throw new ContentServiceError(res.status, `content-service GET failed: ${res.status}`);
  return res.json();
}

export async function putAppData(data: AppData, authHeader: string): Promise<void> {
  const res = await callContentService('/app-data', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new ContentServiceError(res.status, `content-service PUT failed: ${res.status}`);
}
```

(the signature drops `userId` as a first-class arg in favor of forwarding the caller's `authHeader` — content-service derives the user from the token itself, same as every other service; callers already have the header)

- [ ] **Step 2: Update `/api/data` and `/api/files/gc` to pass the header through**

```typescript
// apps/frontend/app/api/data/route.ts
import type { NextRequest } from 'next/server';
import type { AppData } from '@revision-app/shared';
import { getAppData, putAppData, ContentServiceError } from '@/lib/contentClient';
import { getSessionFromRequest } from '@revision-app/shared';
import { seedDataForDomain } from '@/lib/repository/seed';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const authHeader = req.headers.get('Authorization') ?? '';
  try {
    const data = await getAppData(session.userId, authHeader);
    if (!data) {
      const seeded = seedDataForDomain(session.domain);
      await putAppData(seeded, authHeader);
      return Response.json(seeded);
    }
    return Response.json(data);
  } catch (err) {
    if (err instanceof ContentServiceError) return Response.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

export async function PUT(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const authHeader = req.headers.get('Authorization') ?? '';
  const body = (await req.json()) as AppData;
  try {
    await putAppData(body, authHeader);
    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof ContentServiceError) return Response.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
```

```typescript
// apps/frontend/app/api/files/gc/route.ts
import { referencedBlobIds, getSessionFromRequest } from '@revision-app/shared';
import { getAppData, ContentServiceError } from '@/lib/contentClient';
import { PROXY_TIMEOUT_MS } from '@/lib/serviceProxy';

const FILES_SERVICE_URL = process.env.FILES_SERVICE_URL ?? 'http://127.0.0.1:4003';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const session = getSessionFromRequest(req);
  if (!session) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const authHeader = req.headers.get('Authorization') ?? '';
  let data;
  try {
    data = await getAppData(session.userId, authHeader);
  } catch (err) {
    if (err instanceof ContentServiceError) return Response.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const referencedIds = Array.from(referencedBlobIds(data));

  let upstream: Response;
  try {
    upstream = await fetch(`${FILES_SERVICE_URL}/gc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({ referencedIds }),
      signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
    });
  } catch {
    return Response.json({ error: 'files-service unavailable' }, { status: 502 });
  }
  return new Response(await upstream.text(), { status: upstream.status });
}
```

- [ ] **Step 3: Remove the local DB-backed store and its dependency on `lib/db/pool.ts`**

```bash
git rm apps/frontend/lib/repository/fileStore.ts apps/frontend/lib/repository/fileStore.test.ts
git rm -r apps/frontend/lib/db
```

Confirm nothing else in `apps/frontend` imports `lib/db/pool`:

```bash
grep -rl "lib/db/pool" apps/frontend || echo "clean"
```

- [ ] **Step 4: One-off data migration — copy existing `app_data` rows from `revision_app` into `revision_content`**

```bash
docker compose exec db psql -U revision -d revision_app -c \
  "\copy (SELECT user_id, data, updated_at FROM app_data) TO '/tmp/app_data.csv' CSV"
docker compose exec db psql -U revision -d revision_content -c \
  "\copy app_data (user_id, data, updated_at) FROM '/tmp/app_data.csv' CSV"
```

- [ ] **Step 5: Run tests, then drop the now-unused `revision_app` database**

```bash
npm test -w apps/frontend
docker compose exec db psql -U revision -d postgres -c "DROP DATABASE revision_app;"
docker compose exec db psql -U revision -d postgres -c "DROP DATABASE revision_app_test;"
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: gateway data routes call content-service; retire the shared revision_app database"
```

### Task 17: Wire `content-service` into Docker Compose and verify end-to-end

**Files:** Modify `docker-compose.yml`

- [ ] **Step 1: Add the `content-service` block**

```yaml
  content-service:
    build:
      context: .
      dockerfile: services/content-service/Dockerfile
    container_name: revision_content_service
    environment:
      - DATABASE_URL=postgres://revision:${POSTGRES_PASSWORD}@db:5432/revision_content
      - SESSION_SECRET=${SESSION_SECRET}
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped
```

Add to the `app` service's `environment`:

```yaml
      - CONTENT_SERVICE_URL=http://content-service:4002
```

Add `content-service` to `app`'s `depends_on`. Remove the now-unused `DATABASE_URL` from the `app` service's own environment (the gateway no longer talks to Postgres directly) and drop the `revision_app-data` volume mount from `app` (blob storage moved to `files-service`'s `revision_files-data` volume in Task 13; `app` has no server-local disk data left).

- [ ] **Step 2: Full stack up, full flow through the gateway**

```bash
docker compose up -d --build
TOKEN=$(curl -s -X POST http://127.0.0.1:3200/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"fulltest","password":"password123","domain":"civil-engineering"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
curl -s http://127.0.0.1:3200/api/data -H "Authorization: Bearer $TOKEN"
```

Expected: `200` with a freshly seeded `AppData` object, proving `app` → `content-service` → `revision_content` works end to end.

- [ ] **Step 3: Tear down and commit**

```bash
docker compose down
git add -A
git commit -m "chore: wire content-service into docker-compose"
```

---

## Phase 5: Team Ownership & Cross-Service Verification

### Task 18: Add CODEOWNERS and per-workspace CI scoping

**Files:**
- Create: `.github/CODEOWNERS`
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: CODEOWNERS**

```
# .github/CODEOWNERS
# packages/shared is the one real coupling point between services — both
# owners must review changes there.
/packages/shared/          @person-a @person-b
/services/auth-service/    @person-a
/services/files-service/   @person-a
/services/content-service/ @person-b
/apps/frontend/            @person-b
```

(replace `@person-a`/`@person-b` with the actual GitHub usernames)

- [ ] **Step 2: CI workflow, scoped per workspace by changed paths**

```yaml
# .github/workflows/ci.yml
name: CI
on: [pull_request]
jobs:
  changes:
    runs-on: ubuntu-latest
    outputs:
      frontend: ${{ steps.filter.outputs.frontend }}
      auth: ${{ steps.filter.outputs.auth }}
      content: ${{ steps.filter.outputs.content }}
      files: ${{ steps.filter.outputs.files }}
      shared: ${{ steps.filter.outputs.shared }}
    steps:
      - uses: actions/checkout@v4
      - uses: dorny/paths-filter@v3
        id: filter
        with:
          filters: |
            frontend: ['apps/frontend/**']
            auth: ['services/auth-service/**']
            content: ['services/content-service/**']
            files: ['services/files-service/**']
            shared: ['packages/shared/**']

  test:
    needs: changes
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: revision
          POSTGRES_PASSWORD: changeme
          POSTGRES_DB: revision_test
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready --health-interval 5s --health-timeout 3s --health-retries 5
    strategy:
      matrix:
        include:
          - workspace: apps/frontend
            condition: frontend
          - workspace: services/auth-service
            condition: auth
          - workspace: services/content-service
            condition: content
          - workspace: services/files-service
            condition: files
          - workspace: packages/shared
            condition: shared
    steps:
      - uses: actions/checkout@v4
      - if: needs.changes.outputs[matrix.condition] == 'true' || needs.changes.outputs.shared == 'true'
        uses: actions/setup-node@v4
        with:
          node-version: 20
      - if: needs.changes.outputs[matrix.condition] == 'true' || needs.changes.outputs.shared == 'true'
        run: npm ci
      - if: needs.changes.outputs[matrix.condition] == 'true' || needs.changes.outputs.shared == 'true'
        run: npm test -w ${{ matrix.workspace }}
        env:
          DATABASE_URL: postgres://revision:changeme@localhost:5432/revision_test
          SESSION_SECRET: ci-secret
```

(a change under `packages/shared` runs every workspace's tests, since it's the one thing all services depend on — matches the CODEOWNERS review requirement)

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: add CODEOWNERS and per-workspace CI scoping"
```

### Task 19: Root-level Docker Compose integration/smoke test

**Files:**
- Create: `scripts/smoke-test.mjs`
- Modify: root `package.json` (add a `smoke-test` script)

**Interfaces:** none — this is the final cross-service verification the whole plan builds toward.

- [ ] **Step 1: Write the smoke test script**

```javascript
// scripts/smoke-test.mjs
// Drives register -> login -> create a topic -> upload a file through the
// live gateway, against whatever docker-compose stack is currently up.
// This is what catches contract drift between services that per-service
// unit tests can't see.
const BASE = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3200';

async function main() {
  const username = `smoke_${Date.now()}`;

  const register = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'password123', domain: 'civil-engineering' }),
  });
  if (register.status !== 201) throw new Error(`register failed: ${register.status}`);
  const { token } = await register.json();

  const getData = await fetch(`${BASE}/api/data`, { headers: { Authorization: `Bearer ${token}` } });
  if (getData.status !== 200) throw new Error(`GET /api/data failed: ${getData.status}`);
  const appData = await getData.json();

  const subjectId = appData.subjectOrder[0];
  const chapterId = appData.subjects[subjectId].chapterIds[0];
  const topicId = crypto.randomUUID();
  appData.topics[topicId] = {
    id: topicId, chapterId, title: 'Smoke test topic', notes: '', order: 999,
    difficulty: 'Easy', priority: 'Low', revisionHistory: [], createdAt: Date.now(), updatedAt: Date.now(),
  };
  appData.chapters[chapterId].topicIds.push(topicId);

  const putData = await fetch(`${BASE}/api/data`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(appData),
  });
  if (putData.status !== 204) throw new Error(`PUT /api/data failed: ${putData.status}`);

  const form = new FormData();
  form.append('file', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }), 'smoke.png');
  const upload = await fetch(`${BASE}/api/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (upload.status !== 200) throw new Error(`upload failed: ${upload.status}`);

  console.log('smoke test passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Add the root script**

```json
// package.json — add to "scripts"
"scripts": {
  "smoke-test": "node scripts/smoke-test.mjs"
}
```

- [ ] **Step 3: Run it against the live stack**

```bash
docker compose up -d --build
npm run smoke-test
```

Expected: `smoke test passed` printed, exit code 0.

- [ ] **Step 4: Tear down and commit**

```bash
docker compose down
git add -A
git commit -m "test: add cross-service docker-compose smoke test"
```

---

## Post-Plan State

At the end of this plan: four independently buildable/deployable/testable workspaces (`apps/frontend`, `services/auth-service`, `services/content-service`, `services/files-service`), a shared types/session package neither backend service can bypass, three Postgres databases each owned by exactly one service, CODEOWNERS-enforced review boundaries, per-workspace CI, and one smoke test proving the whole stack still works together.
