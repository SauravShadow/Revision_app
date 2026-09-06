# AI Flashcard Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a student generate flashcards from a topic's notes with one tap, review them before saving, and have self-graded quiz results nudge the revision schedule.

**Architecture:** A new `ai-service` (4th Node service, port 4004) owns the LLM provider key, a per-user daily quota, and a usage log. The Next.js frontend proxies to it through an API route, shows generated cards in a review step, and commits only accepted cards through the existing content-service path. Grading is self-graded in the browser — no LLM call.

**Tech Stack:** Node 20, TypeScript (strict, ESM), Express 4, `pg` 8, zod 3, vitest 3 + supertest 7, Postgres 16, Gemini `gemini-2.5-flash` via REST.

**Spec:** `docs/superpowers/specs/2026-09-04-ai-flashcard-generation-design.md`

## Global Constraints

- Node 20 (`node:20-slim` base image), ESM only (`"type": "module"` in every service package.json).
- TypeScript strict, `target: ES2022`, `module: ESNext`, `moduleResolution: Bundler`, `noEmit: true`.
- Dependency versions must match the existing services: `express@^4.21.0`, `pg@^8.22.0`, `zod@^3.25.76`, `vitest@^3.2.7`, `supertest@^7.0.0`, `tsx@^4.19.0`.
- ai-service listens on **4004**; database is **`revision_ai`**; migrations live at `services/ai-service/db/migrations/`.
- Provider key env var is **`GEMINI_API_KEY_REVISION`** — a *separate* Google Cloud project from NEXUS's `GEMINI_API_KEY`. Never reuse NEXUS's key.
- Model id: **`gemini-2.5-flash`**.
- `AI_DAILY_QUOTA` defaults to **10** when unset.
- Services export `createApp()` and guard `listen()` with `if (process.env.NODE_ENV !== 'test')`.
- Service tests run against a real Postgres via `TEST_DATABASE_URL`, truncating tables in `beforeEach` and calling `getPool().end()` in `afterAll`.
- ai-service must **never** read or write `app_data`. It receives notes in the request and returns cards; the frontend commits accepted cards via the existing content-service path.
- User-facing errors never leak provider messages or stack traces.

---

### Task 1: Score-weighted scheduling in `@revision-app/shared`

**Files:**
- Modify: `packages/shared/src/types.ts` (add `Flashcard.source`, `Revision.score`)
- Modify: `packages/shared/src/revision.ts` (add `scoreFactor`, weight `suggestedNextDate`)
- Test: `packages/shared/src/revision.test.ts` (append)

**Interfaces:**
- Consumes: nothing (first task)
- Produces:
  - `Flashcard.source?: 'manual' | 'generated'`
  - `Revision.score?: { correct: number; total: number }`
  - `scoreFactor(score?: { correct: number; total: number }): number`
  - `suggestedNextDate(h: Revision[]): number | undefined` (unchanged signature, new behaviour)

- [ ] **Step 1: Write the failing test**

Append to `packages/shared/src/revision.test.ts`:

```ts
import { scoreFactor, suggestedNextDate, DAY_MS } from './revision';

describe('scoreFactor', () => {
  it('returns 1 when there is no score', () => {
    expect(scoreFactor(undefined)).toBe(1);
  });
  it('returns 1 for a solid score', () => {
    expect(scoreFactor({ correct: 9, total: 10 })).toBe(1);
  });
  it('halves the interval for a shaky score', () => {
    expect(scoreFactor({ correct: 6, total: 10 })).toBe(0.5);
  });
  it('quarters the interval for a weak score', () => {
    expect(scoreFactor({ correct: 2, total: 10 })).toBe(0.25);
  });
  it('returns 1 for an empty session rather than dividing by zero', () => {
    expect(scoreFactor({ correct: 0, total: 0 })).toBe(1);
  });
});

describe('suggestedNextDate with scores', () => {
  const last = 1_700_000_000_000;

  it('is unchanged when the last revision has no score', () => {
    const h = [{ id: 'r1', timestamp: last }];
    expect(suggestedNextDate(h)).toBe(last + 1 * DAY_MS);
  });

  it('pulls the suggestion earlier after a weak score', () => {
    const h = [{ id: 'r1', timestamp: last, score: { correct: 2, total: 10 } }];
    // 1-day base interval * 0.25 => floored to the 1-day minimum
    expect(suggestedNextDate(h)).toBe(last + 1 * DAY_MS);
  });

  it('halves a longer interval after a shaky score', () => {
    const h = [
      { id: 'r1', timestamp: last - 3 * DAY_MS },
      { id: 'r2', timestamp: last - 2 * DAY_MS },
      { id: 'r3', timestamp: last, score: { correct: 5, total: 10 } },
    ];
    // 3 revisions => nextInterval(3) = 7 days; * 0.5 => 3.5 => 3 days
    expect(suggestedNextDate(h)).toBe(last + 3 * DAY_MS);
  });

  it('never suggests less than one day out', () => {
    const h = [{ id: 'r1', timestamp: last, score: { correct: 0, total: 20 } }];
    expect(suggestedNextDate(h)).toBe(last + 1 * DAY_MS);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/shared && npx vitest run src/revision.test.ts`
Expected: FAIL — `scoreFactor is not a function`, and the score cases return unweighted dates.

- [ ] **Step 3: Add the optional type fields**

In `packages/shared/src/types.ts`, change `Flashcard` and `Revision` to:

```ts
export interface Revision {
  id: string;
  timestamp: number; // epoch ms
  /** Self-graded quiz result for this session. Absent = ungraded revision. */
  score?: { correct: number; total: number };
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  createdAt: number;
  /** Absent = legacy hand-written card. */
  source?: 'manual' | 'generated';
}
```

Leave every other field untouched. Both additions are optional, so no existing snapshot needs backfilling.

- [ ] **Step 4: Implement the weighting**

In `packages/shared/src/revision.ts`, add `scoreFactor` directly below `nextInterval`, and replace `suggestedNextDate`:

```ts
/**
 * How much to shorten the next suggested interval based on the last quiz
 * result. 1 = no change. Absent or empty scores never shorten.
 */
export function scoreFactor(score?: { correct: number; total: number }): number {
  if (!score || score.total <= 0) return 1;
  const ratio = score.correct / score.total;
  if (ratio >= 0.8) return 1;
  if (ratio >= 0.5) return 0.5;
  return 0.25;
}

// The old ladder-derived date, demoted to a suggestion for the plan-next UI.
// A weak self-graded quiz score pulls the suggestion earlier; it never pushes
// it later, and never suggests less than one day out.
export function suggestedNextDate(h: Revision[]): number | undefined {
  const last = lastRevisedAt(h);
  if (last === undefined) return undefined;
  const base = nextInterval(h.length);
  const days = Math.max(1, Math.floor(base * scoreFactor(h[h.length - 1].score)));
  return last + days * DAY_MS;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/shared && npx vitest run`
Expected: PASS, including the pre-existing revision tests (the no-score path is unchanged).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/types.ts packages/shared/src/revision.ts packages/shared/src/revision.test.ts
git commit -m "feat(shared): score-weighted revision suggestions

