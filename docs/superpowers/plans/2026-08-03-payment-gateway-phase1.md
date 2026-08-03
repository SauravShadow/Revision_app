# Payment Gateway Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship subscription entitlements with working trial day-counting and read-only-on-lapse enforcement, behind a provider-agnostic billing interface whose only implementation is a dummy gateway.

**Architecture:** A `subscriptions` table and append-only `billing_events` ledger live in `revision_auth` beside users and organisations. Entitlement is resolved at login and baked into the stateless HMAC session token as an `accessUntil` timestamp, so all three services enforce it locally with no new network calls. Writes are gated on five routes; every read stays open.

**Tech Stack:** TypeScript (strict), Express 4, Postgres 16 via `pg`, Vitest 3 + supertest, Next.js 15 / React 19, Zustand 5, Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-08-03-payment-gateway-design.md`

## Global Constraints

- Monorepo with npm workspaces: `apps/*`, `services/*`, `packages/*`. Run tests per workspace, e.g. `npm test -w services/auth-service`.
- Backend service tests require a real Postgres. `auth-service` tests need `DATABASE_URL` pointed at `revision_auth_test`. Migrations run with `npm run db:migrate -w services/auth-service`.
- Vitest runs with `--no-file-parallelism` in the services; the frontend sets `fileParallelism: false` in `vitest.config.ts`. Do not change either.
- `packages/shared/src/index.ts` is the client-safe entry. Anything importing `node:crypto` goes in `packages/shared/src/server.ts` (`@revision-app/shared/server`). Never import `/server` from a client component.
- Trial length: `TRIAL_DAYS`, default `14`.
- Paid period length: `PLAN_PERIOD_DAYS`, default `30`.
- Plan amount: `PLAN_AMOUNT_MINOR`, default `0` (paise). Currency: `PLAN_CURRENCY`, default `INR`.
- Provider selection: `BILLING_PROVIDER`, default `dummy`.
- Comped-account sentinel date: `2099-01-01T00:00:00Z`.
- The 403 error code string is exactly `subscription_required`.
- Every store function that reads or compares the clock takes a trailing optional `now: number = Date.now()` parameter, so tests can hit boundaries exactly.
- Commit after every task. Never commit with failing tests.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `packages/shared/src/billing.ts` | `daysRemaining()` — client-safe, no crypto |
| `services/auth-service/db/migrations/0005_billing.sql` | Tables + comp backfill |
| `services/auth-service/src/subscriptionStore.ts` | All SQL over `subscriptions` and `billing_events` |
| `services/auth-service/src/subscriptionStore.test.ts` | Its tests |
| `services/auth-service/src/registration.ts` | The user+trial transaction |
| `services/auth-service/src/registration.test.ts` | Its tests |
| `services/auth-service/src/billing/provider.ts` | `BillingProvider` interface and types |
| `services/auth-service/src/billing/dummyProvider.ts` | The dummy implementation |
| `services/auth-service/src/billing/dummyProvider.test.ts` | Its tests |
| `services/auth-service/src/billing/index.ts` | `getProvider()` selector |
| `services/auth-service/src/billingRoutes.ts` | `/billing/*` HTTP surface |
| `services/auth-service/src/billingRoutes.test.ts` | Its tests |
| `apps/frontend/app/api/billing/status/route.ts` | Proxy |
| `apps/frontend/app/api/billing/checkout/route.ts` | Proxy |
| `apps/frontend/app/api/billing/callback/route.ts` | Proxy |
| `apps/frontend/lib/billing/client.ts` | Fetch wrappers |
| `apps/frontend/lib/billing/writeGuard.ts` | Module-level `canWriteNow()` the store consults, plus the 403 notification channel |
| `apps/frontend/lib/billing/writeGuard.test.ts` | Its tests |
| `apps/frontend/lib/billing/EntitlementProvider.tsx` | Context + `useEntitlement()` |
| `apps/frontend/components/billing/TrialBanner.tsx` | Countdown / read-only bar |
| `apps/frontend/components/billing/TrialBanner.test.tsx` | Its tests |
| `apps/frontend/app/billing/page.tsx` | Plan + upgrade page |
| `apps/frontend/app/billing/checkout/page.tsx` | Dummy checkout simulator |

**Modified:**

| File | Change |
|---|---|
| `packages/shared/src/authTypes.ts` | `Plan` type; `Session` gains `accessUntil`, `plan` |
| `packages/shared/src/session.ts` | `verifySession` decodes them; add `hasWriteAccess`, `subscriptionRequiredBody` |
| `packages/shared/src/index.ts` | Export `./billing` |
| `services/auth-service/src/userStore.ts` | `createUser` accepts an optional `Querier` |
| `services/auth-service/src/server.ts` | `/register` uses the transaction; `/login` and `/me` sign entitlement; mount `billingRouter` |
| `services/auth-service/src/internalRoutes.ts` | Add `POST /internal/billing/grant` |
| `services/auth-service/src/orgRoutes.ts` | `requireWrite` on 6 routes |
| `services/content-service/src/session.ts` | Add `fullSessionFrom` |
| `services/content-service/src/server.ts` | Gate `PUT /app-data` |
| `services/files-service/src/server.ts` | Gate `POST /upload` and `DELETE /:id` |
| `apps/frontend/app/layout.tsx` | Mount `EntitlementProvider` |
| `apps/frontend/components/layout/AppShell.tsx` | Render `TrialBanner` |
| `apps/frontend/store/useStore.ts` | Guard `commit`, `commitSilent`, `undo`, `redo` |
| `apps/frontend/lib/repository/ApiRepository.ts` | Pre-check + 403 handling |
| `.env.example`, `docker-compose.yml`, `README.md` | New env vars, documentation |

---

## Task 1: Session carries entitlement

Making `accessUntil` and `plan` required on `Session` breaks every construction site at once. This task changes the type and fixes all seven call sites in one commit so the tree stays green. Real values arrive in Task 5; this task signs placeholders.

**Files:**
- Modify: `packages/shared/src/authTypes.ts`
- Modify: `packages/shared/src/session.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/shared/src/billing.ts`
- Test: `packages/shared/src/session.test.ts`
- Fix compile: `services/auth-service/src/server.ts:147`, `:159`; `services/auth-service/src/orgRoutes.test.ts:19`; `services/content-service/src/server.test.ts:8`; `services/content-service/src/cohort.test.ts:15-16`; `services/files-service/src/server.test.ts:10`

**Interfaces:**
- Consumes: nothing.
- Produces: `Plan`, `Session` (with `accessUntil: number | null`, `plan: Plan`), `hasWriteAccess(session, now?)`, `subscriptionRequiredBody(session)`, `SubscriptionRequiredBody`, `daysRemaining(accessUntil, now?)`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/shared/src/session.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { signSession, verifySession, hasWriteAccess, subscriptionRequiredBody } from './session';
import { daysRemaining } from './billing';
import type { Session } from './authTypes';

const DAY = 86_400_000;
const base: Session = {
  userId: 'u1', username: 'alice', domain: 'civil-engineering',
  accessUntil: null, plan: 'none',
};

describe('entitlement in the session token', () => {
  it('round-trips accessUntil and plan', () => {
    const session: Session = { ...base, accessUntil: 1_800_000_000_000, plan: 'trial' };
    expect(verifySession(signSession(session))).toEqual(session);
  });

  it('treats a legacy token with no entitlement as a valid identity with no access', () => {
    // A token signed before billing existed: the payload has only the three
    // original fields. Reconstructed here by signing a cast object.
    const legacy = signSession({ userId: 'u1', username: 'alice', domain: 'civil-engineering' } as Session);
    const decoded = verifySession(legacy);
    expect(decoded).not.toBeNull();
    expect(decoded!.userId).toBe('u1');
    expect(decoded!.accessUntil).toBeNull();
    expect(decoded!.plan).toBe('none');
    expect(hasWriteAccess(decoded)).toBe(false);
  });

  it('rejects a garbage plan value rather than trusting it', () => {
    const forged = signSession({ ...base, plan: 'lifetime' as Session['plan'] });
    expect(verifySession(forged)!.plan).toBe('none');
  });
});

describe('hasWriteAccess', () => {
  const at = 1_000_000_000_000;
  const s: Session = { ...base, accessUntil: at, plan: 'trial' };

  it('grants access one millisecond before expiry', () => {
    expect(hasWriteAccess(s, at - 1)).toBe(true);
  });

  it('denies access exactly at expiry', () => {
    expect(hasWriteAccess(s, at)).toBe(false);
  });

  it('denies access one millisecond after expiry', () => {
    expect(hasWriteAccess(s, at + 1)).toBe(false);
  });

  it('denies a null session and a null accessUntil', () => {
    expect(hasWriteAccess(null)).toBe(false);
    expect(hasWriteAccess(base, 0)).toBe(false);
  });
});

describe('subscriptionRequiredBody', () => {
  it('carries the code the frontend switches on', () => {
    expect(subscriptionRequiredBody({ ...base, accessUntil: 5, plan: 'trial' }))
      .toEqual({ error: 'subscription_required', accessUntil: 5, plan: 'trial' });
  });
});

describe('daysRemaining', () => {
  const now = 1_000_000_000_000;
  it('rounds a part-day up so "1 day left" never reads as 0', () => {
    expect(daysRemaining(now + DAY + 1, now)).toBe(2);
    expect(daysRemaining(now + 1, now)).toBe(1);
  });
  it('floors at zero once expired', () => {
    expect(daysRemaining(now - DAY, now)).toBe(0);
  });
  it('returns 0 for no entitlement', () => {
    expect(daysRemaining(null, now)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -w packages/shared`
Expected: FAIL — `hasWriteAccess is not a function`, and `./billing` cannot be resolved.

- [ ] **Step 3: Add the Plan type and the Session fields**

In `packages/shared/src/authTypes.ts`, replace the `Session` interface at the bottom of the file:

```ts
export type Plan = 'trial' | 'individual' | 'org' | 'none';

/** Safe subset sent to the client (no password). */
export interface Session {
  userId: string;
  username: string;
  domain: Domain;
  /**
   * Epoch milliseconds. Write access is granted while now < accessUntil.
   * null means no entitlement — including legacy tokens issued before billing.
   */
  accessUntil: number | null;
  plan: Plan;
}
```

- [ ] **Step 4: Create the client-safe billing helper**

Create `packages/shared/src/billing.ts`:

```ts
// Client-safe billing helpers. No node:crypto — importable from React components.

const DAY_MS = 86_400_000;

/**
 * Whole days of access left, rounded up so a part-day never reads as "0 days".
 * Returns 0 once expired or when there is no entitlement at all.
 */
export function daysRemaining(accessUntil: number | null, now: number = Date.now()): number {
  if (accessUntil === null) return 0;
  return Math.max(0, Math.ceil((accessUntil - now) / DAY_MS));
}
```

Add to `packages/shared/src/index.ts`:

```ts
export * from './billing';
```

- [ ] **Step 5: Decode entitlement in verifySession and add the helpers**

In `packages/shared/src/session.ts`, change the import on line 6 and replace `verifySession`:

```ts
import type { Plan, Session } from './authTypes';
```

```ts
const PLANS: readonly string[] = ['trial', 'individual', 'org', 'none'];

/** A session token never carries a `scope` field — that marks a file-access token instead. */
export function verifySession(token: string): Session | null {
  const d = decodeToken(token);
  if (!d || 'scope' in d) return null;
  if (typeof d.userId !== 'string' || typeof d.username !== 'string' || typeof d.domain !== 'string') {
    return null;
  }
  // Legacy tokens, issued before billing existed, carry neither field. They stay
  // valid identities so nobody is signed out — but they confer no write access.
  // Treating a missing field as "has access" would make every pre-billing token
  // a permanent paywall bypass, and these tokens never expire. The frontend's
  // /me refresh re-signs them with real entitlement on next load.
  const accessUntil =
    typeof d.accessUntil === 'number' && Number.isFinite(d.accessUntil) ? d.accessUntil : null;
  const plan = typeof d.plan === 'string' && PLANS.includes(d.plan) ? (d.plan as Plan) : 'none';
  return {
    userId: d.userId,
    username: d.username,
    domain: d.domain as Session['domain'],
    accessUntil,
    plan,
  };
}

/** The single write-access decision, shared by all three services. */
export function hasWriteAccess(session: Session | null, now: number = Date.now()): boolean {
  return session !== null && session.accessUntil !== null && now < session.accessUntil;
}

export interface SubscriptionRequiredBody {
  error: 'subscription_required';
  accessUntil: number | null;
  plan: Plan;
}

/**
 * The 403 body every write gate returns. The distinct `error` code is what lets
 * the frontend tell "your trial ended" apart from "you are signed out" — the
 * two must never produce the same UI.
 */
export function subscriptionRequiredBody(session: Session): SubscriptionRequiredBody {
  return { error: 'subscription_required', accessUntil: session.accessUntil, plan: session.plan };
}
```

- [ ] **Step 6: Run the shared tests to verify they pass**

Run: `npm test -w packages/shared`
Expected: PASS.

- [ ] **Step 7: Fix the seven construction sites**

`services/auth-service/src/server.ts` line 147 (inside `/login`) and line 159 (inside `/me`) — add placeholder entitlement. Task 5 replaces both with a real lookup:

```ts
    // Placeholder entitlement — Task 5 resolves this from the database.
    const session = {
      userId: user.id, username: user.username, domain: user.domain,
      accessUntil: null, plan: 'none' as const,
    };
```

`services/auth-service/src/orgRoutes.test.ts` line 19 — org tests need write access, so give them a live entitlement:

```ts
  return { ...u, token: signSession({
    userId: u.id, username: u.username, domain: u.domain,
    accessUntil: Date.now() + 86_400_000, plan: 'individual',
  }) };
