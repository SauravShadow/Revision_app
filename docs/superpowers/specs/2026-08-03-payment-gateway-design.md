# Payment gateway and subscription entitlements

**Date:** 2026-08-03
**Status:** Approved, ready for implementation planning (Phase 1)

## Summary

RevisionWorks has no billing of any kind today. This spec adds a subscription
layer with two payer types — individual students and coaching institutes buying
seats — behind a provider-agnostic interface whose first implementation is a
dummy gateway. No real payment provider is wired up. The immediate goal is the
structure plus working trial day-counting, so the real gateway becomes a second
adapter rather than a rewrite when the first paying subscriber appears.

When a trial or subscription lapses, the account does **not** lock. The user
signs in and reads everything they have — subjects, chapters, topics, insights,
attachments — but cannot create, edit, or delete anything, and cannot mark a
topic revised. Their schedule keeps drifting into Overdue while they watch,
which is the conversion pressure.

## Context

Three services, each owning its own Postgres database, sit behind a Next.js 15
frontend. `auth-service` owns users, organisations, groups, memberships, and
invite codes. `content-service` owns per-user revision data. `files-service`
owns attachments.

Two facts about the existing system drive the whole design:

1. **Sessions are stateless HMAC tokens.** `packages/shared/src/session.ts`
   signs and verifies them; every service verifies locally via
   `verifySession`. No service calls `auth-service` to validate a token. Any
   entitlement scheme that requires a network round trip fights this design.

2. **The write surface is tiny.** `content-service` has exactly one mutating
   route, `PUT /app-data`, carrying the entire revision blob. `files-service`
   has `POST /upload` and `DELETE /:id`. `auth-service` has the org-admin
   writes. The complete read-only paywall is therefore a guard on a handful of
   routes, not a sweep through the codebase.

A third fact is a hazard rather than a driver: **tokens carry no expiry**. Once
signed, a token in localStorage is valid forever. Section "Legacy tokens" below
addresses the bypass this would otherwise create.

## Decisions

| Question | Decision |
|---|---|
| Who pays | Both individual students (B2C) and institutes buying seats (B2B) |
| What lapsing does | Read-only access, not a lock |
| Where entitlement lives | `auth-service` / `revision_auth`, alongside users and orgs |
| How it reaches other services | Baked into the signed session token as a timestamp |
| Provider now | Dummy adapter only; no real gateway |
| Existing live users | Comped with far-future access, logged as a manual grant |
| Build order | Phase 1 (individual + trial + dummy) now; org seats and the real gateway later |

### Rejected alternatives

**An entitlement endpoint that `content-service` and `files-service` call per
request, with a cache** — mirrors the existing `authClient.ts` roster pattern
and is always fresh. Rejected because it adds a network hop to every request,
gives `files-service` an outbound dependency it currently does not have at all,
and makes `auth-service` a hard availability dependency for the entire product.
Its freshness advantage only pays off with many fine-grained entitlements
changing constantly; there is one boundary here, and it moves rarely.

**A frontend-only paywall in the app shell** — an afternoon's work, but not
enforcement. Anyone holding a valid token could call `content-service` directly
and keep writing. Unacceptable as an end state when the paywall is the entire
product boundary.

## Data model

New migration: `services/auth-service/db/migrations/0005_billing.sql`, in
`revision_auth`. It belongs here because it needs `users` and `organisations`
as foreign keys, and because entitlement is an identity concern.

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
  CHECK ((user_id IS NULL) <> (org_id IS NULL))
);