Adds optional Flashcard.source and Revision.score, and lets a weak
self-graded quiz score pull the suggested next date earlier. Both fields
are optional so no app_data snapshot needs backfilling, and the
no-score path is byte-identical to before."
```

---

### Task 2: ai-service skeleton

**Files:**
- Create: `services/ai-service/package.json`
- Create: `services/ai-service/tsconfig.json`
- Create: `services/ai-service/Dockerfile`
- Create: `services/ai-service/src/db.ts`
- Create: `services/ai-service/src/session.ts`
- Create: `services/ai-service/src/server.ts`
- Create: `services/ai-service/db/migrations/0001_init.sql`
- Test: `services/ai-service/src/server.test.ts`
- Modify: `docker-compose.yml` (add `ai-service`)
- Modify: `.env.example` (add the new variables)

**Interfaces:**
- Consumes: `verifySession`, `signSession` from `@revision-app/shared/server`
- Produces:
  - `createApp(): express.Express`
  - `getPool(): Pool`
  - `sessionUserId(req): { userId: string; domain: string } | null`
  - `GET /health` → `200 {"ok":true}`

- [ ] **Step 1: Write the failing test**

Create `services/ai-service/src/server.test.ts`:

```ts
import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { signSession } from '@revision-app/shared/server';
import { getPool } from './db';
import { createApp } from './server';

const app = createApp();
const token = signSession({
  userId: '11111111-1111-1111-1111-111111111111',
  username: 'alice',
  domain: 'civil-engineering',
});

afterAll(async () => {
  await getPool().end();
});