```

`services/content-service/src/server.test.ts` line 8, `services/content-service/src/cohort.test.ts` lines 15-16, and `services/files-service/src/server.test.ts` line 10 — same treatment. For example:

```ts
const token = signSession({
  userId: '11111111-1111-1111-1111-111111111111', username: 'alice', domain: 'civil-engineering',
  accessUntil: Date.now() + 86_400_000, plan: 'individual',
});
```

- [ ] **Step 8: Run every workspace's tests**

Run each in turn:

```bash
npm test -w packages/shared
npm test -w services/auth-service
npm test -w services/content-service
npm test -w services/files-service
npm test -w apps/frontend
```

Expected: all PASS. `auth-service` and `content-service` need their `DATABASE_URL` pointing at the corresponding `_test` database — see `.env.example`.

- [ ] **Step 9: Commit**

```bash
git add packages/shared services/auth-service/src/server.ts services/auth-service/src/orgRoutes.test.ts services/content-service/src/server.test.ts services/content-service/src/cohort.test.ts services/files-service/src/server.test.ts
git commit -m "feat(billing): carry entitlement in the session token"
```

---

## Task 2: Billing schema and subscription lookup

**Files:**
- Create: `services/auth-service/db/migrations/0005_billing.sql`
- Create: `services/auth-service/src/subscriptionStore.ts`
- Test: `services/auth-service/src/subscriptionStore.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `Querier`, `SubscriptionRecord`, `SubscriptionStatus`, `BillingPlan`, `BillingEventKind`, `trialDays()`, `createTrialSubscription(userId, client?, now?)`, `findByUser(userId)`, `findByOrg(orgId)`.

- [ ] **Step 1: Write the migration**

Create `services/auth-service/db/migrations/0005_billing.sql`:

```sql
CREATE TABLE subscriptions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES users(id) ON DELETE CASCADE,
  org_id       uuid REFERENCES organisations(id) ON DELETE CASCADE,
  plan         text NOT NULL CHECK (plan IN ('trial','individual','org')),
  status       text NOT NULL CHECK (status IN ('trialing','active','expired','cancelled')),
  access_until timestamptz NOT NULL,
  seats        integer,
  provider     text NOT NULL DEFAULT 'dummy',
  provider_ref text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  -- Exactly one owner: a subscription belongs to a user or an org, never both.
  CHECK ((user_id IS NULL) <> (org_id IS NULL))
);

-- One row per user and per org. Renewals update access_until in place, so
-- entitlement resolution never has to decide which of several rows wins.
CREATE UNIQUE INDEX subscriptions_user_idx ON subscriptions (user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX subscriptions_org_idx  ON subscriptions (org_id)  WHERE org_id IS NOT NULL;

-- Append-only. Never updated or deleted: this is where the history that the
-- single mutable subscription row would otherwise lose is preserved.
CREATE TABLE billing_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid REFERENCES subscriptions(id) ON DELETE CASCADE,
  kind            text NOT NULL CHECK (kind IN
                    ('trial_started','payment_succeeded','payment_failed',
                     'manual_grant','expired','cancelled')),
  amount_minor    integer,
  currency        text,
  provider        text NOT NULL,
  provider_ref    text,
  actor           text NOT NULL,
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX billing_events_subscription_idx ON billing_events (subscription_id, created_at DESC);
-- Callback idempotency is a lookup by provider_ref; real gateways retry webhooks.
CREATE INDEX billing_events_provider_ref_idx ON billing_events (provider_ref) WHERE provider_ref IS NOT NULL;

-- Comp every account that predates billing. Retroactively paywalling people
-- already using www.revisionworks.in would be hostile. The far-future sentinel
-- reuses the normal expiry path instead of a null-means-forever special case,
-- and makes comped accounts visible as a distinct group in the data.
INSERT INTO subscriptions (user_id, plan, status, access_until, provider)
SELECT id, 'individual', 'active', TIMESTAMPTZ '2099-01-01 00:00:00+00', 'dummy'
FROM users;

INSERT INTO billing_events (subscription_id, kind, provider, actor, note)
SELECT id, 'manual_grant', 'dummy', 'system',
       'Comped at billing launch — account predates subscriptions'
FROM subscriptions
WHERE user_id IS NOT NULL;
```

- [ ] **Step 2: Apply the migration to the test database**

```bash
DATABASE_URL=postgres://revision:changeme@127.0.0.1:5433/revision_auth_test npm run db:migrate -w services/auth-service
```

Expected: `applying: 0005_billing.sql`. Substitute the real password from `.env`.

- [ ] **Step 3: Write the failing test**

Create `services/auth-service/src/subscriptionStore.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getPool } from './db';
import { createUser } from './userStore';

beforeEach(async () => {
  await getPool().query('TRUNCATE users, subscriptions, billing_events CASCADE');
});

afterAll(() => getPool().end());

const DAY = 86_400_000;

describe('createTrialSubscription', () => {
  it('starts a trial TRIAL_DAYS from the given clock', async () => {
    const { createTrialSubscription } = await import('./subscriptionStore');
    const user = await createUser('trial-user', 'password123', 'civil-engineering');
    const now = 1_700_000_000_000;

    const sub = await createTrialSubscription(user.id, undefined, now);

    expect(sub.userId).toBe(user.id);
    expect(sub.orgId).toBeNull();
    expect(sub.plan).toBe('trial');
    expect(sub.status).toBe('trialing');
    expect(sub.accessUntil).toBe(now + 14 * DAY);
    expect(sub.seats).toBeNull();
  });

  it('appends a trial_started event', async () => {
    const { createTrialSubscription } = await import('./subscriptionStore');
    const user = await createUser('event-user', 'password123', 'civil-engineering');
    const sub = await createTrialSubscription(user.id);

    const { rows } = await getPool().query(
      'SELECT kind, actor FROM billing_events WHERE subscription_id = $1',
      [sub.id],
    );
    expect(rows).toEqual([{ kind: 'trial_started', actor: 'system' }]);
  });

  it('refuses a second subscription for the same user', async () => {
    const { createTrialSubscription } = await import('./subscriptionStore');
    const user = await createUser('dupe-user', 'password123', 'civil-engineering');
    await createTrialSubscription(user.id);
    await expect(createTrialSubscription(user.id)).rejects.toThrow();
  });
});

describe('findByUser', () => {
  it('returns null when the user has no subscription', async () => {
    const { findByUser } = await import('./subscriptionStore');
    expect(await findByUser('00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  it('round-trips a created subscription', async () => {
    const { createTrialSubscription, findByUser } = await import('./subscriptionStore');
    const user = await createUser('find-user', 'password123', 'civil-engineering');
    const created = await createTrialSubscription(user.id);
    expect(await findByUser(user.id)).toEqual(created);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm test -w services/auth-service -- subscriptionStore`
Expected: FAIL — cannot resolve `./subscriptionStore`.

- [ ] **Step 5: Write the store**

Create `services/auth-service/src/subscriptionStore.ts`:

```ts
// Server-only: subscriptions and the billing ledger (see db/migrations/0005_billing.sql).
import type { QueryResultRow } from 'pg';
import { getPool } from './db';

/**
 * Anything that can run a query — a Pool or a PoolClient. Taking this instead
 * of reaching for getPool() lets callers enrol these writes in their own
 * transaction (registration.ts does exactly that).
 */
export interface Querier {
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: R[] }>;
}

export type BillingPlan = 'trial' | 'individual' | 'org';
export type SubscriptionStatus = 'trialing' | 'active' | 'expired' | 'cancelled';
export type BillingEventKind =
  | 'trial_started' | 'payment_succeeded' | 'payment_failed'
  | 'manual_grant' | 'expired' | 'cancelled';

export interface SubscriptionRecord {
  id: string;
  userId: string | null;
  orgId: string | null;
  plan: BillingPlan;
  status: SubscriptionStatus;
  /** Epoch milliseconds. */
  accessUntil: number;
  seats: number | null;
  provider: string;
  providerRef: string | null;
  createdAt: number;
  updatedAt: number;
}

interface SubscriptionRow extends QueryResultRow {
  id: string;
  user_id: string | null;
  org_id: string | null;
  plan: BillingPlan;
  status: SubscriptionStatus;
  access_until: Date;
  seats: number | null;
  provider: string;
  provider_ref: string | null;
  created_at: Date;
  updated_at: Date;
}

function rowToSubscription(row: SubscriptionRow): SubscriptionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    orgId: row.org_id,
    plan: row.plan,
    status: row.status,
    accessUntil: row.access_until.getTime(),
    seats: row.seats,
    provider: row.provider,
    providerRef: row.provider_ref,
    createdAt: row.created_at.getTime(),
    updatedAt: row.updated_at.getTime(),
  };
}

export function trialDays(): number {
  const raw = Number(process.env.TRIAL_DAYS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 14;
}

/**
 * Opens a trial. `access_until` is stored explicitly rather than derived from
 * users.created_at so a trial can be extended by hand without falsifying a
 * signup date, and so changing TRIAL_DAYS never moves an existing deadline.
 */
export async function createTrialSubscription(
  userId: string,
  client: Querier = getPool(),
  now: number = Date.now(),
): Promise<SubscriptionRecord> {
  const accessUntil = new Date(now + trialDays() * 86_400_000);
  const { rows } = await client.query<SubscriptionRow>(
    `INSERT INTO subscriptions (user_id, plan, status, access_until, provider)
     VALUES ($1, 'trial', 'trialing', $2, 'dummy')
     RETURNING *`,
    [userId, accessUntil],
  );
  const sub = rowToSubscription(rows[0]);
  await client.query(
    `INSERT INTO billing_events (subscription_id, kind, provider, actor, note)
     VALUES ($1, 'trial_started', 'dummy', 'system', $2)`,
    [sub.id, `Trial opened for ${trialDays()} days`],
  );
  return sub;
}

export async function findByUser(userId: string): Promise<SubscriptionRecord | null> {
  const { rows } = await getPool().query<SubscriptionRow>(
    'SELECT * FROM subscriptions WHERE user_id = $1',
    [userId],
  );
  return rows[0] ? rowToSubscription(rows[0]) : null;
}

export async function findByOrg(orgId: string): Promise<SubscriptionRecord | null> {
  const { rows } = await getPool().query<SubscriptionRow>(
    'SELECT * FROM subscriptions WHERE org_id = $1',
    [orgId],
  );
  return rows[0] ? rowToSubscription(rows[0]) : null;
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -w services/auth-service -- subscriptionStore`
Expected: PASS, 5 tests.

- [ ] **Step 7: Commit**

```bash
git add services/auth-service/db/migrations/0005_billing.sql services/auth-service/src/subscriptionStore.ts services/auth-service/src/subscriptionStore.test.ts
git commit -m "feat(billing): subscriptions schema, comp backfill, and lookup"
```

---

## Task 3: Entitlement resolution, extension, and the ledger

**Files:**
- Modify: `services/auth-service/src/subscriptionStore.ts`
- Test: `services/auth-service/src/subscriptionStore.test.ts`

**Interfaces:**
- Consumes: everything Task 2 produced.
- Produces: `Entitlement`, `resolveEntitlement(userId, now?)`, `periodDays()`, `extendAccess(subscriptionId, days, now?)`, `recordEvent(input, client?)`, `hasEventForProviderRef(providerRef)`, `grantAccess(target, days, actor, note, now?)`.

**Design note for the implementer:** access is decided **purely** by `access_until`. `status` is informational — it drives UI copy and future renewal logic, never the access decision. This is why a `cancelled` subscription still works until its paid-for date runs out, which is what users expect from a cancellation.

- [ ] **Step 1: Write the failing tests**

Append to `services/auth-service/src/subscriptionStore.test.ts`:

```ts
import { createOrganisation, createGroup, addMembership } from './orgStore';

async function orgWithMember(userId: string, accessUntil: Date) {
  const org = await createOrganisation('Test Institute', userId);
  const group = await createGroup(org.id, `g-${Math.random().toString(36).slice(2)}`);
  await addMembership(org.id, group.id, userId, 'member');
  await getPool().query(
    `INSERT INTO subscriptions (org_id, plan, status, access_until, seats, provider)
     VALUES ($1, 'org', 'active', $2, 50, 'dummy')`,
    [org.id, accessUntil],
  );
  return org;
}

describe('resolveEntitlement', () => {
  it('returns no access for a user with no subscription', async () => {
    const { resolveEntitlement } = await import('./subscriptionStore');
    expect(await resolveEntitlement('00000000-0000-0000-0000-000000000000'))
      .toEqual({ accessUntil: null, plan: 'none' });
  });

  it('returns the user\'s own trial', async () => {
    const { createTrialSubscription, resolveEntitlement } = await import('./subscriptionStore');
    const user = await createUser('own-sub', 'password123', 'civil-engineering');
    const now = 1_700_000_000_000;
    await createTrialSubscription(user.id, undefined, now);
    expect(await resolveEntitlement(user.id)).toEqual({
      accessUntil: now + 14 * DAY, plan: 'trial',
    });
  });

  it('takes the org licence when it outlasts the personal trial', async () => {
    const { createTrialSubscription, resolveEntitlement } = await import('./subscriptionStore');
    const user = await createUser('org-wins', 'password123', 'civil-engineering');
    const now = 1_700_000_000_000;
    await createTrialSubscription(user.id, undefined, now);
    const orgUntil = new Date(now + 400 * DAY);
    await orgWithMember(user.id, orgUntil);

    expect(await resolveEntitlement(user.id)).toEqual({
      accessUntil: orgUntil.getTime(), plan: 'org',
    });
  });

  it('keeps the personal subscription when it outlasts the org licence', async () => {
    const { createTrialSubscription, extendAccess, findByUser, resolveEntitlement } =
      await import('./subscriptionStore');
    const user = await createUser('user-wins', 'password123', 'civil-engineering');
    const now = 1_700_000_000_000;
    await createTrialSubscription(user.id, undefined, now);
    await orgWithMember(user.id, new Date(now + 2 * DAY));
    const sub = (await findByUser(user.id))!;
    await extendAccess(sub.id, 365, now);

    const result = await resolveEntitlement(user.id);
    expect(result.plan).toBe('trial');
    expect(result.accessUntil).toBeGreaterThan(now + 300 * DAY);
  });
});

describe('extendAccess', () => {
  it('adds to the remaining time when renewing before expiry', async () => {
    const { createTrialSubscription, extendAccess } = await import('./subscriptionStore');
    const user = await createUser('early-renew', 'password123', 'civil-engineering');
    const now = 1_700_000_000_000;
    const sub = await createTrialSubscription(user.id, undefined, now);
    // 14 days left; renewing for 30 must land at 44, not 30.
    const extended = await extendAccess(sub.id, 30, now);
    expect(extended.accessUntil).toBe(now + 44 * DAY);
    expect(extended.status).toBe('active');
  });

  it('starts from today when renewing after expiry', async () => {
    const { createTrialSubscription, extendAccess } = await import('./subscriptionStore');
    const user = await createUser('late-renew', 'password123', 'civil-engineering');
    const start = 1_700_000_000_000;
    const sub = await createTrialSubscription(user.id, undefined, start);
    // 100 days later the trial is long dead; 30 days must run from now,
    // not from the lapsed date (which would grant negative time).
    const later = start + 100 * DAY;
    const extended = await extendAccess(sub.id, 30, later);
    expect(extended.accessUntil).toBe(later + 30 * DAY);
  });
});

describe('the ledger', () => {
  it('reports whether a provider_ref has already been recorded', async () => {
    const { createTrialSubscription, recordEvent, hasEventForProviderRef } =
      await import('./subscriptionStore');
    const user = await createUser('ledger-user', 'password123', 'civil-engineering');
    const sub = await createTrialSubscription(user.id);

    expect(await hasEventForProviderRef('ref-1')).toBe(false);
    await recordEvent({
      subscriptionId: sub.id, kind: 'payment_succeeded', provider: 'dummy',
      providerRef: 'ref-1', actor: 'system', amountMinor: 0, currency: 'INR',
    });
    expect(await hasEventForProviderRef('ref-1')).toBe(true);
  });
});

describe('grantAccess', () => {
  it('extends an existing subscription and logs why', async () => {
    const { createTrialSubscription, grantAccess } = await import('./subscriptionStore');
    const user = await createUser('grant-existing', 'password123', 'civil-engineering');
    const now = 1_700_000_000_000;
    await createTrialSubscription(user.id, undefined, now);

    const sub = await grantAccess({ userId: user.id }, 7, 'admin', 'support gesture', now);
    expect(sub.accessUntil).toBe(now + 21 * DAY);

    const { rows } = await getPool().query(
      `SELECT kind, note FROM billing_events WHERE subscription_id = $1 AND kind = 'manual_grant'`,
      [sub.id],
    );
    expect(rows).toEqual([{ kind: 'manual_grant', note: 'support gesture' }]);
  });

  it('creates a subscription for a user who has none', async () => {
    const { grantAccess } = await import('./subscriptionStore');
    const user = await createUser('grant-fresh', 'password123', 'civil-engineering');
    const now = 1_700_000_000_000;

    const sub = await grantAccess({ userId: user.id }, 30, 'admin', null, now);
    expect(sub.userId).toBe(user.id);
    expect(sub.accessUntil).toBe(now + 30 * DAY);
    expect(sub.status).toBe('active');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -w services/auth-service -- subscriptionStore`