CREATE UNIQUE INDEX subscriptions_user_idx ON subscriptions (user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX subscriptions_org_idx  ON subscriptions (org_id)  WHERE org_id IS NOT NULL;

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
```

`seats` is non-null for `plan = 'org'` and null otherwise; this is enforced in
the store rather than by a database constraint, so Phase 2 can adjust seat
semantics without a migration.

`amount_minor` is in paise. `actor` is `'system'`, `'admin'`, or a user id.

**One subscription row per user and per org**, enforced by the partial unique
indexes. Renewals update `access_until` in place rather than inserting rows.
This keeps entitlement resolution to a single lookup with no "which row wins"
logic. The full history is not lost — it lives in `billing_events`, which is
append-only and never updated.

### Trial counting

`access_until` is written at registration, inside the same transaction as the
`users` insert, as `now() + TRIAL_DAYS` where `TRIAL_DAYS` is an environment
variable defaulting to `14`. A `trial_started` event is appended in the same
transaction.

The value is stored explicitly rather than derived from `users.created_at`.
That is what allows a trial to be extended by hand without falsifying a signup
date, and it means changing `TRIAL_DAYS` later does not retroactively move
every existing user's deadline.

Days remaining is computed as `ceil((access_until - now) / 86_400_000)`, floored
at zero.

### Existing users

The migration backfills a subscription row for every existing user:
`plan = 'individual'`, `status = 'active'`, `access_until` set to
`2099-01-01T00:00:00Z`, with a `manual_grant` billing event recording the
reason. These accounts predate billing and are in active use on
www.revisionworks.in; retroactively paywalling them would be hostile.

The far-future sentinel is deliberate — it makes comped accounts visible as a
distinct group in the data, and it reuses the same expiry path as every other
subscription instead of introducing a null-means-forever special case.

## Entitlement resolution

Effective access for a user is **the later of**:

- their own subscription's `access_until`, and
- the `access_until` of any organisation they are a member of.

Taking the later of the two means an institute's licence covers its students
without touching their personal rows, and a student who separately subscribes
keeps access after leaving the institute.

A user with no subscription row at all — which should not occur after the
backfill, but is possible for a row deleted by hand — resolves to no access.
Resolution never throws for a missing row.

Seats are enforced at **invite acceptance** (`POST /orgs/join` refuses when the
org is at its seat limit) rather than by retroactively revoking students when a
licence shrinks. Revoking access mid-term from students who did nothing wrong
is a support burden with no upside. Seat enforcement is Phase 2.

### The session token

`Session` in `packages/shared/src/authTypes.ts` gains two fields:

```ts
export interface Session {
  userId: string;
  username: string;
  domain: Domain;
  /** Epoch milliseconds. Access is granted while Date.now() < accessUntil. */
  accessUntil: number | null;
  plan: 'trial' | 'individual' | 'org' | 'none';
}
```

A **timestamp, not a boolean**. Each service computes expiry locally and
correctly, so a trial ending mid-session takes effect on schedule with no
coordination. The cost is the opposite direction: an upgrade does not appear in
an already-issued token. Two things resolve that, both narrow and explicit:

- `POST /billing/callback` returns a freshly signed token on success, and the
  frontend swaps it in immediately.
- `GET /me` returns a freshly signed token on every call, and the frontend
  calls `/me` on load.

### Legacy tokens

Every currently signed-in user holds a token with no `accessUntil` field, and
those tokens never expire. If `verifySession` treated a missing field as "has
access", any such token would be a permanent paywall bypass — not a transitional
inconvenience.

Therefore: **a missing or malformed `accessUntil` resolves to no write access.**
`verifySession` still accepts the token as a valid identity (the user stays
signed in) but returns `accessUntil: null, plan: 'none'`.

The frontend's automatic `/me` refresh on load re-signs the token with real
entitlement, so a legitimate user never notices. Someone deliberately holding a
stale token gets read-only, which is the correct outcome.

## Enforcement

A helper beside `verifySession` in `packages/shared`:

```ts
export function hasWriteAccess(session: Session, now = Date.now()): boolean;
```

and an Express guard in each service that returns `403` with a
machine-readable body:

```json
{ "error": "subscription_required", "accessUntil": 1767225600000, "plan": "trial" }
```

The distinct `error` code is what lets the frontend tell "your trial ended"
apart from "you are signed out" — the two must not produce the same UI.

Applied **explicitly per route**, not blanket-by-HTTP-method. Explicit is
safer against a future route being added without thought, and there are few
enough call sites that the repetition costs nothing.

### Gated routes

| Service | Route | Gated |
|---|---|---|
| content-service | `PUT /app-data` | yes |
| content-service | `GET /app-data` | no |
| content-service | `GET /cohort/...` (3 routes) | no |
| files-service | `POST /upload` | yes |
| files-service | `DELETE /:id` | yes |
| files-service | `GET /:id` | no |
| files-service | `POST /gc` | no — internal maintenance |
| auth-service | `POST /orgs`, `POST /orgs/:id/groups`, `POST /groups/:id/heads`, `POST /groups/:id/invite-codes`, `DELETE /invite-codes/:code`, `DELETE /groups/:gid/members/:uid` | yes |
| auth-service | `POST /orgs/join` | no — see below |
| auth-service | `GET /me/orgs`, `GET /orgs/:id/groups` | no |
| auth-service | login, register, `/me`, email verification, password reset, logout | no — never gated |

Authentication routes are never gated. A user must always be able to sign in,
recover a password, and reach the billing page; gating those would lock people
out of paying.

`POST /orgs/join` is a write, but it is deliberately **not** gated for the same
reason. Joining an organisation is how a student *acquires* access under an
institute's licence — gating it would mean an expired student could never
accept an invite, which is precisely backwards. It remains subject to Phase 2's
seat limit, which is a separate check.

For an organisation whose licence has lapsed, the admin write routes above lock
but **member reads stay open**. Students must not lose sight of their syllabus
because an institute's card expired.

## Provider abstraction

New directory `services/auth-service/src/billing/`.

```ts
export interface CheckoutInput {
  subscriptionId: string;
  plan: 'individual' | 'org';
  seats?: number;
  amountMinor: number;
  currency: string;
}

export interface CallbackResult {
  checkoutId: string;
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

Two methods is the whole contract. A real gateway is a second file implementing
them — `createCheckout` calls the gateway's order API, `verifyCallback` checks
an HMAC signature — with no change to the entitlement core.

`DummyProvider` (`BILLING_PROVIDER=dummy`, the default) returns a redirect to an
in-app checkout page carrying the checkout id. That page offers "Simulate
successful payment" and "Simulate failure". Confirming posts to
`POST /billing/callback`, which extends `access_until` by the plan period, sets
`status = 'active'`, and appends a `payment_succeeded` event — exactly the path
a real callback will take.

The plan period is `PLAN_PERIOD_DAYS`, an environment variable defaulting to
`30`. Extension is `max(now, access_until) + PLAN_PERIOD_DAYS` — renewing early
adds to the remaining time rather than discarding it, and renewing after expiry
starts from today rather than back-dating from a lapsed date. `amountMinor` in
Phase 1 is a placeholder value from configuration; the dummy provider does not
charge anything, and real pricing is set in Phase 3.

### Production safety

`DummyProvider.verifyCallback` **must refuse** when `NODE_ENV=production`
unless `ALLOW_DUMMY_BILLING=true` is explicitly set, returning null and logging
a warning. Without this guard, deploying ships a free-subscription button to the
public internet, and www.revisionworks.in is live. This is covered by a test.

### Routes

| Route | Purpose |
|---|---|
| `GET /billing/status` | `{ plan, status, accessUntil, daysRemaining, canWrite }` |
| `POST /billing/checkout` | Body `{ plan, seats? }` → `{ redirectUrl }` |
| `POST /billing/callback` | Provider confirmation; extends access, appends ledger event, returns a fresh session token |
| `POST /internal/billing/grant` | Behind `X-Service-Secret`. Body `{ userId or orgId, days, note }`. Comps a user or extends a trial by hand |

`POST /internal/billing/grant` is the operationally important one while there
are no real subscribers: it is how a trial gets extended or an account comped,
and it writes a `manual_grant` event so the reason is recoverable later. It
follows the existing `internalRoutes.ts` shared-secret pattern.

Callbacks are idempotent, keyed on `provider_ref`: a repeated callback for a
`provider_ref` already present in `billing_events` is acknowledged without
extending access a second time. Real gateways retry webhooks, so this matters
before Phase 3, and it is cheap to build now.

## Frontend

The server gate is the real boundary. The frontend's job is to ensure nobody
hits a wall they could not see coming.

Writes funnel through `ApiRepository` → `PUT /app-data`, so there is a single
client-side choke point matching the server's.

- `apps/frontend/lib/billing/` — client for the four routes above.
- A `useEntitlement()` context exposing `canWrite`, `daysRemaining`, `plan`.
  Reads the session token, refreshed via `/me` on load.
- `ApiRepository.save()` refuses when `canWrite` is false and surfaces the
  paywall rather than firing a request that will 403.
- Edit affordances render disabled with a tooltip linking to `/billing`:
  add/edit/delete, drag-and-drop, swipe actions, editor toolbars, and
  **mark-revised**.
- A banner appears during the trial's **last five days** — not from day one,
  which reads as nagging — and becomes a persistent "Trial ended — read-only"
  bar afterwards.
- A new `/billing` page: current plan, days remaining, and the upgrade action.

A 403 `subscription_required` arriving from any request refreshes entitlement
and shows the paywall, so the UI self-corrects if a token goes stale.

## Testing

Vitest against a real Postgres, `TRUNCATE ... CASCADE` in `beforeEach`, and
supertest for HTTP — matching the existing services. Written test-first.

Time is what makes billing tests flaky, so store functions take an optional
`now` parameter defaulting to `Date.now()`. Tests hit the expiry boundary
exactly — one millisecond either side of `access_until` — instead of sleeping.

- `subscriptionStore.test.ts` — trial row created in the same transaction as
  the user; a failed user insert leaves no orphan subscription; resolution
  takes the later of user and org; the expiry boundary itself; a missing row
  resolves to no access without throwing. Extension arithmetic gets its own
  cases both ways: renewing *before* expiry adds to the remaining time, and
  renewing *after* expiry starts from today rather than back-dating.
- `session.test.ts` (`packages/shared`) — a legacy token with no `accessUntil`
  yields `plan: 'none'` and no write access while remaining a valid identity.
  Security-critical.
- `server.test.ts` (auth) — billing routes; the internal grant rejects a bad
  shared secret; callbacks are idempotent on repeated `provider_ref`.
- `server.test.ts` (content) — `PUT /app-data` returns 403 `subscription_required`
  when expired while `GET /app-data` returns 200 in the same state.
- `server.test.ts` (files) — `POST /upload` 403 and `GET /:id` 200 when expired.
- `dummyProvider.test.ts` — checkout → callback extends access and appends the
  event; the production guard refuses without `ALLOW_DUMMY_BILLING`.
- `ApiRepository.test.ts` — `save()` refuses without write access; a 403
  `subscription_required` triggers the paywall rather than a generic error.

## Phasing

### Phase 1 — this plan

Migration and comp backfill; trial on registration; `accessUntil` and `plan` in
the session; `/me` token refresh; `hasWriteAccess` and the route guards;
`DummyProvider` and the four billing routes; the `/billing` page and read-only
UI. Delivers complete day-counting and read-only behaviour with no gateway.

### Phase 2 — organisation seats

Seat-count checkout, seat enforcement at `POST /orgs/join`, and an org billing
admin screen. Deferred because it is the larger half of the surface with no
institute to sell to yet. The `org_id` and `seats` columns exist from day one,
so this adds routes and UI, not a schema rewrite.

### Phase 3 — real gateway

A Razorpay adapter (the natural fit for INR, UPI Autopay, and RBI e-mandate
rules, which Stripe does not serve well in India), signed webhooks, and renewal
and failure handling.

Phase 3 also forces a decision Phase 1 deliberately avoids: the Android TWA
distributes this same web app through the Play Store, and Play's billing policy
applies to digital subscriptions purchased inside it. Options are Play Billing
via the Digital Goods API, India's alternative-billing allowance, or steering
purchases to the web outside the app. Phase 1 ships nothing purchasable, so it
carries no policy exposure — and the provider interface keeps every option open.

## Open questions

None blocking Phase 1. Pricing amounts and plan periods are configuration, not
structure, and can be set when the first real subscriber appears.