describe('ai-service HTTP API', () => {
  it('reports health without a session', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('401s an unauthenticated request to a guarded route', async () => {
    const res = await request(app).get('/quota');
    expect(res.status).toBe(401);
  });

  it('accepts a valid session on a guarded route', async () => {
    const res = await request(app).get('/quota').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/ai-service && npx vitest run`
Expected: FAIL — the package and `./server` do not exist yet.

- [ ] **Step 3: Create the package files**

`services/ai-service/package.json`:

```json
{
  "name": "ai-service",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "start": "tsx src/server.ts",
    "test": "vitest run --no-file-parallelism",
    "db:migrate": "node ../../scripts/migrate.mjs"
  },
  "dependencies": {
    "@revision-app/shared": "*",
    "express": "^4.21.0",
    "pg": "^8.22.0",
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/pg": "^8.20.0",
    "@types/supertest": "^6.0.2",
    "supertest": "^7.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5",
    "vitest": "^3.2.7"
  }
}
```

`services/ai-service/tsconfig.json` (identical to content-service's):

```json
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

`services/ai-service/Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1
FROM node:20-slim
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY services/ai-service/package.json services/ai-service/package.json
RUN npm ci
COPY packages/shared packages/shared
COPY services/ai-service services/ai-service
COPY scripts scripts
WORKDIR /repo/services/ai-service
EXPOSE 4004
CMD ["sh", "-c", "npm run db:migrate && npm start"]
```

- [ ] **Step 4: Create the migration**

`services/ai-service/db/migrations/0001_init.sql`:

```sql
CREATE TABLE ai_quota (
  user_id uuid NOT NULL,
  day     date NOT NULL,
  used    int  NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

CREATE TABLE ai_usage (
  id             bigserial   PRIMARY KEY,
  user_id        uuid        NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  provider       text        NOT NULL,
  model          text        NOT NULL,
  operation      text        NOT NULL,
  input_tokens   int,
  output_tokens  int,
  latency_ms     int,
  outcome        text        NOT NULL,
  cards_proposed int,
  cards_kept     int
);

CREATE INDEX ai_usage_user_time ON ai_usage (user_id, created_at DESC);
```

- [ ] **Step 5: Create db.ts and session.ts**

`services/ai-service/src/db.ts` (identical to content-service's):

```ts
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

`services/ai-service/src/session.ts` (identical to content-service's):

```ts
import type express from 'express';
import { verifySession } from '@revision-app/shared/server';

export function sessionUserId(req: express.Request): { userId: string; domain: string } | null {
  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  if (!token) return null;
  const session = verifySession(token);
  return session ? { userId: session.userId, domain: session.domain } : null;
}
```

- [ ] **Step 6: Create server.ts**

`services/ai-service/src/server.ts`:

```ts
import express from 'express';
import { sessionUserId } from './session';

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '256kb' }));

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.get('/quota', (req, res) => {
    const session = sessionUserId(req);
    if (!session) return res.status(401).json({ error: 'Not authenticated' });
    return res.json({ ok: true });
  });

  return app;
}

if (process.env.NODE_ENV !== 'test') {
  createApp().listen(4004, () => console.log('ai-service listening on 4004'));
}
```

The 256kb body limit is deliberate — a topic's notes are the only payload, and a smaller cap than content-service's 5mb keeps a malformed request from tying up the provider path.

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd services/ai-service && npm install && TEST_DATABASE_URL=$TEST_DATABASE_URL npm test`
Expected: PASS — 3 tests.

- [ ] **Step 8: Wire compose and env**

Add to `docker-compose.yml`, mirroring the `content-service` block:

```yaml
  ai-service:
    build:
      context: .
      dockerfile: services/ai-service/Dockerfile
    container_name: revision_ai_service
    environment:
      - DATABASE_URL=postgres://revision:${POSTGRES_PASSWORD}@db:5432/revision_ai
      - SESSION_SECRET=${SESSION_SECRET}
      - SERVICE_SECRET=${SERVICE_SECRET}
      - GEMINI_API_KEY_REVISION=${GEMINI_API_KEY_REVISION}
      - AI_DAILY_QUOTA=${AI_DAILY_QUOTA:-10}
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped
```

Add `AI_SERVICE_URL=http://ai-service:4004` to the `app` service's `environment` list, and add `ai-service: {condition: service_started}` to the `app` service's `depends_on`.

Append to `.env.example`:

```
# AI flashcard generation — SEPARATE Google Cloud project from NEXUS's GEMINI_API_KEY,
# because Gemini free-tier limits are per-project and NEXUS already consumes them.
GEMINI_API_KEY_REVISION=
AI_DAILY_QUOTA=10
```

The `revision_ai` database must exist before the container starts. Add it the same way the other databases are created for this project — check `db/` init scripts and follow whatever pattern created `revision_auth` and `revision_content`.

- [ ] **Step 9: Commit**

```bash
git add services/ai-service docker-compose.yml .env.example
git commit -m "feat(ai-service): service skeleton with health and session auth

Fourth Node service on 4004 with its own revision_ai database, following
the existing auth/content/files split so the provider key and quota
schema stay isolated from user content."
```

---

### Task 3: Per-user daily quota and provider circuit breaker

**Files:**
- Create: `services/ai-service/src/quota.ts`
- Create: `services/ai-service/src/breaker.ts`
- Modify: `services/ai-service/src/server.ts` (real `/quota` route)
- Test: `services/ai-service/src/quota.test.ts`
- Test: `services/ai-service/src/breaker.test.ts`

**Interfaces:**
- Consumes: `getPool()` from Task 2
- Produces:
  - `dailyLimit(): number`
  - `readQuota(userId: string, today: string): Promise<{ used: number; limit: number; remaining: number }>`
  - `consumeQuota(userId: string, today: string): Promise<boolean>` — `true` if consumed, `false` if already at the limit
  - `todayUtc(now?: number): string` — `YYYY-MM-DD`
  - `isOpen(now?: number): boolean` — `true` while the breaker is tripped
  - `trip(now?: number): void` — open the breaker for the cool-off window
  - `reset(): void` — close it (used by tests)

- [ ] **Step 1: Write the failing test**

Create `services/ai-service/src/quota.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getPool } from './db';
import { consumeQuota, readQuota, todayUtc, dailyLimit } from './quota';

const USER = '22222222-2222-2222-2222-222222222222';
const DAY = '2026-09-04';

beforeEach(async () => {
  await getPool().query('TRUNCATE ai_quota');
  process.env.AI_DAILY_QUOTA = '3';
});

afterAll(async () => {
  await getPool().end();
});

describe('quota', () => {
  it('defaults the limit to 10 when unset', () => {
    delete process.env.AI_DAILY_QUOTA;
    expect(dailyLimit()).toBe(10);
  });

  it('starts a fresh user at zero used', async () => {
    expect(await readQuota(USER, DAY)).toEqual({ used: 0, limit: 3, remaining: 3 });
  });

  it('consumes up to the limit then refuses', async () => {
    expect(await consumeQuota(USER, DAY)).toBe(true);
    expect(await consumeQuota(USER, DAY)).toBe(true);
    expect(await consumeQuota(USER, DAY)).toBe(true);
    expect(await consumeQuota(USER, DAY)).toBe(false);
    expect(await readQuota(USER, DAY)).toEqual({ used: 3, limit: 3, remaining: 0 });
  });

  it('tracks days independently', async () => {
    await consumeQuota(USER, DAY);
    await consumeQuota(USER, DAY);
    await consumeQuota(USER, DAY);
    expect(await consumeQuota(USER, '2026-09-05')).toBe(true);
  });

  it('formats today as YYYY-MM-DD in UTC', () => {
    expect(todayUtc(Date.UTC(2026, 8, 4, 23, 30))).toBe('2026-09-04');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/ai-service && npx vitest run src/quota.test.ts`
Expected: FAIL — `Cannot find module './quota'`.

- [ ] **Step 3: Implement quota.ts**

```ts
import { getPool } from './db';

export function dailyLimit(): number {
  const raw = process.env.AI_DAILY_QUOTA;
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 10;
}

/** UTC calendar day as YYYY-MM-DD. Quota resets at UTC midnight. */
export function todayUtc(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export async function readQuota(
  userId: string,
  today: string,
): Promise<{ used: number; limit: number; remaining: number }> {
  const limit = dailyLimit();
  const { rows } = await getPool().query<{ used: number }>(
    'SELECT used FROM ai_quota WHERE user_id = $1 AND day = $2',
    [userId, today],
  );
  const used = rows[0]?.used ?? 0;
  return { used, limit, remaining: Math.max(0, limit - used) };
}

/**
 * Atomically claim one unit of today's quota. The conditional UPDATE means two
 * concurrent requests can never push `used` past the limit.
 * Returns false when the user is already at the cap.
 */
export async function consumeQuota(userId: string, today: string): Promise<boolean> {
  const limit = dailyLimit();
  const { rowCount } = await getPool().query(
    `INSERT INTO ai_quota (user_id, day, used) VALUES ($1, $2, 1)
     ON CONFLICT (user_id, day) DO UPDATE SET used = ai_quota.used + 1
     WHERE ai_quota.used < $3`,
    [userId, today, limit],
  );
  return rowCount === 1;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd services/ai-service && npx vitest run src/quota.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Wire the real `/quota` route**

In `services/ai-service/src/server.ts`, replace the placeholder `/quota` handler:

```ts
import { readQuota, todayUtc } from './quota';

  app.get('/quota', async (req, res) => {
    const session = sessionUserId(req);
    if (!session) return res.status(401).json({ error: 'Not authenticated' });
    res.json(await readQuota(session.userId, todayUtc()));
  });
```

- [ ] **Step 6: Run the full service suite**

Run: `cd services/ai-service && npm test`
Expected: PASS — the Task 2 test asserting `/quota` returns 200 still passes (the body is now a quota object, which that test does not assert on).

- [ ] **Step 7: Write the failing breaker test**

Create `services/ai-service/src/breaker.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { isOpen, trip, reset, COOL_OFF_MS } from './breaker';

beforeEach(() => { reset(); });

describe('provider circuit breaker', () => {
  it('is closed initially', () => {
    expect(isOpen()).toBe(false);
  });

  it('opens once tripped', () => {
    const now = 1_000_000;
    trip(now);
    expect(isOpen(now)).toBe(true);
  });

  it('stays open for the whole cool-off window', () => {
    const now = 1_000_000;
    trip(now);
    expect(isOpen(now + COOL_OFF_MS - 1)).toBe(true);
  });

  it('closes itself once the window elapses', () => {
    const now = 1_000_000;
    trip(now);
    expect(isOpen(now + COOL_OFF_MS)).toBe(false);
  });

  it('re-tripping extends the window', () => {
    trip(1_000_000);
    trip(1_000_000 + COOL_OFF_MS - 1);
    expect(isOpen(1_000_000 + COOL_OFF_MS + 1)).toBe(true);
  });
});
```

- [ ] **Step 8: Run test to verify it fails**

Run: `cd services/ai-service && npx vitest run src/breaker.test.ts`
Expected: FAIL — `Cannot find module './breaker'`.

- [ ] **Step 9: Implement breaker.ts**

```ts
/**
 * Stops hammering a rate-limited provider. One 429 opens the breaker for a
 * cool-off window; while open, requests are refused locally without a
 * provider call. It closes itself when the window elapses — there is nothing
 * to reset by hand.
 *
 * Deliberately in-process: a single ai-service container is the whole
 * deployment, and a shared-state breaker would need a round trip to check,
 * which defeats the point.
 */
export const COOL_OFF_MS = 60_000;

let openUntil = 0;

export function isOpen(now: number = Date.now()): boolean {
  return now < openUntil;
}

export function trip(now: number = Date.now()): void {
  openUntil = now + COOL_OFF_MS;
}

export function reset(): void {
  openUntil = 0;
}
```

- [ ] **Step 10: Run tests to verify they pass**

Run: `cd services/ai-service && npx vitest run src/breaker.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 11: Commit**

```bash
git add services/ai-service/src/quota.ts services/ai-service/src/quota.test.ts \
        services/ai-service/src/breaker.ts services/ai-service/src/breaker.test.ts \
        services/ai-service/src/server.ts
git commit -m "feat(ai-service): daily quota and provider circuit breaker

Conditional UPDATE makes concurrent requests unable to exceed the cap;
quota resets at UTC midnight and defaults to 10/day. A 429 from the
provider opens a 60s breaker so a rate-limited endpoint is not hammered;
it closes itself."
```

---

### Task 4: Provider interface and Gemini adapter

**Files:**
- Create: `services/ai-service/src/provider/types.ts`
- Create: `services/ai-service/src/provider/gemini.ts`
- Create: `services/ai-service/src/provider/index.ts`
- Test: `services/ai-service/src/provider/gemini.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces:
  - `interface GeneratedCard { front: string; back: string }`
  - `interface GenerateResult { cards: GeneratedCard[]; inputTokens?: number; outputTokens?: number; model: string }`
  - `class ProviderError extends Error { kind: 'rate_limited' | 'unavailable' | 'bad_output' }`
  - `interface Provider { name: string; generateFlashcards(input: { title: string; notes: string; count: number }): Promise<GenerateResult> }`
  - `getProvider(): Provider`

- [ ] **Step 1: Write the failing test**

Create `services/ai-service/src/provider/gemini.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiProvider } from './gemini';
import { ProviderError } from './types';