Expected: FAIL — `resolveEntitlement is not a function`.

- [ ] **Step 3: Implement resolution, extension, and the ledger**

Append to `services/auth-service/src/subscriptionStore.ts`:

```ts
import type { Plan } from '@revision-app/shared';

export interface Entitlement {
  /** Epoch milliseconds, or null when the user has no subscription at all. */
  accessUntil: number | null;
  plan: Plan;
}

export function periodDays(): number {
  const raw = Number(process.env.PLAN_PERIOD_DAYS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 30;
}

/**
 * Effective access is the LATER of the user's own subscription and any org
 * they belong to. That way an institute's licence covers its students without
 * touching their personal rows, and a student who separately subscribes keeps
 * access after leaving the institute.
 *
 * Membership in several groups of the same org yields duplicate candidate rows;
 * LIMIT 1 makes that harmless. Access depends only on access_until — `status`
 * is informational, which is why a cancelled subscription still runs out its
 * paid-for time instead of dying on cancellation.
 */
export async function resolveEntitlement(
  userId: string,
  _now: number = Date.now(),
): Promise<Entitlement> {
  const { rows } = await getPool().query<{ plan: BillingPlan; access_until: Date }>(
    `SELECT plan, access_until FROM (
       SELECT s.plan, s.access_until FROM subscriptions s WHERE s.user_id = $1
       UNION ALL
       SELECT s.plan, s.access_until FROM subscriptions s
         JOIN org_memberships m ON m.org_id = s.org_id
        WHERE m.user_id = $1
     ) AS candidates
     ORDER BY access_until DESC
     LIMIT 1`,
    [userId],
  );
  if (!rows[0]) return { accessUntil: null, plan: 'none' };
  return { accessUntil: rows[0].access_until.getTime(), plan: rows[0].plan };
}

/**
 * Renewing early adds to the time already remaining rather than discarding it;
 * renewing after a lapse starts from today rather than back-dating from a dead
 * date. GREATEST is what expresses both cases in one statement.
 */
export async function extendAccess(
  subscriptionId: string,
  days: number,
  now: number = Date.now(),
): Promise<SubscriptionRecord> {
  const { rows } = await getPool().query<SubscriptionRow>(
    `UPDATE subscriptions
        SET access_until = GREATEST(access_until, to_timestamp($3::double precision / 1000))
                           + make_interval(days => $2::int),
            status = 'active',
            updated_at = now()
      WHERE id = $1
      RETURNING *`,
    [subscriptionId, days, now],
  );
  if (!rows[0]) throw new Error('SUBSCRIPTION_NOT_FOUND');
  return rowToSubscription(rows[0]);
}

export interface BillingEventInput {
  subscriptionId: string;
  kind: BillingEventKind;
  provider: string;
  actor: string;
  amountMinor?: number | null;
  currency?: string | null;
  providerRef?: string | null;
  note?: string | null;
}

export async function recordEvent(
  input: BillingEventInput,
  client: Querier = getPool(),
): Promise<void> {
  await client.query(
    `INSERT INTO billing_events
       (subscription_id, kind, amount_minor, currency, provider, provider_ref, actor, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      input.subscriptionId, input.kind, input.amountMinor ?? null, input.currency ?? null,
      input.provider, input.providerRef ?? null, input.actor, input.note ?? null,
    ],
  );
}

/** Callback idempotency: real gateways retry webhooks, so a repeat must not pay twice. */
export async function hasEventForProviderRef(providerRef: string): Promise<boolean> {
  const { rows } = await getPool().query(
    'SELECT 1 FROM billing_events WHERE provider_ref = $1 LIMIT 1',
    [providerRef],
  );
  return rows.length > 0;
}

/**
 * Comp an account or extend a trial by hand. Creates the subscription when the
 * target has none, so it works on any account. Always logs why — a grant with
 * no recoverable reason is a mystery six months later.
 */