const provider = new GeminiProvider('test-key');
const input = { title: 'Limit State Design', notes: 'Partial safety factors...', count: 3 };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('GeminiProvider', () => {
  it('parses cards and token counts from a well-formed response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      candidates: [{ content: { parts: [{ text: '[{"front":"Q1","back":"A1"},{"front":"Q2","back":"A2"}]' }] } }],
      usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 45 },
    }));

    const result = await provider.generateFlashcards(input);
    expect(result.cards).toEqual([{ front: 'Q1', back: 'A1' }, { front: 'Q2', back: 'A2' }]);
    expect(result.inputTokens).toBe(120);
    expect(result.outputTokens).toBe(45);
    expect(result.model).toBe('gemini-2.5-flash');
  });

  it('maps 429 to a rate_limited ProviderError', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ error: 'quota' }, 429));
    await expect(provider.generateFlashcards(input)).rejects.toMatchObject({ kind: 'rate_limited' });
  });

  it('maps 500 to an unavailable ProviderError', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ error: 'boom' }, 500));
    await expect(provider.generateFlashcards(input)).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('maps a network failure to an unavailable ProviderError', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(provider.generateFlashcards(input)).rejects.toBeInstanceOf(ProviderError);
  });

  it('rejects output that is not an array of front/back pairs', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      candidates: [{ content: { parts: [{ text: '{"not":"an array"}' }] } }],
    }));
    await expect(provider.generateFlashcards(input)).rejects.toMatchObject({ kind: 'bad_output' });
  });

  it('drops cards with empty sides', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      candidates: [{ content: { parts: [{ text: '[{"front":"Q","back":"A"},{"front":"","back":"A2"}]' }] } }],
    }));
    const result = await provider.generateFlashcards(input);
    expect(result.cards).toEqual([{ front: 'Q', back: 'A' }]);
  });

  it('never puts the API key in the request URL path or body', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      candidates: [{ content: { parts: [{ text: '[{"front":"Q","back":"A"}]' }] } }],
    }));
    await provider.generateFlashcards(input);
    const [, init] = spy.mock.calls[0];
    expect((init as RequestInit).headers).toMatchObject({ 'x-goog-api-key': 'test-key' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/ai-service && npx vitest run src/provider/gemini.test.ts`
Expected: FAIL — `Cannot find module './gemini'`.

- [ ] **Step 3: Create the provider types**

`services/ai-service/src/provider/types.ts`:

```ts
export interface GeneratedCard {
  front: string;
  back: string;
}

export interface GenerateResult {
  cards: GeneratedCard[];
  inputTokens?: number;
  outputTokens?: number;
  model: string;
}

export type ProviderErrorKind = 'rate_limited' | 'unavailable' | 'bad_output';

export class ProviderError extends Error {
  constructor(public kind: ProviderErrorKind, message: string) {
    super(message);
    this.name = 'ProviderError';
  }
}

export interface GenerateInput {
  title: string;
  notes: string;
  count: number;
}

export interface Provider {
  readonly name: string;
  generateFlashcards(input: GenerateInput): Promise<GenerateResult>;
}
```

- [ ] **Step 4: Implement the Gemini adapter**

`services/ai-service/src/provider/gemini.ts`:

```ts
import {
  ProviderError,
  type GenerateInput,
  type GenerateResult,
  type GeneratedCard,
  type Provider,
} from './types';

const MODEL = 'gemini-2.5-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const TIMEOUT_MS = 30_000;

// Constrains the model to an array of front/back pairs, so there is no
// parsing-and-retry loop to write.
const RESPONSE_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: { front: { type: 'STRING' }, back: { type: 'STRING' } },
    required: ['front', 'back'],
  },
} as const;

function prompt(input: GenerateInput): string {
  return [
    `You are helping a student revise for an exam.`,
    `Write exactly ${input.count} flashcards for the topic "${input.title}".`,
    ``,
    `Rules:`,
    `- Base every card ONLY on the notes below. Do not introduce outside facts.`,
    `- "front" is a question or prompt; "back" is a concise, complete answer.`,
    `- Prefer specific, testable facts (definitions, formulas, conditions) over vague prompts.`,
    `- If the notes are too thin to support ${input.count} good cards, return fewer.`,
    ``,
    `Notes:`,
    input.notes,
  ].join('\n');
}

export class GeminiProvider implements Provider {
  readonly name = 'gemini';

  constructor(private apiKey: string) {}

  async generateFlashcards(input: GenerateInput): Promise<GenerateResult> {
    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt(input) }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new ProviderError('unavailable', 'gemini request failed');
    }

    if (res.status === 429) throw new ProviderError('rate_limited', 'gemini rate limited');
    if (!res.ok) throw new ProviderError('unavailable', `gemini returned ${res.status}`);

    let body: {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    try {
      body = (await res.json()) as typeof body;
    } catch {
      throw new ProviderError('bad_output', 'gemini returned non-JSON');
    }

    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== 'string') throw new ProviderError('bad_output', 'gemini returned no content');

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ProviderError('bad_output', 'gemini content was not valid JSON');
    }
    if (!Array.isArray(parsed)) throw new ProviderError('bad_output', 'gemini content was not an array');

    const cards: GeneratedCard[] = parsed
      .filter(
        (c): c is GeneratedCard =>
          typeof c === 'object' && c !== null &&
          typeof (c as GeneratedCard).front === 'string' &&
          typeof (c as GeneratedCard).back === 'string' &&
          (c as GeneratedCard).front.trim() !== '' &&
          (c as GeneratedCard).back.trim() !== '',
      )
      .map((c) => ({ front: c.front.trim(), back: c.back.trim() }));

    return {
      cards,
      inputTokens: body.usageMetadata?.promptTokenCount,
      outputTokens: body.usageMetadata?.candidatesTokenCount,
      model: MODEL,
    };
  }
}
```

- [ ] **Step 5: Create the provider selector**

`services/ai-service/src/provider/index.ts`:

```ts
import { GeminiProvider } from './gemini';
import type { Provider } from './types';

export * from './types';

let cached: Provider | undefined;

/**
 * The one place a provider is chosen. Adding Claude or a local llama.cpp
 * adapter later means a new class here, not a change at any call site.
 */
export function getProvider(): Provider {
  if (!cached) {
    const key = process.env.GEMINI_API_KEY_REVISION;
    if (!key) throw new Error('GEMINI_API_KEY_REVISION env var must be set');
    cached = new GeminiProvider(key);
  }
  return cached;
}

export function _resetProviderCache(): void {
  cached = undefined;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd services/ai-service && npx vitest run src/provider/gemini.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 7: Commit**

```bash
git add services/ai-service/src/provider
git commit -m "feat(ai-service): provider interface and Gemini adapter

Structured output via responseSchema removes parse-and-retry logic.
Provider errors are classified (rate_limited/unavailable/bad_output) so
the HTTP layer can map them without leaking provider messages."
```

---

### Task 5: The generation endpoint

**Files:**
- Create: `services/ai-service/src/usage.ts`
- Modify: `services/ai-service/src/server.ts`
- Test: `services/ai-service/src/flashcards.test.ts`
- Test: `services/ai-service/src/usage.test.ts`

**Interfaces:**
- Consumes: `consumeQuota`, `readQuota`, `todayUtc`, `isOpen`, `trip` (Task 3); `getProvider`, `ProviderError` (Task 4)
- Produces:
  - `recordUsage(row: UsageRow): Promise<number>` — returns the inserted `ai_usage.id`
  - `recordKept(usageId: number, userId: string, kept: number): Promise<boolean>`
  - `POST /flashcards` → `200 { usageId: number; cards: { front: string; back: string }[] }`
  - `POST /flashcards/kept` → `204`

- [ ] **Step 1: Write the failing test**

Create `services/ai-service/src/flashcards.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import { signSession } from '@revision-app/shared/server';
import { getPool } from './db';
import { createApp } from './server';
import * as providerModule from './provider';
import { ProviderError } from './provider';
import { reset as resetBreaker } from './breaker';

const app = createApp();
const token = signSession({
  userId: '33333333-3333-3333-3333-333333333333',
  username: 'alice',
  domain: 'civil-engineering',
});

const body = { topicId: 't1', title: 'Limit State Design', notes: 'Partial safety factors apply.', count: 3 };

function stubProvider(impl: () => Promise<unknown>) {
  vi.spyOn(providerModule, 'getProvider').mockReturnValue({
    name: 'gemini',
    generateFlashcards: impl as never,
  });
}

beforeEach(async () => {
  await getPool().query('TRUNCATE ai_quota');
  await getPool().query('TRUNCATE ai_usage');
  process.env.AI_DAILY_QUOTA = '2';
  resetBreaker();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await getPool().end();
});

describe('POST /flashcards', () => {
  it('401s without a session', async () => {
    const res = await request(app).post('/flashcards').send(body);
    expect(res.status).toBe(401);
  });

  it('400s on a malformed body', async () => {
    const res = await request(app).post('/flashcards')
      .set('Authorization', `Bearer ${token}`).send({ title: '' });
    expect(res.status).toBe(400);
  });

  it('returns generated cards and logs usage', async () => {
    stubProvider(async () => ({
      cards: [{ front: 'Q1', back: 'A1' }], inputTokens: 100, outputTokens: 20, model: 'gemini-2.5-flash',
    }));
    const res = await request(app).post('/flashcards')
      .set('Authorization', `Bearer ${token}`).send(body);

    expect(res.status).toBe(200);
    expect(res.body.cards).toEqual([{ front: 'Q1', back: 'A1' }]);
    expect(typeof res.body.usageId).toBe('number');

    const { rows } = await getPool().query('SELECT outcome, input_tokens, cards_proposed FROM ai_usage');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ outcome: 'ok', input_tokens: 100, cards_proposed: 1 });
  });

  it('429s once the daily quota is spent, without calling the provider', async () => {
    const gen = vi.fn(async () => ({ cards: [{ front: 'Q', back: 'A' }], model: 'gemini-2.5-flash' }));
    stubProvider(gen);
    const send = () => request(app).post('/flashcards').set('Authorization', `Bearer ${token}`).send(body);

    expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(200);
    const third = await send();

    expect(third.status).toBe(429);
    expect(gen).toHaveBeenCalledTimes(2);
    const { rows } = await getPool().query(`SELECT outcome FROM ai_usage WHERE outcome = 'quota'`);
    expect(rows).toHaveLength(1);
  });

  it('503s when the provider is rate limited, and does not spend quota', async () => {
    stubProvider(async () => { throw new ProviderError('rate_limited', 'nope'); });
    const res = await request(app).post('/flashcards').set('Authorization', `Bearer ${token}`).send(body);

    expect(res.status).toBe(503);
    expect(res.body.error).not.toContain('nope');
    const { rows } = await getPool().query('SELECT used FROM ai_quota');
    expect(rows[0].used).toBe(0);
  });

  it('502s on bad provider output', async () => {
    stubProvider(async () => { throw new ProviderError('bad_output', 'garbage'); });
    const res = await request(app).post('/flashcards').set('Authorization', `Bearer ${token}`).send(body);
    expect(res.status).toBe(502);
  });

  it('refuses locally while the breaker is open, without calling the provider', async () => {
    const gen = vi.fn(async () => { throw new ProviderError('rate_limited', 'nope'); });
    stubProvider(gen);
    const send = () => request(app).post('/flashcards').set('Authorization', `Bearer ${token}`).send(body);

    expect((await send()).status).toBe(503);   // trips the breaker
    expect((await send()).status).toBe(503);   // refused locally
    expect(gen).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/ai-service && npx vitest run src/flashcards.test.ts`
Expected: FAIL — `POST /flashcards` 404s.

- [ ] **Step 3: Implement usage.ts**

```ts
import { getPool } from './db';

export interface UsageRow {
  userId: string;
  provider: string;
  model: string;
  operation: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  outcome: 'ok' | 'quota' | 'rate_limited' | 'error';
  cardsProposed?: number;
}

export async function recordUsage(row: UsageRow): Promise<number> {
  const { rows } = await getPool().query<{ id: string }>(
    `INSERT INTO ai_usage
       (user_id, provider, model, operation, input_tokens, output_tokens, latency_ms, outcome, cards_proposed)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id`,
    [
      row.userId, row.provider, row.model, row.operation,
      row.inputTokens ?? null, row.outputTokens ?? null, row.latencyMs ?? null,
      row.outcome, row.cardsProposed ?? null,
    ],
  );
  return Number(rows[0].id);
}

export async function recordKept(usageId: number, userId: string, kept: number): Promise<boolean> {
  const { rowCount } = await getPool().query(
    'UPDATE ai_usage SET cards_kept = $1 WHERE id = $2 AND user_id = $3',
    [kept, usageId, userId],
  );
  return rowCount === 1;
}
```

`recordKept` scopes the update by `user_id` so one user cannot write to another's usage row.

- [ ] **Step 4: Write the usage unit test**

Create `services/ai-service/src/usage.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getPool } from './db';
import { recordUsage, recordKept } from './usage';

const USER = '44444444-4444-4444-4444-444444444444';
const OTHER = '55555555-5555-5555-5555-555555555555';

beforeEach(async () => { await getPool().query('TRUNCATE ai_usage'); });
afterAll(async () => { await getPool().end(); });

describe('usage log', () => {
  it('inserts a row and returns its id', async () => {
    const id = await recordUsage({
      userId: USER, provider: 'gemini', model: 'gemini-2.5-flash',
      operation: 'flashcards', outcome: 'ok', cardsProposed: 4,
    });
    expect(id).toBeGreaterThan(0);
  });

  it('records kept cards for the owning user', async () => {
    const id = await recordUsage({
      userId: USER, provider: 'gemini', model: 'gemini-2.5-flash',
      operation: 'flashcards', outcome: 'ok', cardsProposed: 4,
    });
    expect(await recordKept(id, USER, 3)).toBe(true);
    const { rows } = await getPool().query('SELECT cards_kept FROM ai_usage WHERE id = $1', [id]);
    expect(rows[0].cards_kept).toBe(3);
  });

  it('refuses to record kept cards for another user', async () => {
    const id = await recordUsage({
      userId: USER, provider: 'gemini', model: 'gemini-2.5-flash',
      operation: 'flashcards', outcome: 'ok', cardsProposed: 4,
    });
    expect(await recordKept(id, OTHER, 99)).toBe(false);
  });
});
```

- [ ] **Step 5: Implement the endpoint**

Add to `services/ai-service/src/server.ts`:

```ts
import { z } from 'zod';
import { consumeQuota, readQuota, todayUtc } from './quota';
import { getProvider, ProviderError } from './provider';
import { recordUsage, recordKept } from './usage';
import { isOpen, trip } from './breaker';

const generateSchema = z.object({
  topicId: z.string().min(1),
  title: z.string().min(1).max(300),
  notes: z.string().max(20_000),
  count: z.number().int().min(1).max(20).default(8),
});

const keptSchema = z.object({
  usageId: z.number().int().positive(),
  kept: z.number().int().min(0).max(50),
});
```

and, inside `createApp()`:

```ts
  app.post('/flashcards', async (req, res) => {
    const session = sessionUserId(req);
    if (!session) return res.status(401).json({ error: 'Not authenticated' });

    const parsed = generateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid request' });

    const provider = getProvider();
    const today = todayUtc();

    // Breaker check comes before the quota claim: a locally-refused request
    // must not cost the student a generation.
    if (isOpen()) {
      return res.status(503).json({ error: 'AI is busy right now — try again in a minute.' });
    }

    if (!(await consumeQuota(session.userId, today))) {
      const { limit } = await readQuota(session.userId, today);
      await recordUsage({
        userId: session.userId, provider: provider.name, model: 'n/a',
        operation: 'flashcards', outcome: 'quota',
      });
      return res.status(429).json({
        error: `You've used today's ${limit} generations — resets at midnight UTC.`,
      });
    }

    const startedAt = Date.now();
    try {
      const result = await provider.generateFlashcards({
        title: parsed.data.title, notes: parsed.data.notes, count: parsed.data.count,
      });
      const usageId = await recordUsage({
        userId: session.userId, provider: provider.name, model: result.model,
        operation: 'flashcards', inputTokens: result.inputTokens, outputTokens: result.outputTokens,
        latencyMs: Date.now() - startedAt, outcome: 'ok', cardsProposed: result.cards.length,
      });
      return res.json({ usageId, cards: result.cards });
    } catch (err) {
      // A failed generation must not cost the student a quota unit.
      await getPool().query(
        'UPDATE ai_quota SET used = GREATEST(0, used - 1) WHERE user_id = $1 AND day = $2',
        [session.userId, today],
      );
      const kind = err instanceof ProviderError ? err.kind : 'unavailable';
      await recordUsage({
        userId: session.userId, provider: provider.name, model: 'n/a',
        operation: 'flashcards', latencyMs: Date.now() - startedAt,
        outcome: kind === 'rate_limited' ? 'rate_limited' : 'error',
      });
      if (kind === 'rate_limited') {
        trip();
        return res.status(503).json({ error: 'AI is busy right now — try again in a minute.' });
      }
      if (kind === 'bad_output') {
        return res.status(502).json({ error: "Couldn't generate cards for this topic." });
      }
      return res.status(503).json({ error: 'AI is unavailable right now — try again shortly.' });
    }
  });

  app.post('/flashcards/kept', async (req, res) => {
    const session = sessionUserId(req);
    if (!session) return res.status(401).json({ error: 'Not authenticated' });
    const parsed = keptSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid request' });
    await recordKept(parsed.data.usageId, session.userId, parsed.data.kept);
    return res.status(204).end();
  });
```

Add `import { getPool } from './db';` to the top of `server.ts` for the quota-refund query.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd services/ai-service && npm test`
Expected: PASS — all suites (server, quota, provider, usage, flashcards).

- [ ] **Step 7: Commit**

```bash
git add services/ai-service/src
git commit -m "feat(ai-service): POST /flashcards with quota and usage logging

Quota is claimed before the provider call and refunded when the call
fails, so a provider outage never costs a student a generation. Provider
errors map to 503/502 with user-safe copy; raw messages never escape."
```

---

### Task 6: Frontend proxy route and client

**Files:**
- Create: `apps/frontend/lib/aiClient.ts`
- Create: `apps/frontend/app/api/ai/flashcards/route.ts`
- Create: `apps/frontend/app/api/ai/flashcards/kept/route.ts`
- Test: `apps/frontend/lib/aiClient.test.ts`

**Interfaces:**
- Consumes: `POST /flashcards`, `POST /flashcards/kept` (Task 5)
- Produces:
  - `class AiServiceError extends Error { status: number }`
  - `generateFlashcards(body, authHeader): Promise<{ usageId: number; cards: { front: string; back: string }[] }>`
  - `recordKept(body, authHeader): Promise<void>`
  - Browser-facing: `POST /api/ai/flashcards`, `POST /api/ai/flashcards/kept`

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/lib/aiClient.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateFlashcards, AiServiceError } from './aiClient';

const body = { topicId: 't1', title: 'T', notes: 'N', count: 3 };

beforeEach(() => { vi.restoreAllMocks(); });

describe('aiClient', () => {
  it('returns the parsed payload on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ usageId: 7, cards: [{ front: 'Q', back: 'A' }] }), { status: 200 }),
    );
    await expect(generateFlashcards(body, 'Bearer t')).resolves.toEqual({
      usageId: 7, cards: [{ front: 'Q', back: 'A' }],
    });
  });

  it('propagates the service status and message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'quota gone' }), { status: 429 }),
    );
    await expect(generateFlashcards(body, 'Bearer t')).rejects.toMatchObject({
      status: 429, message: 'quota gone',
    });
  });

  it('turns a network failure into a 502', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(generateFlashcards(body, 'Bearer t')).rejects.toMatchObject({ status: 502 });
  });

  it('turns a timeout into a 504', async () => {
    const err = new Error('timed out'); err.name = 'TimeoutError';
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(err);
    await expect(generateFlashcards(body, 'Bearer t')).rejects.toBeInstanceOf(AiServiceError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run lib/aiClient.test.ts`
Expected: FAIL — `Cannot find module './aiClient'`.

- [ ] **Step 3: Implement aiClient.ts**

Mirrors `apps/frontend/lib/contentClient.ts`, including its `PROXY_TIMEOUT_MS` import. Generation is slower than a data fetch, so it uses its own longer timeout.

```ts
// apps/frontend/lib/aiClient.ts
const AI_SERVICE_URL = process.env.AI_SERVICE_URL ?? 'http://127.0.0.1:4004';

// Generation is slower than a CRUD hop — allow more than PROXY_TIMEOUT_MS,
// but stay under ai-service's own 30s provider timeout plus overhead.
const AI_TIMEOUT_MS = 35_000;

export class AiServiceError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'AiServiceError';
  }
}

export interface GenerateBody {
  topicId: string;
  title: string;
  notes: string;
  count: number;
}

export interface GenerateResponse {
  usageId: number;
  cards: { front: string; back: string }[];
}

async function callAiService(path: string, authHeader: string, payload: unknown): Promise<Response> {
  try {
    return await fetch(`${AI_SERVICE_URL}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: authHeader },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError';
    throw new AiServiceError(timedOut ? 504 : 502, 'ai-service unavailable');
  }
}