export async function grantAccess(
  target: { userId?: string; orgId?: string },
  days: number,
  actor: string,
  note: string | null,
  now: number = Date.now(),
): Promise<SubscriptionRecord> {
  if ((target.userId ? 1 : 0) + (target.orgId ? 1 : 0) !== 1) {
    throw new Error('GRANT_TARGET_INVALID');
  }
  let existing = target.userId
    ? await findByUser(target.userId)
    : await findByOrg(target.orgId!);

  if (!existing) {
    const accessUntil = new Date(now + days * 86_400_000);
    const { rows } = await getPool().query<SubscriptionRow>(
      `INSERT INTO subscriptions (user_id, org_id, plan, status, access_until, provider)
       VALUES ($1, $2, $3, 'active', $4, 'dummy')
       RETURNING *`,
      [target.userId ?? null, target.orgId ?? null, target.orgId ? 'org' : 'individual', accessUntil],
    );
    existing = rowToSubscription(rows[0]);
  } else {
    existing = await extendAccess(existing.id, days, now);
  }

  await recordEvent({
    subscriptionId: existing.id, kind: 'manual_grant', provider: 'dummy',
    actor, note, providerRef: null,
  });
  return existing;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -w services/auth-service -- subscriptionStore`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add services/auth-service/src/subscriptionStore.ts services/auth-service/src/subscriptionStore.test.ts
git commit -m "feat(billing): entitlement resolution, access extension, and the ledger"
```

---

## Task 4: The trial is created with the user, in one transaction

A user row without a subscription row is an account nobody can grant access to through the normal path. The two inserts must therefore succeed or fail together.

**Files:**
- Modify: `services/auth-service/src/userStore.ts`
- Create: `services/auth-service/src/registration.ts`
- Test: `services/auth-service/src/registration.test.ts`
- Modify: `services/auth-service/src/server.ts` (the `/register` handler, line 76)

**Interfaces:**
- Consumes: `createTrialSubscription`, `Querier` (Task 2).
- Produces: `registerUserWithTrial(username, password, domain, email, now?)` returning `Promise<UserRecord>`, throwing `USERNAME_TAKEN` / `EMAIL_TAKEN` exactly as `createUser` does today.

- [ ] **Step 1: Write the failing test**

Create `services/auth-service/src/registration.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getPool } from './db';
import { registerUserWithTrial } from './registration';
import { findByUser } from './subscriptionStore';

beforeEach(async () => {
  await getPool().query('TRUNCATE users, subscriptions, billing_events CASCADE');
});

afterAll(() => getPool().end());

const DAY = 86_400_000;

describe('registerUserWithTrial', () => {
  it('creates the user and their trial together', async () => {
    const now = 1_700_000_000_000;
    const user = await registerUserWithTrial('newbie', 'password123', 'civil-engineering', 'newbie@example.com', now);

    const sub = await findByUser(user.id);
    expect(sub).not.toBeNull();
    expect(sub!.plan).toBe('trial');
    expect(sub!.accessUntil).toBe(now + 14 * DAY);
  });

  it('propagates USERNAME_TAKEN and leaves no partial rows behind', async () => {
    await registerUserWithTrial('taken', 'password123', 'civil-engineering', 'a@example.com');
    await expect(
      registerUserWithTrial('taken', 'password123', 'civil-engineering', 'b@example.com'),
    ).rejects.toThrow('USERNAME_TAKEN');

    const { rows } = await getPool().query('SELECT count(*)::int AS n FROM users');
    expect(rows[0].n).toBe(1);
  });

  it('rolls the user back when the trial insert fails', async () => {
    // A real failure inside the transaction, no mocking: a TRIAL_DAYS this
    // large overflows the JS Date range, so the subscription insert throws
    // while binding its parameter — after the user row has been inserted.
    const original = process.env.TRIAL_DAYS;
    process.env.TRIAL_DAYS = '100000000000';
    try {
      await expect(
        registerUserWithTrial('rollback-me', 'password123', 'civil-engineering', 'r@example.com'),
      ).rejects.toThrow();
    } finally {
      if (original === undefined) delete process.env.TRIAL_DAYS;
      else process.env.TRIAL_DAYS = original;
    }

    // The user insert must have gone with it.
    const { rows } = await getPool().query(
      'SELECT 1 FROM users WHERE username_lower = $1',
      ['rollback-me'],
    );
    expect(rows).toHaveLength(0);
  });

  it('never leaves a user without a subscription', async () => {
    await registerUserWithTrial('paired', 'password123', 'civil-engineering', 'p@example.com');
    const { rows } = await getPool().query(
      'SELECT u.id FROM users u LEFT JOIN subscriptions s ON s.user_id = u.id WHERE s.id IS NULL',
    );
    expect(rows).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w services/auth-service -- registration`
Expected: FAIL — cannot resolve `./registration`.

- [ ] **Step 3: Let createUser join an existing transaction**

In `services/auth-service/src/userStore.ts`, change `createUser` to accept a `Querier`. Import the type and replace the two `getPool()` uses inside the function:

```ts
import type { Querier } from './subscriptionStore';
```

```ts
export async function createUser(
  username: string,
  password: string,
  domain: Domain,
  email?: string | null,
  client: Querier = getPool(),
): Promise<UserRecord> {
  const passwordHash = await hashPassword(password);
  // ON CONFLICT DO NOTHING + RETURNING makes the uniqueness check atomic:
  // under concurrent signups with the same username, exactly one INSERT
  // returns a row and the other returns none — no read-modify-write race.
  try {
    const { rows } = await client.query<UserRow>(
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
```

- [ ] **Step 4: Write the transaction**

Create `services/auth-service/src/registration.ts`:

```ts
// Signup is the one place where two tables must move together: an account
// without a subscription row is an account the billing paths cannot reach.
import { getPool } from './db';
import { createUser } from './userStore';
import { createTrialSubscription } from './subscriptionStore';
import type { Domain, UserRecord } from '@revision-app/shared';

export async function registerUserWithTrial(
  username: string,
  password: string,
  domain: Domain,
  email: string | null,
  now: number = Date.now(),
): Promise<UserRecord> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const user = await createUser(username, password, domain, email, client);
    await createTrialSubscription(user.id, client, now);
    await client.query('COMMIT');
    return user;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -w services/auth-service -- registration`
Expected: PASS, 3 tests.

- [ ] **Step 6: Use it from the register route**

In `services/auth-service/src/server.ts`, replace line 76 inside `app.post('/register')`:

```ts
      const user = await registerUserWithTrial(username.trim(), password, domain as Domain, email.trim());
```

And add the import beside the others at the top:

```ts
import { registerUserWithTrial } from './registration';
```

- [ ] **Step 7: Run the full auth-service suite**

Run: `npm test -w services/auth-service`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add services/auth-service/src/userStore.ts services/auth-service/src/registration.ts services/auth-service/src/registration.test.ts services/auth-service/src/server.ts
git commit -m "feat(billing): open a trial in the same transaction as the account"
```

---

## Task 5: Login and /me sign real entitlement

**Files:**
- Modify: `services/auth-service/src/server.ts` (the `/login` and `/me` handlers)
- Test: `services/auth-service/src/server.test.ts`

**Interfaces:**
- Consumes: `resolveEntitlement` (Task 3), `registerUserWithTrial` (Task 4).
- Produces: `/login` and `/me` responses now carry `accessUntil` and `plan` alongside `token`.

- [ ] **Step 1: Write the failing test**

Append to `services/auth-service/src/server.test.ts`. Note the existing `beforeEach` truncates `users CASCADE` — extend it to `users, subscriptions, billing_events CASCADE` first:

```ts
describe('entitlement in login and /me', () => {
  it('signs a live trial into the login token', async () => {
    await request(app).post('/register').send(REG);
    await request(app).get(`/verify-email?token=${emails.lastToken()}`);

    const res = await request(app).post('/login').send({ username: 'alice', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.plan).toBe('trial');
    expect(res.body.accessUntil).toBeGreaterThan(Date.now());

    const { verifySession, hasWriteAccess } = await import('@revision-app/shared/server');
    const decoded = verifySession(res.body.token);
    expect(decoded!.plan).toBe('trial');
    expect(hasWriteAccess(decoded)).toBe(true);
  });

  it('re-signs a stale legacy token with real entitlement on /me', async () => {
    await request(app).post('/register').send(REG);
    await request(app).get(`/verify-email?token=${emails.lastToken()}`);
    const login = await request(app).post('/login').send({ username: 'alice', password: 'password123' });

    const { signSession, verifySession, hasWriteAccess } = await import('@revision-app/shared/server');
    // A token as it existed before billing: no entitlement fields at all.
    const legacy = signSession({
      userId: login.body.userId, username: 'alice', domain: 'civil-engineering',
    } as never);
    expect(hasWriteAccess(verifySession(legacy))).toBe(false);

    const me = await request(app).get('/me').set('Authorization', `Bearer ${legacy}`);
    expect(me.status).toBe(200);
    expect(hasWriteAccess(verifySession(me.body.token))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w services/auth-service -- server`
Expected: FAIL — `res.body.plan` is `'none'`, not `'trial'`.

- [ ] **Step 3: Resolve entitlement in both handlers**

In `services/auth-service/src/server.ts`, add the import:

```ts
import { resolveEntitlement } from './subscriptionStore';
```

Replace the placeholder block inside `/login` (added in Task 1):

```ts
    const { accessUntil, plan } = await resolveEntitlement(user.id);
    const session = { userId: user.id, username: user.username, domain: user.domain, accessUntil, plan };
    res.json({ ...session, token: signSession(session), fileToken: signFileToken(user.id) });
```

And the equivalent block inside `/me`:

```ts
      const { accessUntil, plan } = await resolveEntitlement(user.id);
      const session = { userId: user.id, username: user.username, domain: user.domain, accessUntil, plan };
      res.json({ ...session, token: signSession(session), fileToken: signFileToken(user.id) });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -w services/auth-service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/auth-service/src/server.ts services/auth-service/src/server.test.ts
git commit -m "feat(billing): sign real entitlement into login and /me tokens"
```

---

## Task 6: The provider interface and the dummy gateway

**Files:**
- Create: `services/auth-service/src/billing/provider.ts`
- Create: `services/auth-service/src/billing/dummyProvider.ts`
- Create: `services/auth-service/src/billing/index.ts`
- Test: `services/auth-service/src/billing/dummyProvider.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `CheckoutInput`, `CallbackResult`, `BillingProvider`, `DummyProvider`, `getProvider()`.

**Design note:** the checkout id is an HMAC-signed payload, not a database row — that is why no `checkouts` table exists. `providerRef` is set to the checkout id itself, which is what makes repeat callbacks idempotent: the same checkout can only ever be recorded once.

- [ ] **Step 1: Write the failing test**

Create `services/auth-service/src/billing/dummyProvider.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DummyProvider } from './dummyProvider';

const INPUT = {
  subscriptionId: '11111111-1111-1111-1111-111111111111',
  plan: 'individual' as const,
  amountMinor: 0,
  currency: 'INR',
};

let provider: DummyProvider;
const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.SESSION_SECRET = 'test-secret-for-dummy-provider';
  provider = new DummyProvider();
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('DummyProvider.createCheckout', () => {
  it('returns a signed checkout id and an in-app redirect', async () => {
    const { checkoutId, redirectUrl } = await provider.createCheckout(INPUT);
    expect(checkoutId).toContain('.');
    expect(redirectUrl).toContain('/billing/checkout?ref=');
    expect(redirectUrl).toContain(encodeURIComponent(checkoutId));
  });
});

describe('DummyProvider.verifyCallback', () => {
  it('accepts its own checkout id and reports success', async () => {
    const { checkoutId } = await provider.createCheckout(INPUT);
    const result = await provider.verifyCallback({ checkoutId, outcome: 'success' }, {});
    expect(result).toEqual({
      checkoutId,
      providerRef: checkoutId,
      status: 'succeeded',
      amountMinor: 0,
      currency: 'INR',
    });
  });

  it('reports failure when the simulated outcome is a failure', async () => {
    const { checkoutId } = await provider.createCheckout(INPUT);
    const result = await provider.verifyCallback({ checkoutId, outcome: 'failure' }, {});
    expect(result!.status).toBe('failed');
  });

  it('rejects a tampered checkout id', async () => {
    const { checkoutId } = await provider.createCheckout(INPUT);
    const tampered = `${checkoutId.slice(0, -2)}xx`;
    expect(await provider.verifyCallback({ checkoutId: tampered, outcome: 'success' }, {})).toBeNull();
  });

  it('rejects junk input', async () => {
    expect(await provider.verifyCallback({}, {})).toBeNull();
    expect(await provider.verifyCallback(null, {})).toBeNull();
  });

  it('refuses to run in production without an explicit opt-in', async () => {
    const { checkoutId } = await provider.createCheckout(INPUT);
    process.env.NODE_ENV = 'production';
    expect(await provider.verifyCallback({ checkoutId, outcome: 'success' }, {})).toBeNull();

    process.env.ALLOW_DUMMY_BILLING = 'true';
    expect(await provider.verifyCallback({ checkoutId, outcome: 'success' }, {})).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w services/auth-service -- dummyProvider`
Expected: FAIL — cannot resolve `./dummyProvider`.

- [ ] **Step 3: Define the interface**

Create `services/auth-service/src/billing/provider.ts`:

```ts
// The whole contract a payment gateway has to satisfy. Two methods: start a
// checkout, and verify what comes back. A real gateway (Razorpay, Stripe) is a
// second file implementing these — createCheckout calls its order API,
// verifyCallback checks its HMAC signature — with no change to the
// entitlement core.

export interface CheckoutInput {
  subscriptionId: string;
  plan: 'individual' | 'org';
  seats?: number;
  amountMinor: number;
  currency: string;
}

export interface CallbackResult {
  checkoutId: string;
  /** The gateway's own reference. Idempotency is keyed on this. */
  providerRef: string;
  status: 'succeeded' | 'failed';
  amountMinor: number;
  currency: string;
}

export interface BillingProvider {
  readonly name: string;
  createCheckout(input: CheckoutInput): Promise<{ checkoutId: string; redirectUrl: string }>;
  verifyCallback(raw: unknown, headers: Record<string, string>): Promise<CallbackResult | null>;
}
```

- [ ] **Step 4: Implement the dummy provider**

Create `services/auth-service/src/billing/dummyProvider.ts`:

```ts
// A gateway that charges nothing and always answers. It exists so the billing
// structure — checkout, callback, extension, ledger — can be built and tested
// before a real provider is onboarded.
import crypto from 'node:crypto';
import type { BillingProvider, CallbackResult, CheckoutInput } from './provider';

interface CheckoutPayload {
  subscriptionId: string;
  plan: 'individual' | 'org';
  seats?: number;
  amountMinor: number;
  currency: string;
  iat: number;
}

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET env var must be set');
  return s;
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

export class DummyProvider implements BillingProvider {
  readonly name = 'dummy';

  /**
   * The checkout id is a signed payload rather than a database row — a real
   * gateway hands you an order id you later verify, and this mirrors that
   * without inventing a table Phase 3 would have to unpick.
   */
  async createCheckout(input: CheckoutInput): Promise<{ checkoutId: string; redirectUrl: string }> {
    const payload: CheckoutPayload = { ...input, iat: Date.now() };
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const checkoutId = `${encoded}.${sign(encoded)}`;
    const frontend = process.env.FRONTEND_URL ?? 'http://127.0.0.1:3200';
    return {
      checkoutId,
      redirectUrl: `${frontend}/billing/checkout?ref=${encodeURIComponent(checkoutId)}`,
    };
  }

  async verifyCallback(raw: unknown, _headers: Record<string, string>): Promise<CallbackResult | null> {
    // Without this guard, deploying ships a free-subscription button to the
    // public internet — www.revisionworks.in is live.
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DUMMY_BILLING !== 'true') {
      console.warn('[billing] dummy provider refused in production; set ALLOW_DUMMY_BILLING=true to override');
      return null;
    }
    if (typeof raw !== 'object' || raw === null) return null;
    const { checkoutId, outcome } = raw as { checkoutId?: unknown; outcome?: unknown };
    if (typeof checkoutId !== 'string') return null;

    const payload = this.decode(checkoutId);
    if (!payload) return null;

    return {
      checkoutId,
      // The checkout id doubles as the provider reference, so a replayed
      // callback collides with the ledger row the first one wrote.
      providerRef: checkoutId,
      status: outcome === 'failure' ? 'failed' : 'succeeded',
      amountMinor: payload.amountMinor,
      currency: payload.currency,
    };
  }

  /** Exposed for the routes, which need the subscription id off a verified checkout. */
  decode(checkoutId: string): CheckoutPayload | null {
    const dot = checkoutId.lastIndexOf('.');
    if (dot < 0) return null;
    const encoded = checkoutId.slice(0, dot);
    const sig = checkoutId.slice(dot + 1);
    const expected = sign(encoded);
    if (
      expected.length !== sig.length ||
      !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
    ) {
      return null;
    }
    try {
      return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as CheckoutPayload;
    } catch {
      return null;
    }
  }
}
```

- [ ] **Step 5: Add the selector**

Create `services/auth-service/src/billing/index.ts`:

```ts
import type { BillingProvider } from './provider';
import { DummyProvider } from './dummyProvider';

export type { BillingProvider, CheckoutInput, CallbackResult } from './provider';
export { DummyProvider } from './dummyProvider';

let cached: BillingProvider | undefined;

/**
 * Phase 3 adds a `case 'razorpay'` here. Nothing else in the service changes.
 */
export function getProvider(): BillingProvider {
  if (cached) return cached;
  const name = process.env.BILLING_PROVIDER ?? 'dummy';
  switch (name) {
    case 'dummy':
      cached = new DummyProvider();
      return cached;
    default:
      throw new Error(`Unknown BILLING_PROVIDER: ${name}`);
  }
}

/** Test seam — the provider caches, and tests flip env vars between cases. */
export function _resetProvider(): void {
  cached = undefined;
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -w services/auth-service -- dummyProvider`
Expected: PASS, 6 tests.

- [ ] **Step 7: Commit**

```bash
git add services/auth-service/src/billing
git commit -m "feat(billing): provider interface and dummy gateway"
```

---

## Task 7: Billing HTTP routes

**Files:**
- Create: `services/auth-service/src/billingRoutes.ts`
- Test: `services/auth-service/src/billingRoutes.test.ts`
- Modify: `services/auth-service/src/server.ts` (mount the router)

**Interfaces:**
- Consumes: `resolveEntitlement`, `findByUser`, `extendAccess`, `recordEvent`, `hasEventForProviderRef`, `periodDays` (Tasks 2-3); `getProvider`, `DummyProvider` (Task 6).
- Produces: `billingRouter()`.

**Mounting order matters.** `orgRouter()` installs a blanket `router.use` middleware that matches every path reaching it, so anything mounted *after* it never runs. `billingRouter()` must be mounted before `orgRouter()` — the same reason `internalRouter()` already is (see the comment at `server.ts:264`).

- [ ] **Step 1: Write the failing test**

Create `services/auth-service/src/billingRoutes.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { getPool } from './db';
import { createApp } from './server';
import { registerUserWithTrial } from './registration';
import { signSession, verifySession, hasWriteAccess } from '@revision-app/shared/server';
import { findByUser } from './subscriptionStore';
import type { EmailSender } from './email';

class NoopSender implements EmailSender {
  async send() {}
}
const app = createApp(new NoopSender());

beforeEach(async () => {
  process.env.SESSION_SECRET = 'test-secret-for-billing-routes';
  process.env.BILLING_PROVIDER = 'dummy';
  delete process.env.NODE_ENV_OVERRIDE;
  await getPool().query('TRUNCATE users, subscriptions, billing_events CASCADE');
});

afterAll(() => getPool().end());

async function signedInUser(name = 'billy') {
  const user = await registerUserWithTrial(name, 'password123', 'civil-engineering', `${name}@example.com`);
  const { accessUntil, plan } = await (await import('./subscriptionStore')).resolveEntitlement(user.id);
  const token = signSession({ userId: user.id, username: user.username, domain: user.domain, accessUntil, plan });
  return { user, token };
}

describe('GET /billing/status', () => {
  it('reports the trial, its days remaining, and write access', async () => {
    const { token } = await signedInUser();
    const res = await request(app).get('/billing/status').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.plan).toBe('trial');
    expect(res.body.status).toBe('trialing');
    expect(res.body.daysRemaining).toBe(14);
    expect(res.body.canWrite).toBe(true);
  });

  it('401s without a session', async () => {
    expect((await request(app).get('/billing/status')).status).toBe(401);
  });
});

describe('POST /billing/checkout', () => {
  it('returns a redirect url for a valid plan', async () => {
    const { token } = await signedInUser();
    const res = await request(app).post('/billing/checkout')
      .set('Authorization', `Bearer ${token}`).send({ plan: 'individual' });
    expect(res.status).toBe(200);
    expect(res.body.redirectUrl).toContain('/billing/checkout?ref=');
    expect(typeof res.body.checkoutId).toBe('string');
  });

  it('rejects an unknown plan', async () => {
    const { token } = await signedInUser();
    const res = await request(app).post('/billing/checkout')
      .set('Authorization', `Bearer ${token}`).send({ plan: 'lifetime' });
    expect(res.status).toBe(400);
  });
});

describe('POST /billing/callback', () => {
  it('extends access, logs the payment, and returns a fresh token', async () => {
    const { user, token } = await signedInUser();
    const before = (await findByUser(user.id))!;

    const checkout = await request(app).post('/billing/checkout')
      .set('Authorization', `Bearer ${token}`).send({ plan: 'individual' });

    const res = await request(app).post('/billing/callback')
      .set('Authorization', `Bearer ${token}`)
      .send({ checkoutId: checkout.body.checkoutId, outcome: 'success' });

    expect(res.status).toBe(200);
    const after = (await findByUser(user.id))!;
    expect(after.accessUntil).toBe(before.accessUntil + 30 * 86_400_000);
    expect(after.status).toBe('active');

    const fresh = verifySession(res.body.token);
    expect(hasWriteAccess(fresh)).toBe(true);
    expect(fresh!.plan).toBe('individual');

    const { rows } = await getPool().query(
      `SELECT kind FROM billing_events WHERE subscription_id = $1 AND kind = 'payment_succeeded'`,
      [after.id],
    );
    expect(rows).toHaveLength(1);
  });

  it('is idempotent — a replayed callback does not extend access twice', async () => {
    const { user, token } = await signedInUser();
    const checkout = await request(app).post('/billing/checkout')
      .set('Authorization', `Bearer ${token}`).send({ plan: 'individual' });
    const body = { checkoutId: checkout.body.checkoutId, outcome: 'success' };

    await request(app).post('/billing/callback').set('Authorization', `Bearer ${token}`).send(body);
    const once = (await findByUser(user.id))!.accessUntil;
    const replay = await request(app).post('/billing/callback').set('Authorization', `Bearer ${token}`).send(body);

    expect(replay.status).toBe(200);
    expect((await findByUser(user.id))!.accessUntil).toBe(once);
  });

  it('records a failed payment without extending access', async () => {
    const { user, token } = await signedInUser();
    const before = (await findByUser(user.id))!.accessUntil;
    const checkout = await request(app).post('/billing/checkout')
      .set('Authorization', `Bearer ${token}`).send({ plan: 'individual' });

    const res = await request(app).post('/billing/callback')
      .set('Authorization', `Bearer ${token}`)
      .send({ checkoutId: checkout.body.checkoutId, outcome: 'failure' });

    expect(res.status).toBe(402);
    expect((await findByUser(user.id))!.accessUntil).toBe(before);
  });

  it('rejects a forged checkout id', async () => {
    const { token } = await signedInUser();
    const res = await request(app).post('/billing/callback')
      .set('Authorization', `Bearer ${token}`)
      .send({ checkoutId: 'forged.signature', outcome: 'success' });
    expect(res.status).toBe(400);
  });

  it('refuses a checkout belonging to another user', async () => {
    const a = await signedInUser('alice2');
    const b = await signedInUser('bob2');
    const checkout = await request(app).post('/billing/checkout')
      .set('Authorization', `Bearer ${a.token}`).send({ plan: 'individual' });

    const res = await request(app).post('/billing/callback')
      .set('Authorization', `Bearer ${b.token}`)
      .send({ checkoutId: checkout.body.checkoutId, outcome: 'success' });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w services/auth-service -- billingRoutes`
Expected: FAIL — 404 on every billing route.

- [ ] **Step 3: Write the router**

Create `services/auth-service/src/billingRoutes.ts`:

```ts
import express from 'express';
// signSession needs node:crypto, so it comes from /server. daysRemaining is
// pure arithmetic and lives in the client-safe entry.
import { signSession } from '@revision-app/shared/server';
import { daysRemaining } from '@revision-app/shared';
import { sessionFrom } from './session';
import { findById } from './userStore';
import {
  findByUser, resolveEntitlement, extendAccess, recordEvent,
  hasEventForProviderRef, periodDays,
} from './subscriptionStore';
import { getProvider, DummyProvider } from './billing';

function amountMinor(): number {
  const raw = Number(process.env.PLAN_AMOUNT_MINOR);
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 0;
}

function currency(): string {
  return process.env.PLAN_CURRENCY ?? 'INR';
}

export function billingRouter(): express.Router {
  const router = express.Router();

  // Every billing route needs a session but NONE of them is write-gated — a
  // lapsed user must be able to see their status and pay to come back.
  router.use('/billing', (req, res, next) => {
    const session = sessionFrom(req);
    if (!session) return res.status(401).json({ error: 'Not authenticated' });
    res.locals.session = session;
    next();
  });

  const wrap = (fn: express.RequestHandler): express.RequestHandler =>
    async (req, res, next) => {
      try {
        await fn(req, res, next);
      } catch (err) {
        console.error(`[billing] ${req.method} ${req.path}`, err);
        res.status(500).json({ error: 'Server error' });
      }
    };

  router.get('/billing/status', wrap(async (_req, res) => {
    const userId = res.locals.session.userId;
    const { accessUntil, plan } = await resolveEntitlement(userId);
    const own = await findByUser(userId);
    res.json({
      plan,
      status: own?.status ?? null,
      accessUntil,
      daysRemaining: daysRemaining(accessUntil),
      canWrite: accessUntil !== null && Date.now() < accessUntil,
      periodDays: periodDays(),
    });
  }));

  router.post('/billing/checkout', wrap(async (req, res) => {
    const plan = req.body?.plan;
    // Phase 1 sells individual plans only; org seat checkout is Phase 2.
    if (plan !== 'individual') {
      return res.status(400).json({ error: 'Unsupported plan' });
    }
    const subscription = await findByUser(res.locals.session.userId);
    if (!subscription) return res.status(404).json({ error: 'No subscription for this account' });

    const { checkoutId, redirectUrl } = await getProvider().createCheckout({
      subscriptionId: subscription.id,
      plan: 'individual',
      amountMinor: amountMinor(),
      currency: currency(),
    });
    res.json({ checkoutId, redirectUrl });
  }));

  router.post('/billing/callback', wrap(async (req, res) => {
    const provider = getProvider();
    const headers = req.headers as Record<string, string>;
    const result = await provider.verifyCallback(req.body, headers);
    if (!result) return res.status(400).json({ error: 'Invalid callback' });

    const subscription = await findByUser(res.locals.session.userId);
    if (!subscription) return res.status(404).json({ error: 'No subscription for this account' });

    // The checkout was signed against a specific subscription; refuse to apply
    // it to anyone else's, even with a valid session.
    if (provider instanceof DummyProvider) {
      const payload = provider.decode(result.checkoutId);
      if (!payload || payload.subscriptionId !== subscription.id) {
        return res.status(403).json({ error: 'Checkout does not belong to this account' });
      }
    }

    if (result.status === 'failed') {
      await recordEvent({
        subscriptionId: subscription.id, kind: 'payment_failed', provider: provider.name,
        providerRef: result.providerRef, actor: 'system',
        amountMinor: result.amountMinor, currency: result.currency,
      });
      return res.status(402).json({ error: 'Payment failed' });
    }

    // Real gateways retry webhooks. Keying on providerRef means a replay is
    // acknowledged without paying out a second period.
    const alreadyApplied = await hasEventForProviderRef(result.providerRef);
    if (!alreadyApplied) {
      await extendAccess(subscription.id, periodDays());
      await recordEvent({
        subscriptionId: subscription.id, kind: 'payment_succeeded', provider: provider.name,
        providerRef: result.providerRef, actor: 'system',
        amountMinor: result.amountMinor, currency: result.currency,
      });
    }

    // Hand back a token carrying the new entitlement — the old one still says
    // "trial", and the frontend swaps this in immediately.
    const user = await findById(res.locals.session.userId);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    const { accessUntil, plan } = await resolveEntitlement(user.id);
    const session = { userId: user.id, username: user.username, domain: user.domain, accessUntil, plan };
    res.json({ ...session, token: signSession(session) });
  }));

  return router;
}
```

- [ ] **Step 4: Mount the router before orgRouter**

In `services/auth-service/src/server.ts`, add the import and mount it between `internalRouter()` and `orgRouter()`:

```ts
import { billingRouter } from './billingRoutes';
```

```ts
  app.use(internalRouter());

  // Before orgRouter for the same reason internalRouter is: orgRouter's
  // blanket auth middleware matches every path that reaches it, so anything
  // mounted after it never runs.
  app.use(billingRouter());

  app.use(orgRouter());
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -w services/auth-service -- billingRoutes`
Expected: PASS, 9 tests.

- [ ] **Step 6: Run the whole auth suite**

Run: `npm test -w services/auth-service`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add services/auth-service/src/billingRoutes.ts services/auth-service/src/billingRoutes.test.ts services/auth-service/src/server.ts
git commit -m "feat(billing): status, checkout, and callback routes"
```

---

## Task 8: The manual grant route

This is the operationally important one while there are no real subscribers: it is how a trial gets extended or an account comped.

**Files:**
- Modify: `services/auth-service/src/internalRoutes.ts`
- Test: `services/auth-service/src/internalRoutes.test.ts`

**Interfaces:**
- Consumes: `grantAccess` (Task 3).
- Produces: `POST /internal/billing/grant`.

- [ ] **Step 1: Write the failing test**

Append to `services/auth-service/src/internalRoutes.test.ts`. Match the file's existing setup for `SERVICE_SECRET` and app construction:

```ts
describe('POST /internal/billing/grant', () => {
  it('rejects a bad service secret', async () => {
    const res = await request(app).post('/internal/billing/grant')
      .set('X-Service-Secret', 'wrong')
      .send({ userId: '11111111-1111-1111-1111-111111111111', days: 30 });
    expect(res.status).toBe(401);
  });

  it('extends a user and records why', async () => {
    const { registerUserWithTrial } = await import('./registration');
    const { findByUser } = await import('./subscriptionStore');
    const user = await registerUserWithTrial('granted', 'password123', 'civil-engineering', 'g@example.com');
    const before = (await findByUser(user.id))!.accessUntil;

    const res = await request(app).post('/internal/billing/grant')
      .set('X-Service-Secret', process.env.SERVICE_SECRET!)
      .send({ userId: user.id, days: 30, note: 'launch comp' });

    expect(res.status).toBe(200);
    expect(res.body.accessUntil).toBe(before + 30 * 86_400_000);

    const { rows } = await getPool().query(
      `SELECT note FROM billing_events WHERE kind = 'manual_grant' AND subscription_id = $1`,
      [res.body.id],
    );
    expect(rows.map((r) => r.note)).toContain('launch comp');
  });

  it('rejects a request naming neither a user nor an org', async () => {
    const res = await request(app).post('/internal/billing/grant')
      .set('X-Service-Secret', process.env.SERVICE_SECRET!)
      .send({ days: 30 });
    expect(res.status).toBe(400);
  });

  it('rejects a non-positive day count', async () => {
    const res = await request(app).post('/internal/billing/grant')
      .set('X-Service-Secret', process.env.SERVICE_SECRET!)
      .send({ userId: '11111111-1111-1111-1111-111111111111', days: 0 });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w services/auth-service -- internalRoutes`
Expected: FAIL — 404 on the grant route.

- [ ] **Step 3: Add the route**

In `services/auth-service/src/internalRoutes.ts`, add the import and the route inside `internalRouter()`, after the existing roster route:

```ts
import { grantAccess } from './subscriptionStore';
```

```ts
  // How a trial gets extended or an account comped by hand. Always writes a
  // manual_grant event — a grant with no recoverable reason is a mystery six
  // months later.
  router.post('/internal/billing/grant', async (req, res) => {
    const { userId, orgId, days, note } = req.body ?? {};
    const hasOneTarget = (typeof userId === 'string' ? 1 : 0) + (typeof orgId === 'string' ? 1 : 0) === 1;
    if (!hasOneTarget) {
      return res.status(400).json({ error: 'Exactly one of userId or orgId is required' });
    }
    if (typeof days !== 'number' || !Number.isFinite(days) || days <= 0) {
      return res.status(400).json({ error: 'days must be a positive number' });
    }
    try {
      const sub = await grantAccess(
        { userId: typeof userId === 'string' ? userId : undefined,
          orgId: typeof orgId === 'string' ? orgId : undefined },
        Math.floor(days),
        'admin',
        typeof note === 'string' ? note : null,
      );
      res.json(sub);
    } catch (err) {
      console.error('[internal grant]', err);
      res.status(500).json({ error: 'Server error' });
    }
  });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -w services/auth-service -- internalRoutes`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/auth-service/src/internalRoutes.ts services/auth-service/src/internalRoutes.test.ts
git commit -m "feat(billing): internal manual-grant route"
```

---

## Task 9: Gate the content-service write

**Files:**
- Modify: `services/content-service/src/session.ts`
- Modify: `services/content-service/src/server.ts`
- Test: `services/content-service/src/server.test.ts`

**Interfaces:**
- Consumes: `hasWriteAccess`, `subscriptionRequiredBody` (Task 1).
- Produces: `fullSessionFrom(req)` in `session.ts`.

- [ ] **Step 1: Write the failing test**

Append to `services/content-service/src/server.test.ts`:

```ts
describe('the read-only paywall', () => {
  const expiredToken = signSession({
    userId: '22222222-2222-2222-2222-222222222222', username: 'lapsed',
    domain: 'civil-engineering', accessUntil: Date.now() - 1000, plan: 'trial',
  });
  const legacyToken = signSession({
    userId: '33333333-3333-3333-3333-333333333333', username: 'legacy',
    domain: 'civil-engineering',
  } as never);

  it('refuses PUT /app-data with a machine-readable code', async () => {
    const res = await request(app).put('/app-data')
      .set('Authorization', `Bearer ${expiredToken}`)
      .send({ subjects: {}, chapters: {}, topics: {}, subjectOrder: [], tags: {}, tagOrder: [] });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('subscription_required');
    expect(res.body.plan).toBe('trial');
  });

  it('still serves GET /app-data to the same expired user', async () => {
    // Seed data for the expired user through a token that still has access.
    const liveToken = signSession({
      userId: '22222222-2222-2222-2222-222222222222', username: 'lapsed',
      domain: 'civil-engineering', accessUntil: Date.now() + 60_000, plan: 'trial',
    });
    await request(app).put('/app-data').set('Authorization', `Bearer ${liveToken}`)
      .send({ subjects: {}, chapters: {}, topics: {}, subjectOrder: [], tags: {}, tagOrder: [] });

    const res = await request(app).get('/app-data').set('Authorization', `Bearer ${expiredToken}`);
    expect(res.status).toBe(200);
  });

  it('refuses a legacy token that carries no entitlement', async () => {
    const res = await request(app).put('/app-data')
      .set('Authorization', `Bearer ${legacyToken}`)
      .send({ subjects: {}, chapters: {}, topics: {}, subjectOrder: [], tags: {}, tagOrder: [] });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('subscription_required');
  });

  it('still 401s an unauthenticated write — not 403', async () => {
    const res = await request(app).put('/app-data').send({});
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w services/content-service -- server`
Expected: FAIL — the write returns 204, not 403.

- [ ] **Step 3: Expose the full session**

In `services/content-service/src/session.ts`, add alongside the existing `sessionUserId`:

```ts
import type { Session } from '@revision-app/shared';

/**
 * The whole session, entitlement included. `sessionUserId` above stays as-is
 * for the read paths that only need an owner id.
 */
export function fullSessionFrom(req: express.Request): Session | null {
  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  return token ? verifySession(token) : null;
}
```

- [ ] **Step 4: Gate the write**

In `services/content-service/src/server.ts`, update the imports and the `PUT /app-data` handler:

```ts
import { hasWriteAccess, subscriptionRequiredBody } from '@revision-app/shared/server';
import { sessionUserId, fullSessionFrom } from './session';
```

```ts
  app.put('/app-data', async (req, res) => {
    const session = fullSessionFrom(req);
    if (!session) return res.status(401).json({ error: 'Not authenticated' });
    // Reads stay open when a subscription lapses — only writes stop. The
    // distinct 403 code lets the frontend tell "trial ended" from "signed out".
    if (!hasWriteAccess(session)) {
      return res.status(403).json(subscriptionRequiredBody(session));
    }
    const parsed = appDataSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid AppData', issues: parsed.error.issues });
    }
    await writeData(session.userId, parsed.data);
    res.status(204).end();
  });
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -w services/content-service`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add services/content-service/src
git commit -m "feat(billing): read-only paywall on content writes"
```

---

## Task 10: Gate the files-service writes

**Files:**
- Modify: `services/files-service/src/server.ts`
- Test: `services/files-service/src/server.test.ts`

**Interfaces:**
- Consumes: `hasWriteAccess`, `subscriptionRequiredBody` (Task 1).
- Produces: no new exports.

**Behaviour change to be aware of:** `DELETE /:id` currently accepts a file-scoped `?token=`, which contradicts the "file tokens are for reads only" comment in `packages/shared/src/session.ts:71-75`. Gating it on a full session closes that. The frontend never calls DELETE with a file token — it has no client-side delete path at all (`apps/frontend/lib/files/` contains only upload, url, and pdf helpers) — so nothing breaks.

`POST /gc` stays ungated. It is a sweep for unreferenced blobs; a read-only account's referenced set cannot change, so it is a no-op for them anyway.

- [ ] **Step 1: Write the failing test**

Append to `services/files-service/src/server.test.ts`:

```ts
describe('the read-only paywall', () => {
  const expired = signSession({
    userId: 'user-1', username: 'alice', domain: 'civil-engineering',
    accessUntil: Date.now() - 1000, plan: 'trial',
  });

  it('refuses an upload', async () => {
    const res = await request(app).post('/upload')
      .set('Authorization', `Bearer ${expired}`)
      .attach('file', Buffer.from('hello'), { filename: 'a.png', contentType: 'image/png' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('subscription_required');
  });

  it('refuses a delete', async () => {
    const res = await request(app).delete('/abcdefghijklmnopqrstuvwx')
      .set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(403);
  });

  it('still serves a download to the same expired user', async () => {
    const live = signSession({
      userId: 'user-1', username: 'alice', domain: 'civil-engineering',
      accessUntil: Date.now() + 60_000, plan: 'trial',
    });
    const up = await request(app).post('/upload').set('Authorization', `Bearer ${live}`)
      .attach('file', Buffer.from('hello'), { filename: 'a.png', contentType: 'image/png' });
    expect(up.status).toBe(200);

    const res = await request(app).get(`/${up.body.id}`).set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(200);
  });

  it('still 401s an unauthenticated upload — not 403', async () => {
    const res = await request(app).post('/upload')
      .attach('file', Buffer.from('hello'), { filename: 'a.png', contentType: 'image/png' });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w services/files-service`
Expected: FAIL — the upload returns 200.

- [ ] **Step 3: Add the full-session helper and gate both writes**

In `services/files-service/src/server.ts`, extend the imports and add the helper beside the existing `sessionUserId`:

```ts
import { verifySession, verifyFileToken, hasWriteAccess, subscriptionRequiredBody } from '@revision-app/shared/server';
import type { Session } from '@revision-app/shared';
```

```ts
/**
 * The full session, for the write paths. A file-scoped `?token=` deliberately
 * does NOT satisfy this: those tokens are for reads (they travel in <img> URLs,
 * browser history and Referer headers) and carry no entitlement.
 */
function fullSession(req: express.Request): Session | null {
  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  return token ? verifySession(token) : null;
}
```

Replace the opening of `POST /upload`:

```ts
  app.post('/upload', upload.single('file'), async (req, res) => {
    const session = fullSession(req);
    if (!session) return res.status(401).json({ error: 'Not authenticated' });
    if (!hasWriteAccess(session)) return res.status(403).json(subscriptionRequiredBody(session));
    const userId = session.userId;
    const file = req.file;
```

And the opening of `DELETE /:id`:

```ts
  app.delete('/:id', async (req, res) => {
    const session = fullSession(req);
    if (!session) return res.status(401).end();
    if (!hasWriteAccess(session)) return res.status(403).json(subscriptionRequiredBody(session));
    const userId = session.userId;
    if (!isValidBlobId(req.params.id)) return res.status(400).end();
```

Leave `GET /:id` and `POST /gc` using `sessionUserId` unchanged.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -w services/files-service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/files-service/src
git commit -m "feat(billing): read-only paywall on file uploads and deletes"
```

---

## Task 11: Gate the org admin writes

**Files:**
- Modify: `services/auth-service/src/orgRoutes.ts`
- Test: `services/auth-service/src/orgRoutes.test.ts`

**Interfaces:**
- Consumes: `hasWriteAccess`, `subscriptionRequiredBody` (Task 1).
- Produces: no new exports.

**`POST /orgs/join` is deliberately NOT gated.** Joining an organisation is how a student *acquires* access under an institute's licence; gating it would mean an expired student could never accept an invite, which is exactly backwards. The read routes (`GET /me/orgs`, `GET /orgs/:id/groups`) stay open so a lapsed institute's students keep seeing their syllabus.

- [ ] **Step 1: Write the failing test**

Append to `services/auth-service/src/orgRoutes.test.ts`. The file already has `actor(name)` (line 17, creates a user and returns it with a token) and `auth(token)` (line 21, builds the header object) — reuse both. Note that Task 1 already changed `actor` to mint a token *with* write access, so an expired token has to be signed explicitly here:

```ts
describe('the read-only paywall on org writes', () => {
  function expired(u: { id: string; username: string; domain: string }) {
    return signSession({
      userId: u.id, username: u.username, domain: u.domain as never,
      accessUntil: Date.now() - 1000, plan: 'trial',
    });
  }

  it('refuses to create an organisation', async () => {
    const user = await actor('lapsed-admin');
    const res = await request(app).post('/orgs')
      .set(auth(expired(user))).send({ name: 'Late Institute' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('subscription_required');
  });

  it('refuses to issue an invite code', async () => {
    const { group, admin } = await coachedGroup();
    const res = await request(app).post(`/groups/${group.id}/invite-codes`)
      .set(auth(expired(admin))).send({});
    expect(res.status).toBe(403);
  });

  it('still lets an expired student accept an invite', async () => {
    const { invite } = await coachedGroup();
    const student = await actor('lapsed-student');

    const res = await request(app).post('/orgs/join')
      .set(auth(expired(student))).send({ code: invite.code });

    expect(res.status).toBe(200);
  });

  it('still lists memberships for an expired user', async () => {
    const user = await actor('lapsed-reader');
    const res = await request(app).get('/me/orgs').set(auth(expired(user)));
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w services/auth-service -- orgRoutes`
Expected: FAIL — creating the organisation returns 201.

- [ ] **Step 3: Add the guard**

In `services/auth-service/src/orgRoutes.ts`, add the import and the middleware just after `wrap` is defined:

```ts
import { hasWriteAccess, subscriptionRequiredBody } from '@revision-app/shared/server';
```

```ts
  // Applied per route rather than blanket-by-method: explicit is safer against
  // a future route being added without thought, and there are few enough call
  // sites that the repetition costs nothing.
  const requireWrite: express.RequestHandler = (_req, res, next) => {
    if (!hasWriteAccess(res.locals.session)) {
      return res.status(403).json(subscriptionRequiredBody(res.locals.session));
    }
    next();
  };
```

Insert `requireWrite` as the second argument on exactly these six routes:

```ts
  router.post('/orgs', requireWrite, wrap(async (req, res) => {
  router.post('/orgs/:id/groups', requireWrite, wrap(async (req, res) => {
  router.post('/groups/:id/heads', requireWrite, wrap(async (req, res) => {
  router.post('/groups/:id/invite-codes', requireWrite, wrap(async (req, res) => {
  router.delete('/invite-codes/:code', requireWrite, wrap(async (req, res) => {
  router.delete('/groups/:gid/members/:uid', requireWrite, wrap(async (req, res) => {
```

Leave `POST /orgs/join`, `GET /me/orgs`, and `GET /orgs/:id/groups` untouched.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -w services/auth-service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/auth-service/src/orgRoutes.ts services/auth-service/src/orgRoutes.test.ts
git commit -m "feat(billing): read-only paywall on org admin writes"
```

---

## Task 12: Frontend billing proxies and client

**Files:**
- Create: `apps/frontend/app/api/billing/status/route.ts`
- Create: `apps/frontend/app/api/billing/checkout/route.ts`
- Create: `apps/frontend/app/api/billing/callback/route.ts`
- Create: `apps/frontend/lib/billing/client.ts`
- Test: `apps/frontend/lib/billing/client.test.ts`

**Interfaces:**
- Consumes: the auth-service routes from Task 7; `authFetch`, `setStoredToken` from `@/lib/auth/client`.
- Produces: `BillingStatus`, `getBillingStatus()`, `startCheckout(plan)`, `confirmDummyPayment(checkoutId, outcome)`.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/lib/billing/client.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getBillingStatus, startCheckout, confirmDummyPayment } from './client';

const originalFetch = global.fetch;

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockFetch(body: unknown, ok = true, status = 200) {
  global.fetch = vi.fn().mockResolvedValue({
    ok, status, json: async () => body,
  }) as unknown as typeof fetch;
}

describe('getBillingStatus', () => {
  it('returns the parsed status', async () => {
    mockFetch({ plan: 'trial', status: 'trialing', accessUntil: 123, daysRemaining: 9, canWrite: true, periodDays: 30 });
    const status = await getBillingStatus();
    expect(status).toEqual({ plan: 'trial', status: 'trialing', accessUntil: 123, daysRemaining: 9, canWrite: true, periodDays: 30 });
  });

  it('returns null on failure rather than throwing', async () => {
    mockFetch({ error: 'nope' }, false, 401);
    expect(await getBillingStatus()).toBeNull();
  });
});

describe('startCheckout', () => {
  it('returns the redirect url', async () => {
    mockFetch({ checkoutId: 'abc.def', redirectUrl: 'http://x/billing/checkout?ref=abc.def' });
    expect(await startCheckout('individual')).toEqual({ redirectUrl: 'http://x/billing/checkout?ref=abc.def' });
  });

  it('surfaces an error message', async () => {
    mockFetch({ error: 'Unsupported plan' }, false, 400);
    expect(await startCheckout('individual')).toEqual({ error: 'Unsupported plan' });
  });
});

describe('confirmDummyPayment', () => {
  it('stores the fresh token it gets back', async () => {
    mockFetch({ token: 'new-token', plan: 'individual', accessUntil: 999 });
    const result = await confirmDummyPayment('abc.def', 'success');
    expect(result).toEqual({ ok: true });
    expect(window.sessionStorage.getItem('revision_session_token')).toBe('new-token');
  });

  it('reports a declined payment without storing a token', async () => {
    mockFetch({ error: 'Payment failed' }, false, 402);
    expect(await confirmDummyPayment('abc.def', 'failure')).toEqual({ error: 'Payment failed' });
    expect(window.sessionStorage.getItem('revision_session_token')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w apps/frontend -- lib/billing`
Expected: FAIL — cannot resolve `./client`.

- [ ] **Step 3: Write the three proxy routes**

Create `apps/frontend/app/api/billing/status/route.ts`:

```ts
import { proxyRequest } from '@/lib/serviceProxy';

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? 'http://127.0.0.1:4001';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return proxyRequest(req, `${AUTH_SERVICE_URL}/billing/status`);
}
```

Create `apps/frontend/app/api/billing/checkout/route.ts`:

```ts
import { proxyRequest } from '@/lib/serviceProxy';

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? 'http://127.0.0.1:4001';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  return proxyRequest(req, `${AUTH_SERVICE_URL}/billing/checkout`);
}
```

Create `apps/frontend/app/api/billing/callback/route.ts`:

```ts
import { proxyRequest } from '@/lib/serviceProxy';

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? 'http://127.0.0.1:4001';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  return proxyRequest(req, `${AUTH_SERVICE_URL}/billing/callback`);
}
```

- [ ] **Step 4: Write the client**

Create `apps/frontend/lib/billing/client.ts`:

```ts
// Client-side billing helpers — thin fetch wrappers over /api/billing/*.
import type { Plan } from '@revision-app/shared';
import { authFetch, setStoredToken } from '@/lib/auth/client';

export interface BillingStatus {
  plan: Plan;
  status: 'trialing' | 'active' | 'expired' | 'cancelled' | null;
  accessUntil: number | null;
  daysRemaining: number;
  canWrite: boolean;
  periodDays: number;
}

export async function getBillingStatus(): Promise<BillingStatus | null> {
  try {
    const res = await authFetch('/api/billing/status', { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as BillingStatus;
  } catch {
    return null;
  }
}

export async function startCheckout(
  plan: 'individual',
): Promise<{ redirectUrl: string } | { error: string }> {
  try {
    const res = await authFetch('/api/billing/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ plan }),
    });
    const body = (await res.json()) as { redirectUrl?: string; error?: string };
    if (!res.ok || !body.redirectUrl) return { error: body.error ?? 'Could not start checkout' };
    return { redirectUrl: body.redirectUrl };
  } catch {
    return { error: 'Network error' };
  }
}

/**
 * Confirms a dummy checkout and swaps in the freshly signed token. Without that
 * swap the browser would keep sending the pre-payment token, which still says
 * the trial is over.
 */
export async function confirmDummyPayment(
  checkoutId: string,
  outcome: 'success' | 'failure',
): Promise<{ ok: true } | { error: string }> {
  try {
    const res = await authFetch('/api/billing/callback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ checkoutId, outcome }),
    });
    const body = (await res.json()) as { token?: string; error?: string };
    if (!res.ok) return { error: body.error ?? 'Payment failed' };
    if (body.token) setStoredToken(body.token);
    return { ok: true };
  } catch {
    return { error: 'Network error' };
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -w apps/frontend -- lib/billing`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/app/api/billing apps/frontend/lib/billing
git commit -m "feat(billing): frontend billing proxies and client"
```

---

## Task 13: Entitlement context, write guard, and repository handling

**Files:**
- Create: `apps/frontend/lib/billing/writeGuard.ts`
- Test: `apps/frontend/lib/billing/writeGuard.test.ts`
- Create: `apps/frontend/lib/billing/EntitlementProvider.tsx`
- Modify: `apps/frontend/lib/repository/ApiRepository.ts`
- Test: `apps/frontend/lib/repository/ApiRepository.test.ts`
- Modify: `apps/frontend/app/layout.tsx`

**Interfaces:**
- Consumes: `getBillingStatus` (Task 12); `useAuth` from `@/components/AuthProvider`.
- Produces: `setCanWrite(fn)`, `canWriteNow()`, `onSubscriptionRequired(fn)`, `notifySubscriptionRequired(info)`, `SubscriptionRequiredInfo`, `_resetWriteGuard()`, `SubscriptionRequiredError`, `EntitlementProvider`, `useEntitlement()` returning `{ status, canWrite, daysRemaining, plan, loading, refresh }`.

**Why a module-level guard:** `ApiRepository` is a plain class instantiated outside React, so it cannot read context. A tiny module-level cell the provider writes and the repository reads keeps the check available in both worlds without threading a dependency through the whole store. It **defaults to allowing writes** so there is no flash of read-only before entitlement loads — the server is the real boundary, and this is only a courtesy check.

- [ ] **Step 1: Write the failing tests**

Create `apps/frontend/lib/billing/writeGuard.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { setCanWrite, canWriteNow, _resetWriteGuard } from './writeGuard';

beforeEach(() => _resetWriteGuard());

describe('writeGuard', () => {
  it('allows writes before entitlement has loaded', () => {
    expect(canWriteNow()).toBe(true);
  });

  it('reflects the latest value the provider set', () => {
    setCanWrite(() => false);
    expect(canWriteNow()).toBe(false);
    setCanWrite(() => true);
    expect(canWriteNow()).toBe(true);
  });

  it('allows writes again after a reset', () => {
    setCanWrite(() => false);
    _resetWriteGuard();
    expect(canWriteNow()).toBe(true);
  });
});
```

Append to `apps/frontend/lib/repository/ApiRepository.test.ts`:

```ts
import {
  setCanWrite, _resetWriteGuard, SubscriptionRequiredError,
  onSubscriptionRequired, notifySubscriptionRequired,
} from '@/lib/billing/writeGuard';

describe('ApiRepository under a lapsed subscription', () => {
  beforeEach(() => _resetWriteGuard());

  it('refuses to save without making a request', async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    setCanWrite(() => false);

    await expect(new ApiRepository().save({
      subjects: {}, chapters: {}, topics: {}, subjectOrder: [], tags: {}, tagOrder: [],
    })).rejects.toBeInstanceOf(SubscriptionRequiredError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('turns a 403 subscription_required into a typed error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false, status: 403,
      json: async () => ({ error: 'subscription_required', accessUntil: 1, plan: 'trial' }),
    }) as unknown as typeof fetch;

    await expect(new ApiRepository().save({
      subjects: {}, chapters: {}, topics: {}, subjectOrder: [], tags: {}, tagOrder: [],
    })).rejects.toBeInstanceOf(SubscriptionRequiredError);
  });

  it('still throws a plain error for other failures', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false, status: 500, json: async () => ({ error: 'boom' }),
    }) as unknown as typeof fetch;

    await expect(new ApiRepository().save({
      subjects: {}, chapters: {}, topics: {}, subjectOrder: [], tags: {}, tagOrder: [],
    })).rejects.not.toBeInstanceOf(SubscriptionRequiredError);
  });

  it('notifies the provider so a stale token self-corrects', async () => {
    // A token can go stale mid-session: the trial expires while the tab is
    // open. The 403 is the first the client hears of it, so it must trigger a
    // refresh rather than just failing the save.
    const seen: Array<{ accessUntil: number | null; plan: string }> = [];
    onSubscriptionRequired((info) => { seen.push(info); });
    global.fetch = vi.fn().mockResolvedValue({
      ok: false, status: 403,
      json: async () => ({ error: 'subscription_required', accessUntil: 7, plan: 'trial' }),
    }) as unknown as typeof fetch;

    await expect(new ApiRepository().save({
      subjects: {}, chapters: {}, topics: {}, subjectOrder: [], tags: {}, tagOrder: [],
    })).rejects.toBeInstanceOf(SubscriptionRequiredError);

    expect(seen).toEqual([{ accessUntil: 7, plan: 'trial' }]);
  });

  it('drops notifications after a reset', () => {
    const seen: unknown[] = [];
    onSubscriptionRequired(() => seen.push(1));
    _resetWriteGuard();
    notifySubscriptionRequired({ accessUntil: null, plan: 'none' });
    expect(seen).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -w apps/frontend -- writeGuard ApiRepository`
Expected: FAIL — cannot resolve `@/lib/billing/writeGuard`.

- [ ] **Step 3: Write the guard**

Create `apps/frontend/lib/billing/writeGuard.ts`:

```ts
// A one-cell bridge between React context and the plain classes that persist
// data. ApiRepository is constructed outside React and cannot read context, so
// EntitlementProvider publishes the current answer here instead.
//
// Defaults to ALLOWING writes: the server is the real boundary, and defaulting
// to "blocked" would flash a read-only UI at every paying user on page load.

let read: () => boolean = () => true;

export function setCanWrite(fn: () => boolean): void {
  read = fn;
}

export function canWriteNow(): boolean {
  return read();
}

export interface SubscriptionRequiredInfo {
  accessUntil: number | null;
  plan: string;
}

let listener: ((info: SubscriptionRequiredInfo) => void) | null = null;

/**
 * Registered by EntitlementProvider. A token can go stale mid-session — the
 * trial expires while the tab is open — and a server 403 is the first the
 * client hears of it. Routing that back into a refresh is what makes the UI
 * self-correct instead of silently failing saves.
 */
export function onSubscriptionRequired(fn: (info: SubscriptionRequiredInfo) => void): void {
  listener = fn;
}

export function notifySubscriptionRequired(info: SubscriptionRequiredInfo): void {
  listener?.(info);
}

/** Test seam. */
export function _resetWriteGuard(): void {
  read = () => true;
  listener = null;
}

/** Thrown when a write is refused because the subscription has lapsed. */
export class SubscriptionRequiredError extends Error {
  readonly accessUntil: number | null;
  readonly plan: string;

  constructor(accessUntil: number | null = null, plan = 'none') {
    super('Your subscription has ended — the app is read-only until you renew.');
    this.name = 'SubscriptionRequiredError';
    this.accessUntil = accessUntil;
    this.plan = plan;
  }
}
```

- [ ] **Step 4: Teach the repository about it**

Replace `save` in `apps/frontend/lib/repository/ApiRepository.ts` and add the import:

```ts
import {
  canWriteNow, notifySubscriptionRequired, SubscriptionRequiredError,
} from '@/lib/billing/writeGuard';
```

```ts
  async save(data: AppData, opts: { keepalive?: boolean } = {}): Promise<void> {
    // Fail before the request when we already know it will 403 — a lapsed user
    // hammering the network on every keystroke helps nobody.
    if (!canWriteNow()) throw new SubscriptionRequiredError();

    const res = await authFetch(DATA_ENDPOINT, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
      keepalive: opts.keepalive ?? false,
    });
    if (res.status === 403) {
      const body = (await res.json().catch(() => ({}))) as
        { error?: string; accessUntil?: number | null; plan?: string };
      if (body.error === 'subscription_required') {
        const info = { accessUntil: body.accessUntil ?? null, plan: body.plan ?? 'none' };
        // Tell the provider so the UI refreshes into read-only mode rather
        // than leaving the user typing into a page that silently won't save.
        notifySubscriptionRequired(info);
        throw new SubscriptionRequiredError(info.accessUntil, info.plan);
      }
    }
    if (!res.ok) throw new Error(`save failed: ${res.status}`);
  }
```

- [ ] **Step 5: Write the provider**

Create `apps/frontend/lib/billing/EntitlementProvider.tsx`:

```tsx
'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { getBillingStatus, type BillingStatus } from './client';
import { onSubscriptionRequired, setCanWrite } from './writeGuard';

interface EntitlementValue {
  status: BillingStatus | null;
  canWrite: boolean;
  daysRemaining: number;
  plan: string;
  loading: boolean;
  refresh: () => Promise<void>;
}

const EntitlementContext = createContext<EntitlementValue>({
  status: null, canWrite: true, daysRemaining: 0, plan: 'none', loading: true,
  refresh: async () => {},
});

export function useEntitlement() {
  return useContext(EntitlementContext);
}

export function EntitlementProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!session) { setStatus(null); setLoading(false); return; }
    setStatus(await getBillingStatus());
    setLoading(false);
  }, [session]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Publish the answer for ApiRepository, which lives outside React. While
  // status is still null we allow writes — the server enforces regardless.
  const canWrite = status === null ? true : status.canWrite;
  useEffect(() => { setCanWrite(() => canWrite); }, [canWrite]);

  // A server 403 means our picture is stale — the trial expired while this tab
  // was open. Re-fetch so the banner and the disabled affordances catch up.
  useEffect(() => {
    onSubscriptionRequired(() => { void refresh(); });
  }, [refresh]);

  return (
    <EntitlementContext.Provider
      value={{
        status,
        canWrite,
        daysRemaining: status?.daysRemaining ?? 0,
        plan: status?.plan ?? 'none',
        loading,
        refresh,
      }}
    >
      {children}
    </EntitlementContext.Provider>
  );
}
```

- [ ] **Step 6: Mount it**

In `apps/frontend/app/layout.tsx`, add the import and wrap inside `AuthProvider` (it reads the session, so it must be a child):

```tsx
import { EntitlementProvider } from '@/lib/billing/EntitlementProvider';
```

```tsx
          <AuthProvider>
            <EntitlementProvider>
              <StoreHydrator>
                <DndProvider>
                  <AppShell>{children}</AppShell>
                </DndProvider>
              </StoreHydrator>
            </EntitlementProvider>
          </AuthProvider>
```

- [ ] **Step 7: Run the frontend tests**

Run: `npm test -w apps/frontend`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/lib/billing apps/frontend/lib/repository/ApiRepository.ts apps/frontend/lib/repository/ApiRepository.test.ts apps/frontend/app/layout.tsx
git commit -m "feat(billing): entitlement context and repository write guard"
```

---

## Task 14: Read-only mode in the store

Every one of the store's 28 mutating actions funnels through `commit` or `commitSilent` (`apps/frontend/store/useStore.ts:78-85`), and both call `persist()`. Guarding those two plus `undo`/`redo` makes the whole app read-only without touching a single component.

**Files:**
- Modify: `apps/frontend/store/useStore.ts`
- Test: `apps/frontend/store/useStore.test.ts`

**Interfaces:**
- Consumes: `canWriteNow` (Task 13).
- Produces: no new exports. Blocked mutations leave state untouched and persist nothing.

- [ ] **Step 1: Write the failing test**

Append to `apps/frontend/store/useStore.test.ts`:

```ts
import { setCanWrite, _resetWriteGuard } from '@/lib/billing/writeGuard';

describe('read-only mode', () => {
  afterEach(() => _resetWriteGuard());

  it('blocks a structural edit and saves nothing', () => {
    const repo = { load: vi.fn(), save: vi.fn() };
    const useTestStore = createRevisionStore(repo as never);
    setCanWrite(() => false);

    useTestStore.getState().addSubject('Blocked Subject');

    expect(Object.keys(useTestStore.getState().subjects)).toHaveLength(0);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('blocks mark-revised, the action the schedule depends on', () => {
    const repo = { load: vi.fn(), save: vi.fn() };
    const useTestStore = createRevisionStore(repo as never);
    const subjectId = useTestStore.getState().addSubject('S');
    const chapterId = useTestStore.getState().addChapter(subjectId, 'C');
    const topicId = useTestStore.getState().addTopic(chapterId, 'T');
    const before = useTestStore.getState().topics[topicId];

    setCanWrite(() => false);
    useTestStore.getState().markTopicRevised(topicId);

    expect(useTestStore.getState().topics[topicId]).toEqual(before);
  });

  it('blocks undo so history cannot be used to rewrite data', () => {
    const repo = { load: vi.fn(), save: vi.fn() };
    const useTestStore = createRevisionStore(repo as never);
    useTestStore.getState().addSubject('Kept');
    const after = useTestStore.getState().subjectOrder;

    setCanWrite(() => false);
    useTestStore.getState().undo();

    expect(useTestStore.getState().subjectOrder).toEqual(after);
  });

  it('allows everything again once write access returns', () => {
    const repo = { load: vi.fn(), save: vi.fn() };
    const useTestStore = createRevisionStore(repo as never);
    setCanWrite(() => false);
    useTestStore.getState().addSubject('Blocked');
    setCanWrite(() => true);
    useTestStore.getState().addSubject('Allowed');

    expect(Object.values(useTestStore.getState().subjects).map((s) => s.name)).toEqual(['Allowed']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w apps/frontend -- useStore`
Expected: FAIL — the blocked subject is created anyway.

- [ ] **Step 3: Guard the choke points**

In `apps/frontend/store/useStore.ts`, add the import and guard both commit helpers:

```ts
import { canWriteNow } from '@/lib/billing/writeGuard';
```

```ts
    const persist = () => queue.schedule();
    // Every mutating action in this store goes through commit or commitSilent,
    // so guarding the pair puts the whole app into read-only mode when a
    // subscription lapses — no per-component checks, nothing missed.
    // Structural edits: capture an undo snapshot, then apply + persist.
    const commit = (patch: Partial<AppData>) => {
      if (!canWriteNow()) return;
      const prev = snapshot(get());
      set({ ...patch, history: record(get().history, prev) });
      persist();
    };
    // Non-structural edits (notes, mark-revised): apply + persist, no history.
    const commitSilent = (patch: Partial<AppData>) => {
      if (!canWriteNow()) return;
      set(patch);
      persist();
    };
```

Then guard `undo` and `redo` — find them in the returned object and add the same early return as their first line:

```ts
      undo: () => {
        if (!canWriteNow()) return;
        // ... existing body unchanged
      },

      redo: () => {
        if (!canWriteNow()) return;
        // ... existing body unchanged
      },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -w apps/frontend -- useStore`
Expected: PASS.

- [ ] **Step 5: Run the whole frontend suite**

Run: `npm test -w apps/frontend`
Expected: PASS. If any existing test fails because it mutates the store, the cause is a leaked `setCanWrite(() => false)` from a prior test — confirm `_resetWriteGuard()` runs in that file's `afterEach`.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/store/useStore.ts apps/frontend/store/useStore.test.ts
git commit -m "feat(billing): read-only mode at the store's commit choke points"
```

---

## Task 15: The banner, the billing page, and the checkout simulator

**Files:**
- Create: `apps/frontend/components/billing/TrialBanner.tsx`
- Test: `apps/frontend/components/billing/TrialBanner.test.tsx`
- Create: `apps/frontend/app/billing/page.tsx`
- Create: `apps/frontend/app/billing/checkout/page.tsx`
- Modify: `apps/frontend/components/layout/AppShell.tsx`

**Interfaces:**
- Consumes: `useEntitlement` (Task 13), `startCheckout`, `confirmDummyPayment` (Task 12).
- Produces: `TrialBanner`.

**Copy rules:** the banner appears only in the trial's **last five days** — showing it from day one reads as nagging. Once expired it becomes a persistent bar. Both link to `/billing`.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/components/billing/TrialBanner.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrialBanner } from './TrialBanner';

// vi.mock, not vi.spyOn: ES module namespace objects are read-only, so
// spyOn cannot replace an export the component imported statically.
const useEntitlement = vi.fn();
vi.mock('@/lib/billing/EntitlementProvider', () => ({
  useEntitlement: () => useEntitlement(),
}));

function mockEntitlement(over: Record<string, unknown>) {
  useEntitlement.mockReturnValue({
    status: null, canWrite: true, daysRemaining: 0, plan: 'trial', loading: false,
    refresh: async () => {}, ...over,
  });
}

beforeEach(() => useEntitlement.mockReset());

describe('TrialBanner', () => {
  it('stays hidden early in the trial', () => {
    mockEntitlement({ daysRemaining: 12, canWrite: true });
    const { container } = render(<TrialBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('counts down in the last five days', () => {
    mockEntitlement({ daysRemaining: 3, canWrite: true });
    render(<TrialBanner />);
    expect(screen.getByText(/3 days/i)).toBeInTheDocument();
  });

  it('says "1 day" rather than "1 days"', () => {
    mockEntitlement({ daysRemaining: 1, canWrite: true });
    render(<TrialBanner />);
    expect(screen.getByText(/1 day\b/i)).toBeInTheDocument();
  });

  it('shows a persistent read-only bar once access has lapsed', () => {
    mockEntitlement({ daysRemaining: 0, canWrite: false });
    render(<TrialBanner />);
    expect(screen.getByText(/read-only/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /subscribe/i })).toHaveAttribute('href', '/billing');
  });

  it('stays hidden while entitlement is still loading', () => {
    mockEntitlement({ loading: true, canWrite: true, daysRemaining: 0 });
    const { container } = render(<TrialBanner />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w apps/frontend -- TrialBanner`
Expected: FAIL — cannot resolve `./TrialBanner`.

- [ ] **Step 3: Write the banner**

Create `apps/frontend/components/billing/TrialBanner.tsx`:

```tsx
'use client';
import Link from 'next/link';
import { useEntitlement } from '@/lib/billing/EntitlementProvider';

const WARN_WITHIN_DAYS = 5;

export function TrialBanner() {
  const { canWrite, daysRemaining, loading } = useEntitlement();

  if (loading) return null;

  if (!canWrite) {
    return (
      <div
        role="status"
        className="border-b border-line-strong bg-ground-deep px-4 py-2 text-sm text-ink sm:px-6"
      >
        Your access has ended — the app is <strong>read-only</strong>. Everything you have saved is
        still here.{' '}
        <Link href="/billing" className="underline underline-offset-2">
          Subscribe to resume editing
        </Link>
      </div>
    );
  }

  // Silent until the last few days: a countdown from day one is nagging.
  if (daysRemaining > WARN_WITHIN_DAYS || daysRemaining <= 0) return null;

  return (
    <div
      role="status"
      className="border-b border-line px-4 py-2 text-sm text-ink-muted sm:px-6"
    >
      {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'} left in your trial.{' '}
      <Link href="/billing" className="underline underline-offset-2">
        See plans
      </Link>
    </div>
  );
}
```

- [ ] **Step 4: Render it in the shell**

In `apps/frontend/components/layout/AppShell.tsx`, add the import and render the banner directly below the closing `</header>` tag:

```tsx
import { TrialBanner } from '@/components/billing/TrialBanner';
```

```tsx
      </header>
      <TrialBanner />
```

- [ ] **Step 5: Run the banner test to verify it passes**

Run: `npm test -w apps/frontend -- TrialBanner`
Expected: PASS, 5 tests.

- [ ] **Step 6: Write the billing page**

Create `apps/frontend/app/billing/page.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { useEntitlement } from '@/lib/billing/EntitlementProvider';
import { startCheckout } from '@/lib/billing/client';

const PLAN_LABELS: Record<string, string> = {
  trial: 'Free trial',
  individual: 'Individual',
  org: 'Covered by your institute',
  none: 'No active plan',
};

export default function BillingPage() {
  const { status, canWrite, daysRemaining, plan, loading, refresh } = useEntitlement();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upgrade() {
    setBusy(true);
    setError(null);
    const result = await startCheckout('individual');
    if ('error' in result) {
      setError(result.error);
      setBusy(false);
      return;
    }
    window.location.href = result.redirectUrl;
  }

  if (loading) return <main className="p-6">Loading…</main>;

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-xl font-semibold text-ink">Subscription</h1>

      <section className="rounded border border-line p-4">
        <p className="tblabel text-[0.6rem]">Current plan</p>
        <p className="mt-1 text-lg text-ink">{PLAN_LABELS[plan] ?? plan}</p>
        <p className="mt-2 text-sm text-ink-muted">
          {canWrite
            ? `${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'} of access remaining.`
            : 'Access has ended. Your data is safe and still readable — editing is paused.'}
        </p>
      </section>

      {plan !== 'org' && (
        <section className="rounded border border-line p-4">
          <p className="text-ink">
            Continue for another {status?.periodDays ?? 30} days.
          </p>
          <button
            type="button"
            onClick={upgrade}
            disabled={busy}
            className="mt-3 rounded bg-ink px-4 py-2 text-sm text-ground disabled:opacity-50"
          >
            {busy ? 'Starting…' : 'Continue to payment'}
          </button>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </section>
      )}

      <button type="button" onClick={() => void refresh()} className="text-sm underline underline-offset-2">
        Refresh status
      </button>
    </main>
  );
}
```

- [ ] **Step 7: Write the dummy checkout simulator**

Create `apps/frontend/app/billing/checkout/page.tsx`:

```tsx
'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { confirmDummyPayment } from '@/lib/billing/client';
import { useEntitlement } from '@/lib/billing/EntitlementProvider';

function CheckoutInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { refresh } = useEntitlement();
  const checkoutId = params.get('ref') ?? '';
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function simulate(outcome: 'success' | 'failure') {
    setBusy(true);
    setError(null);
    const result = await confirmDummyPayment(checkoutId, outcome);
    if ('error' in result) {
      setError(result.error);
      setBusy(false);
      return;
    }
    await refresh();
    router.push('/billing');
  }

  if (!checkoutId) return <main className="p-6">This checkout link is missing its reference.</main>;

  return (
    <main className="mx-auto max-w-lg space-y-4 p-6">
      <h1 className="text-xl font-semibold text-ink">Test checkout</h1>
      <p className="text-sm text-ink-muted">
        No real payment provider is connected yet. Simulate an outcome to exercise the billing flow.
      </p>
      <div className="flex gap-3">
        <button
          type="button" disabled={busy} onClick={() => void simulate('success')}
          className="rounded bg-ink px-4 py-2 text-sm text-ground disabled:opacity-50"
        >
          Simulate successful payment
        </button>
        <button
          type="button" disabled={busy} onClick={() => void simulate('failure')}
          className="rounded border border-line px-4 py-2 text-sm text-ink disabled:opacity-50"
        >
          Simulate failure
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </main>
  );
}

export default function CheckoutPage() {
  // useSearchParams requires a Suspense boundary in the app router.
  return (
    <Suspense fallback={<main className="p-6">Loading…</main>}>
      <CheckoutInner />
    </Suspense>
  );
}
```

- [ ] **Step 8: Run the frontend suite and a production build**

```bash
npm test -w apps/frontend
npm run build -w apps/frontend
```

Expected: tests PASS and the build succeeds. The build catches server/client boundary mistakes the tests do not.

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/components/billing apps/frontend/app/billing apps/frontend/components/layout/AppShell.tsx
git commit -m "feat(billing): trial banner, billing page, and checkout simulator"
```

---

## Task 16: Configuration and documentation

**Files:**
- Modify: `.env.example`
- Modify: `docker-compose.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes: every env var introduced by Tasks 2, 3, 6, and 7.
- Produces: nothing code-facing.

- [ ] **Step 1: Document the env vars**

Append to `.env.example`:

```bash
# ── Billing (auth-service) ───────────────────────────────────────────────────
# Which gateway implements checkout. Only 'dummy' exists today; a real provider
# is Phase 3 (see docs/superpowers/specs/2026-08-03-payment-gateway-design.md).
BILLING_PROVIDER=dummy

# Free-trial length, in days, applied at registration.
TRIAL_DAYS=14

# How much access one payment buys, in days.
PLAN_PERIOD_DAYS=30

# Price in the currency's minor unit (paise for INR). The dummy provider
# charges nothing; this is what gets written to the billing ledger.
PLAN_AMOUNT_MINOR=0
PLAN_CURRENCY=INR

# DANGER: the dummy provider is a free-subscription button. It refuses to run
# when NODE_ENV=production unless this is explicitly set to true. Leave it
# unset in production until a real gateway replaces the dummy.
# ALLOW_DUMMY_BILLING=false
```

- [ ] **Step 2: Pass them to the container**

In `docker-compose.yml`, add to the `auth-service` service's `environment` list:

```yaml
      - BILLING_PROVIDER=${BILLING_PROVIDER:-dummy}
      - TRIAL_DAYS=${TRIAL_DAYS:-14}
      - PLAN_PERIOD_DAYS=${PLAN_PERIOD_DAYS:-30}
      - PLAN_AMOUNT_MINOR=${PLAN_AMOUNT_MINOR:-0}
      - PLAN_CURRENCY=${PLAN_CURRENCY:-INR}
      - ALLOW_DUMMY_BILLING=${ALLOW_DUMMY_BILLING:-}
```

- [ ] **Step 3: Document the behaviour**

Add a section to `README.md`, after the "How revision scheduling works" section:

```markdown
## Subscriptions and the read-only paywall

Every account opens a `TRIAL_DAYS` free trial at registration (14 days by
default). Entitlement lives in `auth-service` as a `subscriptions` row, is
resolved at login, and is baked into the signed session token as an
`accessUntil` timestamp — so all three services enforce it locally without an
extra network call.

When access lapses the account is **not** locked. The user signs in and reads
everything they have; only writes stop:

| Blocked | Still open |
|---|---|
| `PUT /app-data` | `GET /app-data`, the cohort dashboards |
| `POST /upload`, `DELETE /:id` (files) | file downloads and previews |
| org admin writes | `POST /orgs/join`, membership reads |
| | login, register, password reset, `/billing/*` |

Joining an organisation is never gated: it is how a student acquires access
under an institute's licence.

No real payment provider is connected. `BILLING_PROVIDER=dummy` serves a
simulated checkout at `/billing/checkout`, which **refuses to run in production**
unless `ALLOW_DUMMY_BILLING=true` is set. To comp an account or extend a trial
by hand:

```bash
curl -X POST http://127.0.0.1:4001/internal/billing/grant \
  -H "X-Service-Secret: $SERVICE_SECRET" \
  -H 'content-type: application/json' \
  -d '{"userId":"<uuid>","days":30,"note":"why"}'
```

Accounts created before billing existed were comped by migration `0005` with
access until 2099.
```

- [ ] **Step 4: Verify the migration applies cleanly to a fresh database**

```bash
DATABASE_URL=postgres://revision:changeme@127.0.0.1:5433/revision_auth npm run db:migrate -w services/auth-service
```

Expected: `applying: 0005_billing.sql`, no errors. Substitute the real password.

- [ ] **Step 5: Run every suite one final time**

```bash
npm test -w packages/shared
npm test -w services/auth-service
npm test -w services/content-service
npm test -w services/files-service
npm test -w apps/frontend
npm run build -w apps/frontend
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add .env.example docker-compose.yml README.md
git commit -m "docs(billing): document trial, read-only paywall, and manual grants"
```

---

## Definition of done

- A new account gets a 14-day trial written in the same transaction as the user row.
- `GET /billing/status` reports the correct `daysRemaining` throughout that trial.
- When the trial lapses: the user can sign in, read everything, and change nothing — in the UI and against the APIs directly.
- The dummy checkout extends access by 30 days, appends a ledger event, and returns a token that restores write access immediately.
- A replayed callback does not extend access twice.
- The dummy provider refuses to run in production without `ALLOW_DUMMY_BILLING=true`.
- A legacy token carrying no entitlement is a valid identity with no write access.
- A trial expiring while a tab is open turns that tab read-only on the next save attempt, without a reload.
- Existing accounts are comped and unaffected.
- Every workspace's tests pass and the frontend builds.

## Explicitly out of scope

Phase 2 (org seat checkout, seat enforcement at `POST /orgs/join`, org billing admin screen) and Phase 3 (Razorpay adapter, signed webhooks, renewal handling, the Play Billing decision for the TWA). The schema carries `org_id` and `seats` from day one so Phase 2 adds routes and UI rather than a migration.