export async function generateFlashcards(body: GenerateBody, authHeader: string): Promise<GenerateResponse> {
  const res = await callAiService('/flashcards', authHeader, body);
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))) as { error?: string };
    throw new AiServiceError(res.status, detail.error ?? 'Could not generate cards');
  }
  return (await res.json()) as GenerateResponse;
}

export async function recordKept(
  body: { usageId: number; kept: number },
  authHeader: string,
): Promise<void> {
  await callAiService('/flashcards/kept', authHeader, body);
}
```

`recordKept` deliberately ignores failures — losing a quality-signal write must never break the student's save.

- [ ] **Step 4: Create the API routes**

`apps/frontend/app/api/ai/flashcards/route.ts`:

```ts
import type { NextRequest } from 'next/server';
import { getSessionFromRequest } from '@revision-app/shared/server';
import { generateFlashcards, AiServiceError, type GenerateBody } from '@/lib/aiClient';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const authHeader = req.headers.get('Authorization') ?? '';
  const body = (await req.json()) as GenerateBody;
  try {
    return Response.json(await generateFlashcards(body, authHeader));
  } catch (err) {
    if (err instanceof AiServiceError) return Response.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
```

`apps/frontend/app/api/ai/flashcards/kept/route.ts`:

```ts
import type { NextRequest } from 'next/server';
import { getSessionFromRequest } from '@revision-app/shared/server';
import { recordKept } from '@/lib/aiClient';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const authHeader = req.headers.get('Authorization') ?? '';
  const body = (await req.json()) as { usageId: number; kept: number };
  await recordKept(body, authHeader);
  return new Response(null, { status: 204 });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/frontend && npx vitest run lib/aiClient.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/lib/aiClient.ts apps/frontend/lib/aiClient.test.ts apps/frontend/app/api/ai
git commit -m "feat(frontend): proxy routes for AI flashcard generation

Mirrors the contentClient pattern: a typed error carrying a status so
routes return a clean 4xx/5xx instead of a leaked stack trace."
```

---

### Task 7: Review step in the flashcards panel

**Files:**
- Modify: `apps/frontend/store/useStore.ts` (accept `source` on `addFlashcard`)
- Modify: `apps/frontend/components/FlashcardsPanel.tsx`
- Test: `apps/frontend/components/FlashcardsPanel.test.tsx` (append)

**Interfaces:**
- Consumes: `POST /api/ai/flashcards` (Task 6); `Flashcard.source` (Task 1)
- Produces: `addFlashcard(topicId, front, back, source?): string`

- [ ] **Step 1: Write the failing test**

Append to `apps/frontend/components/FlashcardsPanel.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

it('shows generated cards for review and saves only the kept ones', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({
      usageId: 1,
      cards: [{ front: 'Q1', back: 'A1' }, { front: 'Q2', back: 'A2' }],
    }), { status: 200 }),
  );
  const addFlashcard = vi.fn();
  vi.spyOn(useStore, 'getState').mockReturnValue({
    addFlashcard, deleteFlashcard: vi.fn(),
  } as never);

  render(<FlashcardsPanel topic={{ ...baseTopic, notes: 'Some notes' }} />);
  fireEvent.click(screen.getByRole('button', { name: /generate/i }));

  await waitFor(() => expect(screen.getByText('Q1')).toBeInTheDocument());
  fireEvent.click(screen.getByLabelText('Discard Q2'));
  fireEvent.click(screen.getByRole('button', { name: /save 1 card/i }));

  await waitFor(() => expect(addFlashcard).toHaveBeenCalledTimes(1));
  expect(addFlashcard).toHaveBeenCalledWith(baseTopic.id, 'Q1', 'A1', 'generated');
});

it('surfaces a quota message without saving anything', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ error: "You've used today's 10 generations — resets at midnight UTC." }), { status: 429 }),
  );
  const addFlashcard = vi.fn();
  vi.spyOn(useStore, 'getState').mockReturnValue({ addFlashcard, deleteFlashcard: vi.fn() } as never);

  render(<FlashcardsPanel topic={{ ...baseTopic, notes: 'Some notes' }} />);
  fireEvent.click(screen.getByRole('button', { name: /generate/i }));

  await waitFor(() => expect(screen.getByText(/used today's 10 generations/i)).toBeInTheDocument());
  expect(addFlashcard).not.toHaveBeenCalled();
});
```

Reuse whatever `baseTopic` fixture and `useStore` import the existing tests in this file already define. If the file has no `baseTopic`, add one matching the `Topic` interface with `flashcards: []` and `notes: ''`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run components/FlashcardsPanel.test.tsx`
Expected: FAIL — no "Generate" button exists.

- [ ] **Step 3: Widen `addFlashcard` in the store**

In `apps/frontend/store/useStore.ts`, change the interface entry and implementation:

```ts
  addFlashcard: (topicId: string, front: string, back: string, source?: 'manual' | 'generated') => string;
```

```ts
      addFlashcard: (topicId, front, back, source) => {
        // ...existing lookup of `s` and `t` and `id` generation is unchanged...
        const card: Flashcard = { id, front, back, createdAt: Date.now(), ...(source ? { source } : {}) };
        commit({ topics: { ...s.topics, [topicId]: { ...t, flashcards: [...(t.flashcards ?? []), card], updatedAt: Date.now() } } });
        // ...existing return of `id` is unchanged...
      },
```

Spreading `source` conditionally keeps hand-written cards byte-identical to before, so no existing snapshot or test changes.

- [ ] **Step 4: Add generation and review to FlashcardsPanel**

Add to the imports at the top of `apps/frontend/components/FlashcardsPanel.tsx`:

```tsx
import { Sparkles, Check } from 'lucide-react';
import { getStoredToken } from '@/lib/auth/client';
```

Add this state and handler inside `FlashcardsPanel`, after the existing `add` function:

```tsx
  const [proposed, setProposed] = useState<{ front: string; back: string; keep: boolean }[]>([]);
  const [usageId, setUsageId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setBusy(true); setError(null); setProposed([]);
    try {
      const res = await fetch('/api/ai/flashcards', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${getStoredToken() ?? ''}` },
        body: JSON.stringify({ topicId: topic.id, title: topic.title, notes: topic.notes, count: 8 }),
      });
      const payload = (await res.json()) as { usageId?: number; cards?: { front: string; back: string }[]; error?: string };
      if (!res.ok) { setError(payload.error ?? 'Could not generate cards.'); return; }
      if (!payload.cards?.length) { setError('No cards could be made from these notes.'); return; }
      setUsageId(payload.usageId ?? null);
      setProposed(payload.cards.map((c) => ({ ...c, keep: true })));
    } catch {
      setError('Could not reach the AI service.');
    } finally {
      setBusy(false);
    }
  };

  const saveKept = () => {
    const kept = proposed.filter((c) => c.keep);
    for (const c of kept) addFlashcard(topic.id, c.front, c.back, 'generated');
    if (usageId !== null) {
      // Quality signal only — never block the save on it.
      void fetch('/api/ai/flashcards/kept', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${getStoredToken() ?? ''}` },
        body: JSON.stringify({ usageId, kept: kept.length }),
      }).catch(() => {});
    }
    setProposed([]); setUsageId(null);
  };
```

Add the Generate button next to the existing Review button in the header:

```tsx
        <button
          onClick={generate}
          disabled={busy || !topic.notes.trim()}
          title={topic.notes.trim() ? 'Generate cards from this topic’s notes' : 'Add notes first'}
          className="flex min-h-11 items-center gap-1 rounded-lg border border-white/10 px-3 text-xs hover:bg-white/5 disabled:opacity-40 md:min-h-0 md:px-2 md:py-1"
        >
          <Sparkles size={13} /> {busy ? 'Generating…' : 'Generate'}
        </button>
```

And render the error and the review list above the existing manual add row:

```tsx
      {error && <p className="mb-3 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-200">{error}</p>}

      {proposed.length > 0 && (
        <div className="mb-3 rounded-lg border border-white/10 p-3">
          <p className="mb-2 text-xs text-white/60">Review before saving — uncheck anything wrong.</p>
          <ul className="flex flex-col gap-2">
            {proposed.map((c, i) => (
              <li key={i} className={`rounded-lg border p-2 text-sm ${c.keep ? 'border-white/15' : 'border-white/5 opacity-40'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{c.front}</p>
                    <p className="text-xs text-white/70">{c.back}</p>
                  </div>
                  <button
                    aria-label={`${c.keep ? 'Discard' : 'Keep'} ${c.front}`}
                    onClick={() => setProposed((p) => p.map((x, j) => (j === i ? { ...x, keep: !x.keep } : x)))}
                    className="touch-target rounded p-1 hover:bg-white/10"
                  >
                    {c.keep ? <Check size={14} /> : <Plus size={14} />}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <button
              onClick={saveKept}
              disabled={proposed.every((c) => !c.keep)}
              className="min-h-11 flex-1 rounded-lg border border-white/15 text-sm hover:bg-white/5 disabled:opacity-40 md:min-h-0 md:py-2"
            >
              Save {proposed.filter((c) => c.keep).length} card{proposed.filter((c) => c.keep).length === 1 ? '' : 's'}
            </button>
            <button
              onClick={() => { setProposed([]); setUsageId(null); }}
              className="min-h-11 rounded-lg border border-white/10 px-4 text-sm hover:bg-white/5 md:min-h-0 md:py-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/frontend && npx vitest run components/FlashcardsPanel.test.tsx`
Expected: PASS, including the file's pre-existing tests.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/store/useStore.ts apps/frontend/components/FlashcardsPanel.tsx apps/frontend/components/FlashcardsPanel.test.tsx
git commit -m "feat(frontend): generate flashcards with a review step

Generated cards are proposed, never auto-saved — a wrong card inside a
spaced-repetition system gets rehearsed. The keep/discard ratio is
reported back as a quality signal, best-effort."
```

---

### Task 8: Quiz scoring

**Files:**
- Modify: `apps/frontend/components/FlashcardsPanel.tsx` (`ReviewModal`)
- Modify: `apps/frontend/store/useStore.ts` (`recordRevision` accepts a score)
- Test: `apps/frontend/components/FlashcardsPanel.test.tsx` (append)

**Interfaces:**
- Consumes: `Revision.score` (Task 1)
- Produces: `ReviewModal` calls `onFinish({ correct, total })` once the last card is graded

- [ ] **Step 1: Find the existing revision-recording action**

Run: `grep -n "revisionHistory" apps/frontend/store/useStore.ts`

Identify the store action that appends a `Revision` (the one the "mark revised" UI calls). Note its exact name — the steps below call it `recordRevision`; **use the real name** wherever that appears.

- [ ] **Step 2: Write the failing test**

Append to `apps/frontend/components/FlashcardsPanel.test.tsx`:

```tsx
it('grades a session and records one scored revision', async () => {
  const recordRevision = vi.fn();
  vi.spyOn(useStore, 'getState').mockReturnValue({
    addFlashcard: vi.fn(), deleteFlashcard: vi.fn(), recordRevision,
  } as never);

  const topic = {
    ...baseTopic,
    flashcards: [
      { id: 'c1', front: 'Q1', back: 'A1', createdAt: 1 },
      { id: 'c2', front: 'Q2', back: 'A2', createdAt: 2 },
    ],
  };

  render(<FlashcardsPanel topic={topic} />);
  fireEvent.click(screen.getByRole('button', { name: /review/i }));

  fireEvent.click(screen.getByRole('button', { name: /got it/i }));
  fireEvent.click(screen.getByRole('button', { name: /missed it/i }));

  await waitFor(() => expect(recordRevision).toHaveBeenCalledTimes(1));
  expect(recordRevision).toHaveBeenCalledWith(topic.id, { correct: 1, total: 2 });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run components/FlashcardsPanel.test.tsx`
Expected: FAIL — no "Got it" button.

- [ ] **Step 4: Let the store action carry a score**

In `apps/frontend/store/useStore.ts`, widen the revision-recording action found in Step 1 to accept an optional score and put it on the appended `Revision`:

```ts
  recordRevision: (topicId: string, score?: { correct: number; total: number }) => void;
```

```ts
      recordRevision: (topicId, score) => {
        // ...existing lookup of `s` and `t` and `id` generation is unchanged...
        const rev: Revision = { id, timestamp: Date.now(), ...(score ? { score } : {}) };
        // ...existing commit appending `rev` to t.revisionHistory is unchanged...
      },
```

Conditional spreading keeps unscored revisions byte-identical, so existing snapshots and tests are unaffected.

- [ ] **Step 5: Add grading to ReviewModal**

Change the `ReviewModal` signature to take a finish callback:

```tsx
function ReviewModal({
  cards, onClose, onFinish,
}: {
  cards: { id: string; front: string; back: string }[];
  onClose: () => void;
  onFinish: (score: { correct: number; total: number }) => void;
}) {
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [correct, setCorrect] = useState(0);

  const grade = (got: boolean) => {
    const nextCorrect = correct + (got ? 1 : 0);
    if (i === cards.length - 1) {
      onFinish({ correct: nextCorrect, total: cards.length });
      onClose();
      return;
    }
    setCorrect(nextCorrect);
    setFlipped(false);
    setI(i + 1);
  };
  // ...existing next/prev handlers and card rendering are unchanged...
```

Replace the Prev/Next row with the grading row:

```tsx
        <div className="flex gap-2">
          <button onClick={() => grade(false)} className="min-h-11 flex-1 rounded-lg border border-white/10 text-sm hover:bg-white/5 md:min-h-0 md:py-2">Missed it</button>
          <button onClick={() => grade(true)} className="min-h-11 flex-1 rounded-lg border border-white/15 text-sm hover:bg-white/5 md:min-h-0 md:py-2">Got it</button>
        </div>
        <p className="mt-2 text-center text-xs text-white/50">{i + 1} / {cards.length}</p>
```

Update the call site in `FlashcardsPanel` where `ReviewModal` is rendered:

```tsx
      {review && (
        <ReviewModal
          cards={cards}
          onClose={() => setReview(false)}
          onFinish={(score) => useStore.getState().recordRevision(topic.id, score)}
        />
      )}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/frontend && npx vitest run components/FlashcardsPanel.test.tsx`
Expected: PASS.

- [ ] **Step 7: Verify the schedule suggestion moves**

Run: `cd packages/shared && npx vitest run && cd ../../apps/frontend && npx vitest run`
Expected: PASS. A scored revision now flows into `suggestedNextDate` from Task 1 — a weak score suggests an earlier date, while `plannedAt` stays user-owned.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/store/useStore.ts apps/frontend/components/FlashcardsPanel.tsx apps/frontend/components/FlashcardsPanel.test.tsx
git commit -m "feat(frontend): self-graded quiz feeds the revision ladder

Got it / Missed it per card; the session records one scored Revision,
which pulls the suggested next date earlier after a weak result. No LLM
call and no change to manual-first planning."
```

---

### Task 9: Verify end to end

**Files:**
- Modify: `README.md` (document the AI feature and its env vars)

**Interfaces:**
- Consumes: everything above

- [ ] **Step 1: Bring the stack up**

```bash
docker compose up -d --build ai-service app
docker compose ps
```

Expected: `revision_ai_service` and `revision_app` both `Up`.

- [ ] **Step 2: Confirm the service answers**

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4004/health
```

Expected: `200`. If the container is not published on the host, run the curl inside it:
`docker compose exec ai-service curl -s localhost:4004/health`

- [ ] **Step 3: Confirm migrations applied**

```bash
docker compose exec db psql -U revision -d revision_ai -c '\dt'
```

Expected: `ai_quota` and `ai_usage` listed.

- [ ] **Step 4: Exercise the real flow in a browser**

Sign in, open a topic that has notes, click **Generate**, confirm cards appear in the review step, uncheck one, click **Save**. Confirm the kept cards appear in the flashcard list and the discarded one does not.

- [ ] **Step 5: Confirm usage was logged with the quality signal**

```bash
docker compose exec db psql -U revision -d revision_ai \
  -c 'SELECT outcome, cards_proposed, cards_kept, input_tokens, output_tokens, latency_ms FROM ai_usage ORDER BY id DESC LIMIT 5;'
```

Expected: an `ok` row with `cards_proposed` > `cards_kept` (you discarded one) and non-null token counts.

- [ ] **Step 6: Exercise the quota wall**

Temporarily set `AI_DAILY_QUOTA=1`, restart ai-service, and generate twice. The second attempt must show the quota message in the UI and add a `quota` row to `ai_usage`. Restore the value afterwards.

- [ ] **Step 7: Document it**

Add a short section to `README.md` covering: what the feature does, that generation requires `GEMINI_API_KEY_REVISION` from a **separate Google Cloud project** to NEXUS's key, the `AI_DAILY_QUOTA` default of 10, and a note that on Gemini's free tier submitted notes may be used by Google to improve their products.

- [ ] **Step 8: Commit**

```bash
git add README.md
git commit -m "docs: AI flashcard generation setup and privacy note"
```

---

## Deferred to a later slice

These are in the spec's "out of scope" and must **not** be built here: AI grading of free-text answers, per-card spaced repetition, RAG/embeddings/vector store (slice A), PDF extraction (slice D), the study coach (slice C), and subscription entitlements.

## Open items carried from the spec

- Final `AI_DAILY_QUOTA` value, to be set from observed `ai_usage` data rather than guessed.
- Where the third-party-model privacy notice appears in-product (Task 9 covers the README only).
