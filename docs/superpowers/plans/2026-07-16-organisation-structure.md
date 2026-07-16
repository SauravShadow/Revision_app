# Organisation Structure & Coaching Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-07-16-organisation-structure-design.md`

**Goal:** Add an organisation layer (organisation → groups → students, invite-code joining) so heads/admins get a cohort coaching dashboard with precomputed stats, without exposing student notes/attachments.

**Architecture:** Org/membership/invite tables live in auth-service (`revision_auth`). Content-service gains denormalized `user_stats` + `user_activity` tables maintained in the same transaction as every `app_data` save, and cohort endpoints that authorize via one new internal auth-service endpoint (`X-Service-Secret`). Frontend proxies through Next API routes as it does today; org management goes in Settings, dashboard at `/coaching` behind a role-gated nav item.

**Tech Stack:** Express 4 + pg (services), Zod-validated shared types in `packages/shared`, Next.js 15 / React 19 frontend, Vitest (+supertest for services, jsdom + testing-library for frontend), Postgres 16 via docker compose.

## Global Constraints

- All packages are ESM (`"type": "module"`); TypeScript strict; Node built-ins via `node:` prefix.
- Postgres 16. Migrations are append-only files under each service's `db/migrations/`, applied by `scripts/migrate.mjs` (tracks `schema_migrations`). Never edit an already-applied migration.
- `org_memberships` uniqueness must use `UNIQUE NULLS NOT DISTINCT` (org-level rows have `group_id NULL`; plain UNIQUE would allow duplicate admin rows). Requires PG ≥ 15 — satisfied.
- Service tests run against real `*_test` databases. Before running a service's tests, apply its migrations to its test DB (commands given per task). Always `set -a; source .env; set +a` from the repo root first (provides `POSTGRES_PASSWORD`, `SESSION_SECRET`).
- Always use `127.0.0.1`, never `localhost`, in URLs and commands.
- Server-side day bucketing (stats histograms, activity days, streaks computed in content-service) uses **UTC** via `utcDayKey`. The browser engine stays local-time. Accepted skew: a student near midnight may see slightly different due counts than their coach. Do not "fix" this mid-implementation.
- Cohort responses are built by **whitelisting** fields. `notes`, `attachments`, `flashcards`, `bookmarkedAt`, `tagIds`, and tag data must never appear in any `/cohort/*` response.
- Fail closed: internal endpoint returns 503 if `SERVICE_SECRET` is unset, 401 on wrong secret; cohort endpoints return 502 if the internal call fails.
- Commit after every task with the message given in its final step.

## File Structure

**packages/shared** (Task 1, 2)
- Create: `src/revision.ts` — pure spaced-repetition math + `activeTopics` + `currentStreak` (single source of truth; frontend re-exports)
- Create: `src/orgTypes.ts` — org/cohort API response types shared by services and frontend
- Modify: `src/index.ts` — export both

**services/auth-service** (Tasks 2–5)
- Create: `db/migrations/0004_organisations.sql`
- Create: `src/orgStore.ts` — organisations/groups/memberships persistence
- Create: `src/inviteStore.ts` — invite code lifecycle + join
- Create: `src/session.ts` — `sessionFrom(req)` extracted from `server.ts`
- Create: `src/orgRoutes.ts` — user-facing org endpoints (router)
- Create: `src/internalRoutes.ts` — service-to-service roster endpoint
- Modify: `src/server.ts` — mount routers, use extracted `sessionFrom`

**services/content-service** (Tasks 6–9)
- Create: `db/migrations/0002_stats.sql`
- Create: `src/stats.ts` — pure derivation (`deriveStats`, `deriveActivity`, `dueCounts`, `utcDayKey`)
- Create: `src/statsStore.ts` — `writeStatsInTx`, `recomputeAllStats`
- Create: `src/backfillStats.ts` — one-off backfill entrypoint (`npm run backfill:stats`)
- Create: `src/authClient.ts` — roster fetch + 60s cache
- Create: `src/session.ts` — `sessionUserId(req)` extracted from `server.ts`
- Create: `src/cohort.ts` — cohort router (summary, students, drill-down)
- Modify: `src/appDataStore.ts` — transactional write incl. stats
- Modify: `src/server.ts` — mount cohort router, use extracted helper
- Modify: `package.json` — `backfill:stats` script

**apps/frontend** (Tasks 10–13)
- Create: proxy routes under `app/api/orgs/…`, `app/api/groups/…`, `app/api/invite-codes/…`, `app/api/cohort/…`
- Create: `lib/orgs/client.ts` (+ test) — typed API wrappers
- Create: `lib/orgs/useMemberships.ts` — membership hook for nav gating
- Create: `components/settings/OrganisationCard.tsx` (+ test)
- Modify: `app/settings/page.tsx` — render the card
- Modify: `components/layout/AppShell.tsx`, `components/layout/MobileNavDrawer.tsx` — role-gated Coaching link
- Create: `app/coaching/page.tsx` (+ test) — dashboard
- Create: `app/coaching/[groupId]/[userId]/page.tsx` (+ test) — drill-down

**infra/docs** (Task 14)
- Modify: `docker-compose.yml`, `.env.example`, `README.md`

---

### Task 1: Shared revision math module

Move the pure spaced-repetition functions into `packages/shared` so content-service can derive stats with the exact ladder/badge logic the frontend uses. Frontend files become re-exports; no import site elsewhere changes.

**Files:**
- Create: `packages/shared/src/revision.ts`
- Create: `packages/shared/src/revision.test.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/frontend/lib/revision/ladder.ts`
- Modify: `apps/frontend/lib/revision/engine.ts`

**Interfaces:**
- Consumes: `Revision`, `Topic`, `AppData` from `packages/shared/src/types.ts`.
- Produces (all exported from `@revision-app/shared`): `LADDER: readonly number[]`, `DAY_MS: number`, `nextInterval(revisionCount: number): number`, `startOfDay(ts: number): number`, `lastRevisedAt(h: Revision[]): number | undefined`, `nextDueDate(h: Revision[]): number | undefined`, `daysSince(h: Revision[], now: number): number | undefined`, `type BadgeState`, `badgeState(h: Revision[], now: number): BadgeState`, `activeTopics(data: AppData): Topic[]`, `currentStreak(data: AppData, now: number): number`.

- [ ] **Step 1: Write the failing test**

`packages/shared/src/revision.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  LADDER, DAY_MS, nextInterval, nextDueDate, badgeState, activeTopics, currentStreak,
} from './revision';
import type { AppData, Revision, Topic } from './types';

const rev = (daysAgo: number, now: number): Revision => ({ id: `r${daysAgo}`, timestamp: now - daysAgo * DAY_MS });

function topic(id: string, chapterId: string, history: Revision[], archivedAt?: number): Topic {
  return {
    id, chapterId, title: id, notes: '', order: 0, difficulty: 'Easy', priority: 'Low',
    revisionHistory: history, createdAt: 0, updatedAt: 0, ...(archivedAt ? { archivedAt } : {}),
  };
}

function appData(topics: Topic[]): AppData {
  return {
    subjects: { s1: { id: 's1', name: 'Soil', color: '', icon: '', order: 0, chapterIds: ['c1'] } },
    chapters: { c1: { id: 'c1', subjectId: 's1', name: 'Ch1', order: 0, difficulty: 'Easy', priority: 'Low', topicIds: topics.map((t) => t.id) } },
    topics: Object.fromEntries(topics.map((t) => [t.id, t])),
    subjectOrder: ['s1'], tags: {}, tagOrder: [],
  };
}

describe('revision math', () => {
  it('walks the interval ladder', () => {
    expect(nextInterval(0)).toBe(LADDER[0]);
    expect(nextInterval(1)).toBe(1);
    expect(nextInterval(2)).toBe(3);
    expect(nextInterval(99)).toBe(90);
  });

  it('computes next due date from the last revision', () => {
    const now = Date.UTC(2026, 6, 16, 12);
    const h = [rev(2, now)]; // 1 revision → +1 day interval, so due yesterday
    expect(nextDueDate(h)).toBe(now - 2 * DAY_MS + 1 * DAY_MS);
  });

  it('classifies badge states', () => {
    const now = Date.UTC(2026, 6, 16, 12);
    expect(badgeState([], now)).toBe('NeverRevised');
    expect(badgeState([rev(3, now)], now)).toBe('Overdue');   // due 2 days ago
    expect(badgeState([rev(1, now)], now)).toBe('DueToday');  // 1 rev, +1d
  });

  it('activeTopics skips archived topics, chapters, and subjects', () => {
    const now = Date.now();
    const data = appData([topic('t1', 'c1', []), topic('t2', 'c1', [], now)]);
    expect(activeTopics(data).map((t) => t.id)).toEqual(['t1']);
    data.chapters.c1.archivedAt = now;
    expect(activeTopics(data)).toEqual([]);
  });

  it('counts a streak of consecutive revised days ending today or yesterday', () => {
    const now = Date.now();
    const data = appData([topic('t1', 'c1', [rev(2, now), rev(1, now), rev(0, now)])]);
    expect(currentStreak(data, now)).toBe(3);
    const stale = appData([topic('t1', 'c1', [rev(5, now)])]);
    expect(currentStreak(stale, now)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/subaru/projects/revision_app
npm test -w packages/shared
```
Expected: FAIL — `Cannot find module './revision'` (or equivalent).

- [ ] **Step 3: Write the implementation**

`packages/shared/src/revision.ts`:

```ts
// Pure spaced-repetition math — single source of truth for both the browser
// engine (apps/frontend/lib/revision) and content-service stats derivation.
import type { AppData, Revision, Topic } from './types';

export const LADDER: readonly number[] = [1, 3, 7, 16, 35, 60, 90];
export const DAY_MS = 24 * 60 * 60 * 1000;

export function nextInterval(revisionCount: number): number {
  if (revisionCount <= 0) return LADDER[0];
  const idx = Math.min(revisionCount - 1, LADDER.length - 1);
  return LADDER[idx];
}

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function lastRevisedAt(h: Revision[]): number | undefined {
  return h.length === 0 ? undefined : h[h.length - 1].timestamp;
}

export function nextDueDate(h: Revision[]): number | undefined {
  const last = lastRevisedAt(h);
  if (last === undefined) return undefined;
  return last + nextInterval(h.length) * DAY_MS;
}

export function daysSince(h: Revision[], now: number): number | undefined {
  const last = lastRevisedAt(h);
  if (last === undefined) return undefined;
  return Math.floor((now - last) / DAY_MS);
}

export type BadgeState =
  | 'NeverRevised' | 'Overdue' | 'DueToday'
  | 'DueTomorrow' | 'RecentlyRevised' | 'Upcoming';

export function badgeState(h: Revision[], now: number): BadgeState {
  const due = nextDueDate(h);
  if (due === undefined) return 'NeverRevised';
  const dayDiff = Math.round((startOfDay(due) - startOfDay(now)) / DAY_MS);
  if (dayDiff < 0) return 'Overdue';
  if (dayDiff === 0) return 'DueToday';
  const since = daysSince(h, now);
  if (since !== undefined && since <= 1) return 'RecentlyRevised';
  if (dayDiff === 1) return 'DueTomorrow';
  return 'Upcoming';
}

export function activeTopics(data: AppData): Topic[] {
  return Object.values(data.topics).filter((t) => {
    if (t.archivedAt) return false;
    const chapter = data.chapters[t.chapterId];
    if (!chapter || chapter.archivedAt) return false;
    const subject = data.subjects[chapter.subjectId];
    return !!subject && !subject.archivedAt;
  });
}

export function currentStreak(data: AppData, now: number): number {
  const days = new Set<number>();
  for (const topic of activeTopics(data)) {
    for (const rev of topic.revisionHistory) days.add(startOfDay(rev.timestamp));
  }
  const today = startOfDay(now);
  let anchor: number;
  if (days.has(today)) anchor = today;
  else if (days.has(today - DAY_MS)) anchor = today - DAY_MS;
  else return 0;

  let streak = 0;
  let cursor = anchor;
  while (days.has(cursor)) {
    streak += 1;
    cursor -= DAY_MS;
  }
  return streak;
}
```

Note: `cursor -= DAY_MS` (rather than calendar addDays) is safe here because every value in `days` is a `startOfDay` result; across a DST boundary the set simply won't contain the naive value and the streak ends — same behavior the frontend's `addDays` version has in practice. Keep it simple.

Add to `packages/shared/src/index.ts` (after the existing lines):

```ts
export * from './revision';
```

- [ ] **Step 4: Run shared tests — verify pass**

```bash
npm test -w packages/shared
```
Expected: PASS (new file + all existing shared tests).

- [ ] **Step 5: Point the frontend at the shared module**

Replace the whole of `apps/frontend/lib/revision/ladder.ts` with:

```ts
export { LADDER, nextInterval } from '@revision-app/shared';
```

In `apps/frontend/lib/revision/engine.ts`:
1. Delete the local definitions of `startOfDay`, `lastRevisedAt`, `nextDueDate`, `daysSince`, `BadgeState`, `badgeState`, the `const DAY_MS` line, and the `import { nextInterval } from './ladder';` line.
2. Replace the imports at the top with:

```ts
import type { Revision, Topic } from '@revision-app/shared';
import { makeId } from '@revision-app/shared';
import {
  startOfDay, lastRevisedAt, nextDueDate, daysSince, badgeState, DAY_MS,
} from '@revision-app/shared';
export {
  startOfDay, lastRevisedAt, nextDueDate, daysSince, badgeState,
} from '@revision-app/shared';
export type { BadgeState } from '@revision-app/shared';
```

3. Keep `totalRevisions`, `relativeLabel`, `inGoodStanding`, `markRevised`, `deleteRevision`, `updateRevisionTimestamp` exactly as they are (they now use the imported helpers).

- [ ] **Step 6: Run the frontend + full suites**

```bash
npm test -w apps/frontend
npx tsc --noEmit
```
Expected: all frontend tests PASS (engine.test.ts / ladder.test.ts exercise the re-exports); typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add packages/shared apps/frontend/lib/revision
git commit -m "refactor: move pure revision math into packages/shared"
```

---

### Task 2: Org schema + orgStore (auth-service)

**Files:**
- Create: `services/auth-service/db/migrations/0004_organisations.sql`
- Create: `services/auth-service/src/orgStore.ts`
- Create: `services/auth-service/src/orgStore.test.ts`
- Create: `packages/shared/src/orgTypes.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: `getPool()` from `services/auth-service/src/db.ts`; `createUser` from `userStore.ts` (tests only).
- Produces — `packages/shared` types used by every later task:
  - `type OrgRole = 'admin' | 'head' | 'member'`
  - `interface MembershipSummary { orgId: string; orgName: string; groupId: string | null; groupName: string | null; role: OrgRole }`
  - `interface RosterMember { userId: string; username: string }`
  - `interface GroupRoster { requesterRole: 'admin' | 'head' | null; group: { id: string; name: string; orgName: string }; members: RosterMember[] }`
  - `interface SubjectCoverage { subject: string; total: number; revised: number }`
  - `interface CohortStudentRow { userId: string; username: string; hasData: boolean; totalTopics: number; completedTopics: number; completionPct: number; streakDays: number; dueToday: number; overdue: number; subjectCoverage: SubjectCoverage[] }`
  - `interface CohortSummary { group: { id: string; name: string; orgName: string }; totals: { members: number; completionPct: number; dueToday: number; overdue: number }; activity: { day: string; revisions: number }[] }`
  - `interface DrilldownTopic { id: string; title: string; state: string; revisionCount: number; lastRevisedAt: number | null; nextDueAt: number | null }`
  - `interface StudentDrilldown { userId: string; username: string; activity: { day: string; revisions: number }[]; subjects: { id: string; name: string; chapters: { id: string; name: string; topics: DrilldownTopic[] }[] }[] }`
- Produces — `orgStore.ts` functions:
  - `createOrganisation(name: string, creatorId: string): Promise<{ id: string; name: string }>` (also inserts the creator's org-level `admin` membership, one transaction)
  - `createGroup(orgId: string, name: string): Promise<{ id: string; orgId: string; name: string }>` — throws `Error('GROUP_NAME_TAKEN')`
  - `getGroup(groupId: string): Promise<{ id: string; orgId: string; name: string; orgName: string } | null>`
  - `listGroups(orgId: string): Promise<{ id: string; name: string }[]>`
  - `addMembership(orgId: string, groupId: string | null, userId: string, role: OrgRole): Promise<void>` — idempotent (`ON CONFLICT DO NOTHING`)
  - `getOrgRole(orgId: string, userId: string): Promise<'admin' | null>`
  - `getGroupRole(groupId: string, userId: string): Promise<OrgRole | null>` — org-level admin outranks group rows
  - `hasOrgMembership(orgId: string, userId: string): Promise<boolean>`
  - `listMembershipsForUser(userId: string): Promise<MembershipSummary[]>`
  - `listGroupMembers(groupId: string): Promise<RosterMember[]>` — `role = 'member'` rows only, joined to usernames
  - `removeMembership(groupId: string, userId: string): Promise<boolean>`

- [ ] **Step 1: Write the migration**

`services/auth-service/db/migrations/0004_organisations.sql`:

```sql
CREATE TABLE organisations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE org_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

CREATE TABLE org_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  group_id uuid REFERENCES org_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'head', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- NULLS NOT DISTINCT: org-level rows (group_id IS NULL) must also be unique.
  UNIQUE NULLS NOT DISTINCT (org_id, group_id, user_id)
);

CREATE INDEX org_memberships_user_idx ON org_memberships (user_id);
CREATE INDEX org_memberships_group_idx ON org_memberships (group_id);

CREATE TABLE invite_codes (
  code text PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES org_groups(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES users(id),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

- [ ] **Step 2: Apply migrations to dev and test databases**

```bash
cd /home/subaru/projects/revision_app
set -a; source .env; set +a
DATABASE_URL="postgres://revision:${POSTGRES_PASSWORD}@127.0.0.1:5433/revision_auth" npm run db:migrate -w services/auth-service
DATABASE_URL="postgres://revision:${POSTGRES_PASSWORD}@127.0.0.1:5433/revision_auth_test" npm run db:migrate -w services/auth-service
```
Expected: `applying: 0004_organisations.sql` on both (earlier files `skip (already applied)`).

- [ ] **Step 3: Add the shared org types**

`packages/shared/src/orgTypes.ts` — paste the interfaces exactly as listed in this task's **Produces** block above, each with `export`. Then add to `packages/shared/src/index.ts`:

```ts
export * from './orgTypes';
```

- [ ] **Step 4: Write the failing store test**

`services/auth-service/src/orgStore.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getPool } from './db';
import { createUser } from './userStore';
import {
  createOrganisation, createGroup, getGroup, listGroups, addMembership,
  getOrgRole, getGroupRole, hasOrgMembership, listMembershipsForUser,
  listGroupMembers, removeMembership,
} from './orgStore';

beforeEach(async () => {
  await getPool().query('TRUNCATE users CASCADE'); // cascades to org tables via FKs
});
afterAll(() => getPool().end());

async function user(name: string) {
  return createUser(name, 'password123', 'civil-engineering');
}

describe('orgStore', () => {
  it('creates an organisation and makes the creator an org-level admin', async () => {
    const alice = await user('alice');
    const org = await createOrganisation('XYZ Academy', alice.id);
    expect(org.name).toBe('XYZ Academy');
    expect(await getOrgRole(org.id, alice.id)).toBe('admin');
    expect(await getOrgRole(org.id, alice.id)).toBe('admin'); // stable
  });

  it('creates groups, rejects duplicate names per org', async () => {
    const alice = await user('alice');
    const org = await createOrganisation('XYZ', alice.id);
    const g = await createGroup(org.id, 'Batch A');
    expect(g.orgId).toBe(org.id);
    await expect(createGroup(org.id, 'Batch A')).rejects.toThrow('GROUP_NAME_TAKEN');
    expect((await listGroups(org.id)).map((x) => x.name)).toEqual(['Batch A']);
    expect(await getGroup(g.id)).toEqual({ id: g.id, orgId: org.id, name: 'Batch A', orgName: 'XYZ' });
  });

  it('resolves group roles with org admin outranking group rows', async () => {
    const [alice, bob, carol] = [await user('alice'), await user('bob'), await user('carol')];
    const org = await createOrganisation('XYZ', alice.id);
    const g = await createGroup(org.id, 'Batch A');
    await addMembership(org.id, g.id, bob.id, 'head');
    await addMembership(org.id, g.id, carol.id, 'member');
    expect(await getGroupRole(g.id, alice.id)).toBe('admin');  // via org-level row
    expect(await getGroupRole(g.id, bob.id)).toBe('head');
    expect(await getGroupRole(g.id, carol.id)).toBe('member');
    expect(await getGroupRole(g.id, (await user('dave')).id)).toBeNull();
  });

  it('addMembership is idempotent, listGroupMembers returns members only', async () => {
    const alice = await user('alice');
    const carol = await user('carol');
    const org = await createOrganisation('XYZ', alice.id);
    const g = await createGroup(org.id, 'Batch A');
    await addMembership(org.id, g.id, carol.id, 'member');
    await addMembership(org.id, g.id, carol.id, 'member'); // no throw
    const members = await listGroupMembers(g.id);
    expect(members).toEqual([{ userId: carol.id, username: 'carol' }]);
    expect(await hasOrgMembership(org.id, carol.id)).toBe(true);
  });

  it('lists memberships for a user with org and group names', async () => {
    const alice = await user('alice');
    const org = await createOrganisation('XYZ', alice.id);
    const g = await createGroup(org.id, 'Batch A');
    await addMembership(org.id, g.id, alice.id, 'head');
    const ms = await listMembershipsForUser(alice.id);
    expect(ms).toHaveLength(2);
    expect(ms).toContainEqual({ orgId: org.id, orgName: 'XYZ', groupId: null, groupName: null, role: 'admin' });
    expect(ms).toContainEqual({ orgId: org.id, orgName: 'XYZ', groupId: g.id, groupName: 'Batch A', role: 'head' });
  });

  it('removes a group membership', async () => {
    const alice = await user('alice');
    const carol = await user('carol');
    const org = await createOrganisation('XYZ', alice.id);
    const g = await createGroup(org.id, 'Batch A');
    await addMembership(org.id, g.id, carol.id, 'member');
    expect(await removeMembership(g.id, carol.id)).toBe(true);
    expect(await removeMembership(g.id, carol.id)).toBe(false);
    expect(await listGroupMembers(g.id)).toEqual([]);
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

```bash
export DATABASE_URL="postgres://revision:${POSTGRES_PASSWORD}@127.0.0.1:5433/revision_auth_test"
npm test -w services/auth-service
```
Expected: FAIL — `Cannot find module './orgStore'`.

- [ ] **Step 6: Write the implementation**

`services/auth-service/src/orgStore.ts`:

```ts
// Organisations → groups → memberships (see db/migrations/0004_organisations.sql).
import { getPool } from './db';
import type { OrgRole, MembershipSummary, RosterMember } from '@revision-app/shared';

export async function createOrganisation(name: string, creatorId: string): Promise<{ id: string; name: string }> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{ id: string; name: string }>(
      'INSERT INTO organisations (name, created_by) VALUES ($1, $2) RETURNING id, name',
      [name, creatorId],
    );
    await client.query(
      `INSERT INTO org_memberships (org_id, group_id, user_id, role) VALUES ($1, NULL, $2, 'admin')`,
      [rows[0].id, creatorId],
    );
    await client.query('COMMIT');
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

export async function createGroup(orgId: string, name: string): Promise<{ id: string; orgId: string; name: string }> {
  try {
    const { rows } = await getPool().query<{ id: string; org_id: string; name: string }>(
      'INSERT INTO org_groups (org_id, name) VALUES ($1, $2) RETURNING id, org_id, name',
      [orgId, name],
    );
    return { id: rows[0].id, orgId: rows[0].org_id, name: rows[0].name };
  } catch (err) {
    if (isUniqueViolation(err)) throw new Error('GROUP_NAME_TAKEN');
    throw err;
  }
}

export async function getGroup(groupId: string): Promise<{ id: string; orgId: string; name: string; orgName: string } | null> {
  const { rows } = await getPool().query<{ id: string; org_id: string; name: string; org_name: string }>(
    `SELECT g.id, g.org_id, g.name, o.name AS org_name
     FROM org_groups g JOIN organisations o ON o.id = g.org_id
     WHERE g.id = $1`,
    [groupId],
  );
  return rows[0] ? { id: rows[0].id, orgId: rows[0].org_id, name: rows[0].name, orgName: rows[0].org_name } : null;
}

export async function listGroups(orgId: string): Promise<{ id: string; name: string }[]> {
  const { rows } = await getPool().query<{ id: string; name: string }>(
    'SELECT id, name FROM org_groups WHERE org_id = $1 ORDER BY name',
    [orgId],
  );
  return rows;
}

export async function addMembership(orgId: string, groupId: string | null, userId: string, role: OrgRole): Promise<void> {
  await getPool().query(
    `INSERT INTO org_memberships (org_id, group_id, user_id, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (org_id, group_id, user_id) DO NOTHING`,
    [orgId, groupId, userId, role],
  );
}

export async function getOrgRole(orgId: string, userId: string): Promise<'admin' | null> {
  const { rows } = await getPool().query(
    `SELECT 1 FROM org_memberships WHERE org_id = $1 AND user_id = $2 AND group_id IS NULL AND role = 'admin'`,
    [orgId, userId],
  );
  return rows.length > 0 ? 'admin' : null;
}

export async function getGroupRole(groupId: string, userId: string): Promise<OrgRole | null> {
  const { rows } = await getPool().query<{ role: OrgRole }>(
    `SELECT m.role FROM org_memberships m
     JOIN org_groups g ON g.id = $1
     WHERE m.user_id = $2
       AND (m.group_id = g.id OR (m.org_id = g.org_id AND m.group_id IS NULL AND m.role = 'admin'))
     ORDER BY CASE m.role WHEN 'admin' THEN 0 WHEN 'head' THEN 1 ELSE 2 END
     LIMIT 1`,
    [groupId, userId],
  );
  return rows[0]?.role ?? null;
}

export async function hasOrgMembership(orgId: string, userId: string): Promise<boolean> {
  const { rows } = await getPool().query(
    'SELECT 1 FROM org_memberships WHERE org_id = $1 AND user_id = $2 LIMIT 1',
    [orgId, userId],
  );
  return rows.length > 0;
}

export async function listMembershipsForUser(userId: string): Promise<MembershipSummary[]> {
  const { rows } = await getPool().query<{
    org_id: string; org_name: string; group_id: string | null; group_name: string | null; role: OrgRole;
  }>(
    `SELECT m.org_id, o.name AS org_name, m.group_id, g.name AS group_name, m.role
     FROM org_memberships m
     JOIN organisations o ON o.id = m.org_id
     LEFT JOIN org_groups g ON g.id = m.group_id
     WHERE m.user_id = $1
     ORDER BY o.name, g.name NULLS FIRST`,
    [userId],
  );
  return rows.map((r) => ({ orgId: r.org_id, orgName: r.org_name, groupId: r.group_id, groupName: r.group_name, role: r.role }));
}

export async function listGroupMembers(groupId: string): Promise<RosterMember[]> {
  const { rows } = await getPool().query<{ user_id: string; username: string }>(
    `SELECT m.user_id, u.username
     FROM org_memberships m JOIN users u ON u.id = m.user_id
     WHERE m.group_id = $1 AND m.role = 'member'
     ORDER BY u.username_lower`,
    [groupId],
  );
  return rows.map((r) => ({ userId: r.user_id, username: r.username }));
}

export async function removeMembership(groupId: string, userId: string): Promise<boolean> {
  const { rowCount } = await getPool().query(
    'DELETE FROM org_memberships WHERE group_id = $1 AND user_id = $2',
    [groupId, userId],
  );
  return (rowCount ?? 0) > 0;
}
```

- [ ] **Step 7: Run tests — verify pass**

```bash
npm test -w services/auth-service
```
Expected: PASS (new orgStore tests + all existing auth tests).

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src services/auth-service/db services/auth-service/src/orgStore.ts services/auth-service/src/orgStore.test.ts
git commit -m "feat(auth): organisation schema, shared org types, orgStore"
```

---

### Task 3: Invite codes (auth-service)

**Files:**
- Create: `services/auth-service/src/inviteStore.ts`
- Create: `services/auth-service/src/inviteStore.test.ts`

**Interfaces:**
- Consumes: `getPool()` from `./db`; `addMembership`, `getGroup` from `./orgStore` (Task 2); `MembershipSummary` from `@revision-app/shared`.
- Produces:
  - `createInviteCode(groupId: string, createdBy: string, expiresAt?: number | null): Promise<string>` — returns e.g. `"BATCHA-7F3K"`
  - `revokeInviteCode(code: string): Promise<boolean>`
  - `joinByCode(code: string, userId: string): Promise<MembershipSummary>` — throws `Error('CODE_INVALID')` for unknown, revoked, or expired codes (one uniform error; no oracle for which)

- [ ] **Step 1: Write the failing test**

`services/auth-service/src/inviteStore.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getPool } from './db';
import { createUser } from './userStore';
import { createOrganisation, createGroup, listGroupMembers } from './orgStore';
import { createInviteCode, revokeInviteCode, joinByCode } from './inviteStore';

beforeEach(async () => {
  await getPool().query('TRUNCATE users CASCADE');
});
afterAll(() => getPool().end());

async function setup() {
  const admin = await createUser('admin1', 'password123', 'civil-engineering');
  const org = await createOrganisation('XYZ Academy', admin.id);
  const group = await createGroup(org.id, 'Batch A!');
  return { admin, org, group };
}

describe('inviteStore', () => {
  it('generates a readable prefixed code and joins a student through it', async () => {
    const { admin, org, group } = await setup();
    const student = await createUser('student1', 'password123', 'civil-engineering');
    const code = await createInviteCode(group.id, admin.id);
    expect(code).toMatch(/^BATCHA-[A-Z2-9]{4}$/); // name sanitized, unambiguous alphabet
    const membership = await joinByCode(code, student.id);
    expect(membership).toEqual({
      orgId: org.id, orgName: 'XYZ Academy', groupId: group.id, groupName: 'Batch A!', role: 'member',
    });
    expect(await listGroupMembers(group.id)).toEqual([{ userId: student.id, username: 'student1' }]);
  });

  it('joining twice is a no-op returning the same membership', async () => {
    const { admin, group } = await setup();
    const student = await createUser('student1', 'password123', 'civil-engineering');
    const code = await createInviteCode(group.id, admin.id);
    await joinByCode(code, student.id);
    await joinByCode(code, student.id); // no throw
    expect(await listGroupMembers(group.id)).toHaveLength(1);
  });

  it('rejects unknown, revoked, and expired codes with one uniform error', async () => {
    const { admin, group } = await setup();
    const student = await createUser('student1', 'password123', 'civil-engineering');
    await expect(joinByCode('NOPE-XXXX', student.id)).rejects.toThrow('CODE_INVALID');

    const revoked = await createInviteCode(group.id, admin.id);
    expect(await revokeInviteCode(revoked)).toBe(true);
    await expect(joinByCode(revoked, student.id)).rejects.toThrow('CODE_INVALID');

    const expired = await createInviteCode(group.id, admin.id, Date.now() - 1000);
    await expect(joinByCode(expired, student.id)).rejects.toThrow('CODE_INVALID');
  });

  it('revoking an unknown code returns false', async () => {
    await setup();
    expect(await revokeInviteCode('NOPE-XXXX')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/subaru/projects/revision_app
set -a; source .env; set +a
export DATABASE_URL="postgres://revision:${POSTGRES_PASSWORD}@127.0.0.1:5433/revision_auth_test"
npm test -w services/auth-service
```
Expected: FAIL — `Cannot find module './inviteStore'`.

- [ ] **Step 3: Write the implementation**

`services/auth-service/src/inviteStore.ts`:

```ts
// Invite-code lifecycle. Codes are multi-use until revoked/expired; joining
// creates an idempotent 'member' membership in the code's group.
import crypto from 'node:crypto';
import { getPool } from './db';
import { addMembership, getGroup } from './orgStore';
import type { MembershipSummary } from '@revision-app/shared';

// No 0/O/1/I/L — codes get read aloud and typed.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomSuffix(len: number): string {
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return out;
}

export async function createInviteCode(groupId: string, createdBy: string, expiresAt?: number | null): Promise<string> {
  const group = await getGroup(groupId);
  if (!group) throw new Error('GROUP_NOT_FOUND');
  const prefix = group.name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'GROUP';
  // PK collision on the random suffix is astronomically rare but cheap to retry.
  for (let attempt = 0; ; attempt++) {
    const code = `${prefix}-${randomSuffix(4)}`;
    try {
      await getPool().query(
        'INSERT INTO invite_codes (code, group_id, created_by, expires_at) VALUES ($1, $2, $3, $4)',
        [code, groupId, createdBy, expiresAt ? new Date(expiresAt) : null],
      );
      return code;
    } catch (err) {
      const unique = typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
      if (!unique || attempt >= 4) throw err;
    }
  }
}

export async function revokeInviteCode(code: string): Promise<boolean> {
  const { rowCount } = await getPool().query(
    'UPDATE invite_codes SET revoked_at = now() WHERE code = $1 AND revoked_at IS NULL',
    [code],
  );
  return (rowCount ?? 0) > 0;
}

export async function joinByCode(code: string, userId: string): Promise<MembershipSummary> {
  const { rows } = await getPool().query<{ group_id: string }>(
    `SELECT group_id FROM invite_codes
     WHERE code = $1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())`,
    [code],
  );
  if (!rows[0]) throw new Error('CODE_INVALID');
  const group = await getGroup(rows[0].group_id);
  if (!group) throw new Error('CODE_INVALID'); // group deleted after code issued
  await addMembership(group.orgId, group.id, userId, 'member');
  return { orgId: group.orgId, orgName: group.orgName, groupId: group.id, groupName: group.name, role: 'member' };
}
```

Also export the code's group lookup for route-level authorization (append to `inviteStore.ts`):

```ts
export async function getInviteCodeGroup(code: string): Promise<string | null> {
  const { rows } = await getPool().query<{ group_id: string }>(
    'SELECT group_id FROM invite_codes WHERE code = $1',
    [code],
  );
  return rows[0]?.group_id ?? null;
}
```

- [ ] **Step 4: Run tests — verify pass**

```bash
npm test -w services/auth-service
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/auth-service/src/inviteStore.ts services/auth-service/src/inviteStore.test.ts
git commit -m "feat(auth): invite code lifecycle and join-by-code"
```

---

### Task 4: Org HTTP endpoints (auth-service)

**Files:**
- Create: `services/auth-service/src/session.ts`
- Create: `services/auth-service/src/orgRoutes.ts`
- Create: `services/auth-service/src/orgRoutes.test.ts`
- Modify: `services/auth-service/src/server.ts`

**Interfaces:**
- Consumes: Task 2 `orgStore` and Task 3 `inviteStore` functions exactly as specified; `verifySession`, `signSession` from `@revision-app/shared/server`.
- Produces:
  - `session.ts`: `sessionFrom(req: express.Request): { userId: string; username: string; domain: string } | null`
  - `orgRoutes.ts`: `orgRouter(): express.Router` and `_resetJoinRateLimit(): void` (tests only)
  - HTTP API (all JSON, bearer auth, 401 when unauthenticated):
    - `POST /orgs` `{name}` → 201 `{id, name}`; 400 if name < 3 chars
    - `GET /me/orgs` → 200 `{memberships: MembershipSummary[]}`
    - `POST /orgs/:id/groups` `{name}` → 201 `{id, name}`; admin only (403); 409 on duplicate name
    - `GET /orgs/:id/groups` → 200 `{groups: [{id, name}]}`; admin only (403)
    - `POST /groups/:id/heads` `{username}` → 200 `{message}`; admin of the group's org only; 404 unknown user/group; 400 if target has no membership in the org
    - `POST /groups/:id/invite-codes` `{expiresInDays?}` → 201 `{code, expiresAt}`; admin or head of that group
    - `DELETE /invite-codes/:code` → 204; admin/head of the code's group; 404 unknown code
    - `POST /orgs/join` `{code}` → 200 `{membership: MembershipSummary}`; 400 `Invalid or expired code`; 429 after 10 attempts/user/minute
    - `DELETE /groups/:gid/members/:uid` → 204; allowed for the student themself or an admin/head of the group; 403 otherwise; 404 if no such membership

- [ ] **Step 1: Extract `sessionFrom` into `src/session.ts`**

```ts
import type express from 'express';
import { verifySession } from '@revision-app/shared/server';

// Express's req.headers.authorization is a plain string, not a Fetch
// Request — getSessionFromRequest (Fetch-shaped) doesn't apply here.
export function sessionFrom(req: express.Request) {
  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  return token ? verifySession(token) : null;
}
```

In `server.ts`: delete the inline `function sessionFrom(req…)` definition inside `createApp` and add `import { sessionFrom } from './session';` at the top. Run `npm test -w services/auth-service` — existing tests must still PASS before continuing.

- [ ] **Step 2: Write the failing route tests**

`services/auth-service/src/orgRoutes.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { signSession } from '@revision-app/shared/server';
import { getPool } from './db';
import { createUser } from './userStore';
import { createApp } from './server';
import { _resetJoinRateLimit } from './orgRoutes';

const app = createApp();

beforeEach(async () => {
  await getPool().query('TRUNCATE users CASCADE');
  _resetJoinRateLimit();
});
afterAll(() => getPool().end());

async function actor(name: string) {
  const u = await createUser(name, 'password123', 'civil-engineering');
  return { ...u, token: signSession({ userId: u.id, username: u.username, domain: u.domain }) };
}
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

async function coachedGroup() {
  const admin = await actor('admin1');
  const org = (await request(app).post('/orgs').set(auth(admin.token)).send({ name: 'XYZ Academy' })).body;
  const group = (await request(app).post(`/orgs/${org.id}/groups`).set(auth(admin.token)).send({ name: 'Batch A' })).body;
  const invite = (await request(app).post(`/groups/${group.id}/invite-codes`).set(auth(admin.token)).send({})).body;
  return { admin, org, group, invite };
}

describe('org routes', () => {
  it('401s every org endpoint without a token', async () => {
    for (const [method, path] of [
      ['post', '/orgs'], ['get', '/me/orgs'], ['post', '/orgs/join'],
    ] as const) {
      const res = await (request(app) as any)[method](path).send({});
      expect(res.status, `${method} ${path}`).toBe(401);
    }
  });

  it('creates an org, group, and invite; student joins by code', async () => {
    const { org, group, invite } = await coachedGroup();
    expect(invite.code).toMatch(/^BATCHA-/);
    const student = await actor('student1');
    const join = await request(app).post('/orgs/join').set(auth(student.token)).send({ code: invite.code });
    expect(join.status).toBe(200);
    expect(join.body.membership).toMatchObject({ orgId: org.id, groupId: group.id, role: 'member' });
    const me = await request(app).get('/me/orgs').set(auth(student.token));
    expect(me.body.memberships).toHaveLength(1);
  });

  it('enforces the authorization matrix on group management', async () => {
    const { org, group, invite } = await coachedGroup();
    const student = await actor('student1');
    await request(app).post('/orgs/join').set(auth(student.token)).send({ code: invite.code });
    const outsider = await actor('outsider');

    // students and outsiders cannot manage
    for (const t of [student.token, outsider.token]) {
      expect((await request(app).post(`/orgs/${org.id}/groups`).set(auth(t)).send({ name: 'B' })).status).toBe(403);
      expect((await request(app).get(`/orgs/${org.id}/groups`).set(auth(t))).status).toBe(403);
      expect((await request(app).post(`/groups/${group.id}/invite-codes`).set(auth(t)).send({})).status).toBe(403);
      expect((await request(app).post(`/groups/${group.id}/heads`).set(auth(t)).send({ username: 'student1' })).status).toBe(403);
    }
  });

  it('promotes an org member to head; head can then mint invite codes', async () => {
    const { admin, group, invite } = await coachedGroup();
    const coach = await actor('coach1');
    await request(app).post('/orgs/join').set(auth(coach.token)).send({ code: invite.code });
    const promote = await request(app).post(`/groups/${group.id}/heads`).set(auth(admin.token)).send({ username: 'coach1' });
    expect(promote.status).toBe(200);
    expect((await request(app).post(`/groups/${group.id}/invite-codes`).set(auth(coach.token)).send({})).status).toBe(201);
    // non-member cannot be promoted
    await actor('stranger');
    expect((await request(app).post(`/groups/${group.id}/heads`).set(auth(admin.token)).send({ username: 'stranger' })).status).toBe(400);
  });

  it('revokes an invite code, after which joining fails uniformly', async () => {
    const { admin, invite } = await coachedGroup();
    expect((await request(app).delete(`/invite-codes/${invite.code}`).set(auth(admin.token))).status).toBe(204);
    const student = await actor('student1');
    const join = await request(app).post('/orgs/join').set(auth(student.token)).send({ code: invite.code });
    expect(join.status).toBe(400);
    expect(join.body.error).toBe('Invalid or expired code');
  });

  it('lets a student leave and an admin remove, but not strangers', async () => {
    const { admin, group, invite } = await coachedGroup();
    const student = await actor('student1');
    await request(app).post('/orgs/join').set(auth(student.token)).send({ code: invite.code });
    const outsider = await actor('outsider');
    expect((await request(app).delete(`/groups/${group.id}/members/${student.id}`).set(auth(outsider.token))).status).toBe(403);
    expect((await request(app).delete(`/groups/${group.id}/members/${student.id}`).set(auth(student.token))).status).toBe(204);
    // re-join, then admin removes
    await request(app).post('/orgs/join').set(auth(student.token)).send({ code: invite.code });
    expect((await request(app).delete(`/groups/${group.id}/members/${student.id}`).set(auth(admin.token))).status).toBe(204);
    expect((await request(app).delete(`/groups/${group.id}/members/${student.id}`).set(auth(admin.token))).status).toBe(404);
  });

  it('rate-limits join attempts to 10/minute per user', async () => {
    const student = await actor('student1');
    for (let i = 0; i < 10; i++) {
      await request(app).post('/orgs/join').set(auth(student.token)).send({ code: 'WRONG-XXXX' });
    }
    const eleventh = await request(app).post('/orgs/join').set(auth(student.token)).send({ code: 'WRONG-XXXX' });
    expect(eleventh.status).toBe(429);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npm test -w services/auth-service
```
Expected: FAIL — `Cannot find module './orgRoutes'`.

- [ ] **Step 4: Write the implementation**

`services/auth-service/src/orgRoutes.ts`:

```ts
import express from 'express';
import { sessionFrom } from './session';
import {
  createOrganisation, createGroup, getGroup, listGroups, addMembership,
  getOrgRole, getGroupRole, hasOrgMembership, listMembershipsForUser, removeMembership,
} from './orgStore';
import { createInviteCode, revokeInviteCode, joinByCode, getInviteCodeGroup } from './inviteStore';
import { findByUsername } from './userStore';

// ── join rate limit: 10 attempts / user / minute, in-memory ────────────────
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 10;
const joinAttempts = new Map<string, number[]>();
export function _resetJoinRateLimit(): void {
  joinAttempts.clear();
}
function joinAllowed(userId: string): boolean {
  const now = Date.now();
  const recent = (joinAttempts.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  joinAttempts.set(userId, recent);
  return recent.length <= MAX_ATTEMPTS;
}

export function orgRouter(): express.Router {
  const router = express.Router();

  // Every route here requires a session.
  router.use((req, res, next) => {
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
        console.error(`[org] ${req.method} ${req.path}`, err);
        res.status(500).json({ error: 'Server error' });
      }
    };

  router.post('/orgs', wrap(async (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (name.length < 3) return res.status(400).json({ error: 'Organisation name must be at least 3 characters' });
    const org = await createOrganisation(name, res.locals.session.userId);
    res.status(201).json(org);
  }));

  router.get('/me/orgs', wrap(async (_req, res) => {
    res.json({ memberships: await listMembershipsForUser(res.locals.session.userId) });
  }));

  router.post('/orgs/:id/groups', wrap(async (req, res) => {
    if (!(await getOrgRole(req.params.id, res.locals.session.userId))) {
      return res.status(403).json({ error: 'Only an organisation admin can do that' });
    }
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (name.length < 1) return res.status(400).json({ error: 'Group name is required' });
    try {
      const group = await createGroup(req.params.id, name);
      res.status(201).json({ id: group.id, name: group.name });
    } catch (err) {
      if (err instanceof Error && err.message === 'GROUP_NAME_TAKEN') {
        return res.status(409).json({ error: 'A group with that name already exists' });
      }
      throw err;
    }
  }));

  router.get('/orgs/:id/groups', wrap(async (req, res) => {
    if (!(await getOrgRole(req.params.id, res.locals.session.userId))) {
      return res.status(403).json({ error: 'Only an organisation admin can do that' });
    }
    res.json({ groups: await listGroups(req.params.id) });
  }));

  router.post('/groups/:id/heads', wrap(async (req, res) => {
    const group = await getGroup(req.params.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    if (!(await getOrgRole(group.orgId, res.locals.session.userId))) {
      return res.status(403).json({ error: 'Only an organisation admin can do that' });
    }
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const target = username ? await findByUsername(username) : null;
    if (!target) return res.status(404).json({ error: 'No such user' });
    if (!(await hasOrgMembership(group.orgId, target.id))) {
      return res.status(400).json({ error: 'User is not a member of this organisation' });
    }
    await addMembership(group.orgId, group.id, target.id, 'head');
    res.json({ message: `${target.username} is now a head of ${group.name}` });
  }));

  router.post('/groups/:id/invite-codes', wrap(async (req, res) => {
    const role = await getGroupRole(req.params.id, res.locals.session.userId);
    if (role !== 'admin' && role !== 'head') {
      return res.status(403).json({ error: 'Only a group head or organisation admin can do that' });
    }
    const days = typeof req.body?.expiresInDays === 'number' ? req.body.expiresInDays : null;
    const expiresAt = days && days > 0 ? Date.now() + days * 24 * 60 * 60 * 1000 : null;
    const code = await createInviteCode(req.params.id, res.locals.session.userId, expiresAt);
    res.status(201).json({ code, expiresAt });
  }));

  router.delete('/invite-codes/:code', wrap(async (req, res) => {
    const groupId = await getInviteCodeGroup(req.params.code);
    if (!groupId) return res.status(404).json({ error: 'No such code' });
    const role = await getGroupRole(groupId, res.locals.session.userId);
    if (role !== 'admin' && role !== 'head') {
      return res.status(403).json({ error: 'Only a group head or organisation admin can do that' });
    }
    await revokeInviteCode(req.params.code);
    res.status(204).end();
  }));

  router.post('/orgs/join', wrap(async (req, res) => {
    const userId = res.locals.session.userId;
    if (!joinAllowed(userId)) {
      return res.status(429).json({ error: 'Too many join attempts — try again in a minute' });
    }
    const code = typeof req.body?.code === 'string' ? req.body.code.trim().toUpperCase() : '';
    if (!code) return res.status(400).json({ error: 'Invite code is required' });
    try {
      const membership = await joinByCode(code, userId);
      res.json({ membership });
    } catch (err) {
      if (err instanceof Error && err.message === 'CODE_INVALID') {
        return res.status(400).json({ error: 'Invalid or expired code' });
      }
      throw err;
    }
  }));

  router.delete('/groups/:gid/members/:uid', wrap(async (req, res) => {
    const requester = res.locals.session.userId;
    if (requester !== req.params.uid) {
      const role = await getGroupRole(req.params.gid, requester);
      if (role !== 'admin' && role !== 'head') {
        return res.status(403).json({ error: 'Only a group head or organisation admin can do that' });
      }
    }
    const removed = await removeMembership(req.params.gid, req.params.uid);
    if (!removed) return res.status(404).json({ error: 'No such membership' });
    res.status(204).end();
  }));

  return router;
}
```

In `server.ts`, inside `createApp` after `app.use(express.json());` add:

```ts
app.use(orgRouter());
```
with `import { orgRouter } from './orgRoutes';` at the top.

- [ ] **Step 5: Run tests — verify pass**

```bash
npm test -w services/auth-service
```
Expected: PASS (org routes + all existing auth tests).

- [ ] **Step 6: Commit**

```bash
git add services/auth-service/src
git commit -m "feat(auth): org management HTTP endpoints with role checks and join rate limit"
```

---

### Task 5: Internal roster endpoint (auth-service)

**Files:**
- Create: `services/auth-service/src/internalRoutes.ts`
- Create: `services/auth-service/src/internalRoutes.test.ts`
- Modify: `services/auth-service/src/server.ts`

**Interfaces:**
- Consumes: `getGroup`, `getGroupRole`, `listGroupMembers` from `./orgStore`.
- Produces: `internalRouter(): express.Router` serving
  `GET /internal/groups/:id/members?requester=<userId>` with header `x-service-secret: $SERVICE_SECRET` →
  200 `GroupRoster` (`{ requesterRole, group: {id, name, orgName}, members }` — `requesterRole` is `'admin' | 'head' | null`; a plain `member` maps to `null` because members may not view dashboards); 401 wrong/missing secret; 503 if `SERVICE_SECRET` unset; 404 unknown group; 400 missing requester.

- [ ] **Step 1: Write the failing test**

`services/auth-service/src/internalRoutes.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { getPool } from './db';
import { createUser } from './userStore';
import { createOrganisation, createGroup, addMembership } from './orgStore';
import { createApp } from './server';

const app = createApp();

beforeEach(async () => {
  process.env.SERVICE_SECRET = 'test-secret';
  await getPool().query('TRUNCATE users CASCADE');
});
afterAll(() => getPool().end());

async function fixture() {
  const admin = await createUser('admin1', 'password123', 'civil-engineering');
  const head = await createUser('coach1', 'password123', 'civil-engineering');
  const student = await createUser('student1', 'password123', 'civil-engineering');
  const org = await createOrganisation('XYZ', admin.id);
  const group = await createGroup(org.id, 'Batch A');
  await addMembership(org.id, group.id, head.id, 'head');
  await addMembership(org.id, group.id, student.id, 'member');
  return { admin, head, student, org, group };
}

describe('internal roster endpoint', () => {
  it('fails closed without configuration or secret', async () => {
    const { group, head } = await fixture();
    delete process.env.SERVICE_SECRET;
    expect((await request(app).get(`/internal/groups/${group.id}/members?requester=${head.id}`)
      .set('x-service-secret', 'anything')).status).toBe(503);
    process.env.SERVICE_SECRET = 'test-secret';
    expect((await request(app).get(`/internal/groups/${group.id}/members?requester=${head.id}`)
      .set('x-service-secret', 'wrong')).status).toBe(401);
    expect((await request(app).get(`/internal/groups/${group.id}/members?requester=${head.id}`)).status).toBe(401);
  });

  it('returns the roster with the requester role resolved', async () => {
    const { group, head, student, admin } = await fixture();
    const get = (requester: string) =>
      request(app).get(`/internal/groups/${group.id}/members?requester=${requester}`).set('x-service-secret', 'test-secret');

    const asHead = await get(head.id);
    expect(asHead.status).toBe(200);
    expect(asHead.body).toEqual({
      requesterRole: 'head',
      group: { id: group.id, name: 'Batch A', orgName: 'XYZ' },
      members: [{ userId: student.id, username: 'student1' }],
    });
    expect((await get(admin.id)).body.requesterRole).toBe('admin');
    expect((await get(student.id)).body.requesterRole).toBeNull(); // members can't coach
  });

  it('404s an unknown group and 400s a missing requester', async () => {
    const { head } = await fixture();
    const missing = await request(app)
      .get(`/internal/groups/00000000-0000-0000-0000-000000000000/members?requester=${head.id}`)
      .set('x-service-secret', 'test-secret');
    expect(missing.status).toBe(404);
    const noRequester = await request(app)
      .get('/internal/groups/00000000-0000-0000-0000-000000000000/members')
      .set('x-service-secret', 'test-secret');
    expect(noRequester.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -w services/auth-service
```
Expected: FAIL (404s from express — router not mounted).

- [ ] **Step 3: Write the implementation**

`services/auth-service/src/internalRoutes.ts`:

```ts
// Service-to-service API. Auth: shared static secret, checked per request so
// tests (and rotations) can change it without rebuilding the app.
import crypto from 'node:crypto';
import express from 'express';
import { getGroup, getGroupRole, listGroupMembers } from './orgStore';

function secretMatches(given: string | undefined): boolean {
  const expected = process.env.SERVICE_SECRET;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function internalRouter(): express.Router {
  const router = express.Router();

  router.use('/internal', (req, res, next) => {
    if (!process.env.SERVICE_SECRET) {
      return res.status(503).json({ error: 'SERVICE_SECRET is not configured' });
    }
    if (!secretMatches(req.headers['x-service-secret'] as string | undefined)) {
      return res.status(401).json({ error: 'Bad service secret' });
    }
    next();
  });

  router.get('/internal/groups/:id/members', async (req, res) => {
    const requester = typeof req.query.requester === 'string' ? req.query.requester : '';
    if (!requester) return res.status(400).json({ error: 'requester query param is required' });
    try {
      const group = await getGroup(req.params.id);
      if (!group) return res.status(404).json({ error: 'Group not found' });
      const role = await getGroupRole(req.params.id, requester);
      res.json({
        requesterRole: role === 'admin' || role === 'head' ? role : null,
        group: { id: group.id, name: group.name, orgName: group.orgName },
        members: await listGroupMembers(req.params.id),
      });
    } catch (err) {
      console.error('[internal roster]', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  return router;
}
```

In `server.ts`, next to the `orgRouter()` mount add `app.use(internalRouter());` with the matching import.

- [ ] **Step 4: Run tests — verify pass**

```bash
npm test -w services/auth-service
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/auth-service/src
git commit -m "feat(auth): internal group roster endpoint for content-service"
```

---

### Task 6: Stats schema + pure derivation (content-service)

**Files:**
- Create: `services/content-service/db/migrations/0002_stats.sql`
- Create: `services/content-service/src/stats.ts`
- Create: `services/content-service/src/stats.test.ts`

**Interfaces:**
- Consumes: `AppData`, `SubjectCoverage`, `activeTopics`, `nextDueDate`, `currentStreak` from `@revision-app/shared` (Tasks 1–2).
- Produces:
  - `interface DerivedStats { totalTopics: number; completedTopics: number; streakDays: number; dueHistogram: Record<string, number>; subjectCoverage: SubjectCoverage[] }`
  - `deriveStats(data: AppData, now: number): DerivedStats`
  - `deriveActivity(data: AppData): Record<string, number>` — UTC `'YYYY-MM-DD'` → revision count across active topics
  - `dueCounts(hist: Record<string, number>, now: number): { dueToday: number; overdue: number }`
  - `utcDayKey(ts: number): string`

- [ ] **Step 1: Write the migration**

`services/content-service/db/migrations/0002_stats.sql`:

```sql
CREATE TABLE user_stats (
  user_id uuid PRIMARY KEY,
  total_topics int NOT NULL,
  completed_topics int NOT NULL,
  streak_days int NOT NULL,
  due_histogram jsonb NOT NULL,
  subject_coverage jsonb NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE user_activity (
  user_id uuid NOT NULL,
  day date NOT NULL,
  revisions int NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
```

- [ ] **Step 2: Apply migrations to dev and test databases**

```bash
cd /home/subaru/projects/revision_app
set -a; source .env; set +a
DATABASE_URL="postgres://revision:${POSTGRES_PASSWORD}@127.0.0.1:5433/revision_content" npm run db:migrate -w services/content-service
DATABASE_URL="postgres://revision:${POSTGRES_PASSWORD}@127.0.0.1:5433/revision_content_test" npm run db:migrate -w services/content-service
```
Expected: `applying: 0002_stats.sql` on both.

- [ ] **Step 3: Write the failing test**

`services/content-service/src/stats.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DAY_MS } from '@revision-app/shared';
import type { AppData, Revision, Topic } from '@revision-app/shared';
import { deriveStats, deriveActivity, dueCounts, utcDayKey } from './stats';

const NOW = Date.UTC(2026, 6, 16, 12); // 2026-07-16T12:00Z

const rev = (daysAgo: number): Revision => ({ id: `r${daysAgo}`, timestamp: NOW - daysAgo * DAY_MS });

function topic(id: string, history: Revision[], extra: Partial<Topic> = {}): Topic {
  return {
    id, chapterId: 'c1', title: id, notes: 'SECRET', order: 0, difficulty: 'Easy', priority: 'Low',
    revisionHistory: history, createdAt: 0, updatedAt: 0, ...extra,
  };
}

function appData(topics: Topic[]): AppData {
  return {
    subjects: {
      s1: { id: 's1', name: 'Soil Mechanics', color: '', icon: '', order: 0, chapterIds: ['c1'] },
    },
    chapters: {
      c1: { id: 'c1', subjectId: 's1', name: 'Ch1', order: 0, difficulty: 'Easy', priority: 'Low', topicIds: topics.map((t) => t.id) },
    },
    topics: Object.fromEntries(topics.map((t) => [t.id, t])),
    subjectOrder: ['s1'], tags: {}, tagOrder: [],
  };
}

describe('stats derivation', () => {
  it('utcDayKey formats UTC dates', () => {
    expect(utcDayKey(NOW)).toBe('2026-07-16');
  });

  it('derives totals, completion, coverage, and a due histogram', () => {
    // t1: revised 3d ago once → interval 1d → was due 2d ago (overdue)
    // t2: revised today → due tomorrow
    // t3: never revised → not in histogram
    // t4: archived → ignored entirely
    const data = appData([
      topic('t1', [rev(3)]),
      topic('t2', [rev(0)]),
      topic('t3', []),
      topic('t4', [rev(1)], { archivedAt: NOW }),
    ]);
    const s = deriveStats(data, NOW);
    expect(s.totalTopics).toBe(3);
    expect(s.completedTopics).toBe(2);
    expect(s.dueHistogram).toEqual({ '2026-07-14': 1, '2026-07-17': 1 });
    expect(s.subjectCoverage).toEqual([{ subject: 'Soil Mechanics', total: 3, revised: 2 }]);
    expect(s.streakDays).toBe(1); // t2 revised today
  });

  it('dueCounts splits the histogram around today', () => {
    const hist = { '2026-07-10': 2, '2026-07-16': 3, '2026-07-20': 1 };
    expect(dueCounts(hist, NOW)).toEqual({ dueToday: 3, overdue: 2 });
  });

  it('deriveActivity counts revisions per UTC day for active topics only', () => {
    const data = appData([
      topic('t1', [rev(1), rev(0)]),
      topic('t2', [rev(0)]),
      topic('t4', [rev(0)], { archivedAt: NOW }),
    ]);
    expect(deriveActivity(data)).toEqual({ '2026-07-15': 1, '2026-07-16': 2 });
  });

  it('handles an empty AppData', () => {
    const empty = appData([]);
    const s = deriveStats(empty, NOW);
    expect(s).toEqual({ totalTopics: 0, completedTopics: 0, streakDays: 0, dueHistogram: {}, subjectCoverage: [{ subject: 'Soil Mechanics', total: 0, revised: 0 }] });
    expect(deriveActivity(empty)).toEqual({});
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

```bash
export DATABASE_URL="postgres://revision:${POSTGRES_PASSWORD}@127.0.0.1:5433/revision_content_test"
npm test -w services/content-service
```
Expected: FAIL — `Cannot find module './stats'`.

- [ ] **Step 5: Write the implementation**

`services/content-service/src/stats.ts`:

```ts
// Pure derivation of per-user stats from an AppData blob. All day bucketing
// is UTC (see Global Constraints in the plan/spec).
import type { AppData, SubjectCoverage } from '@revision-app/shared';
import { activeTopics, nextDueDate, currentStreak } from '@revision-app/shared';

export interface DerivedStats {
  totalTopics: number;
  completedTopics: number;
  streakDays: number;
  dueHistogram: Record<string, number>;
  subjectCoverage: SubjectCoverage[];
}

export function utcDayKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

export function deriveStats(data: AppData, now: number): DerivedStats {
  const topics = activeTopics(data);
  const dueHistogram: Record<string, number> = {};
  const perSubject = new Map<string, { total: number; revised: number }>();

  // Seed coverage with every active subject so a subject with zero topics
  // still shows up in the heatmap.
  for (const id of data.subjectOrder) {
    const subject = data.subjects[id];
    if (subject && !subject.archivedAt) perSubject.set(subject.name, { total: 0, revised: 0 });
  }

  let completed = 0;
  for (const t of topics) {
    const revised = t.revisionHistory.length > 0;
    if (revised) completed += 1;
    const due = nextDueDate(t.revisionHistory);
    if (due !== undefined) {
      const key = utcDayKey(due);
      dueHistogram[key] = (dueHistogram[key] ?? 0) + 1;
    }
    const subjectName = data.subjects[data.chapters[t.chapterId].subjectId].name;
    const cov = perSubject.get(subjectName) ?? { total: 0, revised: 0 };
    cov.total += 1;
    if (revised) cov.revised += 1;
    perSubject.set(subjectName, cov);
  }

  return {
    totalTopics: topics.length,
    completedTopics: completed,
    streakDays: currentStreak(data, now),
    dueHistogram,
    subjectCoverage: [...perSubject.entries()].map(([subject, c]) => ({ subject, ...c })),
  };
}

export function deriveActivity(data: AppData): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of activeTopics(data)) {
    for (const r of t.revisionHistory) {
      const key = utcDayKey(r.timestamp);
      out[key] = (out[key] ?? 0) + 1;
    }
  }
  return out;
}

export function dueCounts(hist: Record<string, number>, now: number): { dueToday: number; overdue: number } {
  const today = utcDayKey(now);
  let dueToday = 0;
  let overdue = 0;
  for (const [day, count] of Object.entries(hist)) {
    if (day === today) dueToday += count;
    else if (day < today) overdue += count; // ISO date strings compare lexicographically
  }
  return { dueToday, overdue };
}
```

Caveat that matters for the streak assertion in the test: `currentStreak` uses local-time `startOfDay`. In CI/dev the tests still pass because `rev(0)` is "now", which is today in any timezone. Do not add timezone plumbing.

- [ ] **Step 6: Run tests — verify pass**

```bash
npm test -w services/content-service
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add services/content-service/db services/content-service/src/stats.ts services/content-service/src/stats.test.ts
git commit -m "feat(content): stats schema and pure stats derivation"
```

---

### Task 7: Transactional stats writes + backfill (content-service)

**Files:**
- Create: `services/content-service/src/statsStore.ts`
- Create: `services/content-service/src/statsStore.test.ts`
- Create: `services/content-service/src/backfillStats.ts`
- Modify: `services/content-service/src/appDataStore.ts`
- Modify: `services/content-service/package.json`

**Interfaces:**
- Consumes: `deriveStats`, `deriveActivity` from `./stats` (Task 6); `getPool` from `./db`; `PoolClient` from `pg`.
- Produces:
  - `writeStatsInTx(client: PoolClient, userId: string, data: AppData, now: number): Promise<void>`
  - `recomputeAllStats(now?: number): Promise<number>` — returns number of users processed
  - `writeData(userId: string, data: AppData, now?: number): Promise<void>` (existing signature gains optional `now`; still upserts `app_data`, now also stats, one transaction)
  - npm script `backfill:stats` in content-service

- [ ] **Step 1: Write the failing test**

`services/content-service/src/statsStore.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { DAY_MS } from '@revision-app/shared';
import type { AppData } from '@revision-app/shared';
import { getPool } from './db';
import { writeData } from './appDataStore';
import { recomputeAllStats } from './statsStore';

const NOW = Date.UTC(2026, 6, 16, 12);
const USER = '11111111-1111-1111-1111-111111111111';

function blob(revisedDaysAgo: number[]): AppData {
  return {
    subjects: { s1: { id: 's1', name: 'Soil', color: '', icon: '', order: 0, chapterIds: ['c1'] } },
    chapters: { c1: { id: 'c1', subjectId: 's1', name: 'Ch1', order: 0, difficulty: 'Easy', priority: 'Low', topicIds: ['t1'] } },
    topics: {
      t1: {
        id: 't1', chapterId: 'c1', title: 'T1', notes: '', order: 0, difficulty: 'Easy', priority: 'Low',
        revisionHistory: revisedDaysAgo.map((d, i) => ({ id: `r${i}`, timestamp: NOW - d * DAY_MS })),
        createdAt: 0, updatedAt: 0,
      },
    },
    subjectOrder: ['s1'], tags: {}, tagOrder: [],
  };
}

beforeEach(async () => {
  await getPool().query('TRUNCATE app_data, user_stats, user_activity');
});
afterAll(() => getPool().end());

describe('statsStore', () => {
  it('writeData upserts app_data, user_stats, and user_activity together', async () => {
    await writeData(USER, blob([1, 0]), NOW);
    const stats = await getPool().query('SELECT * FROM user_stats WHERE user_id = $1', [USER]);
    expect(stats.rows).toHaveLength(1);
    expect(stats.rows[0].total_topics).toBe(1);
    expect(stats.rows[0].completed_topics).toBe(1);
    const activity = await getPool().query(
      `SELECT to_char(day, 'YYYY-MM-DD') AS day, revisions FROM user_activity WHERE user_id = $1 ORDER BY day`,
      [USER],
    );
    expect(activity.rows).toEqual([
      { day: '2026-07-15', revisions: 1 },
      { day: '2026-07-16', revisions: 1 },
    ]);
  });

  it('rewrites activity on every save (deleted revisions disappear)', async () => {
    await writeData(USER, blob([1, 0]), NOW);
    await writeData(USER, blob([0]), NOW); // the day-old revision was deleted in the app
    const activity = await getPool().query(
      `SELECT to_char(day, 'YYYY-MM-DD') AS day FROM user_activity WHERE user_id = $1`,
      [USER],
    );
    expect(activity.rows).toEqual([{ day: '2026-07-16' }]);
  });

  it('recomputeAllStats backfills users that predate the stats tables', async () => {
    // Simulate a legacy row written before stats existed.
    await getPool().query(
      `INSERT INTO app_data (user_id, data, updated_at) VALUES ($1, $2, now())`,
      [USER, JSON.stringify(blob([2]))],
    );
    expect(await recomputeAllStats(NOW)).toBe(1);
    const stats = await getPool().query('SELECT total_topics FROM user_stats WHERE user_id = $1', [USER]);
    expect(stats.rows[0].total_topics).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/subaru/projects/revision_app
set -a; source .env; set +a
export DATABASE_URL="postgres://revision:${POSTGRES_PASSWORD}@127.0.0.1:5433/revision_content_test"
npm test -w services/content-service
```
Expected: FAIL — `Cannot find module './statsStore'`.

- [ ] **Step 3: Write the implementation**

`services/content-service/src/statsStore.ts`:

```ts
import type { PoolClient } from 'pg';
import type { AppData } from '@revision-app/shared';
import { getPool } from './db';
import { deriveStats, deriveActivity } from './stats';

export async function writeStatsInTx(client: PoolClient, userId: string, data: AppData, now: number): Promise<void> {
  const stats = deriveStats(data, now);
  await client.query(
    `INSERT INTO user_stats (user_id, total_topics, completed_topics, streak_days, due_histogram, subject_coverage, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (user_id) DO UPDATE SET
       total_topics = EXCLUDED.total_topics,
       completed_topics = EXCLUDED.completed_topics,
       streak_days = EXCLUDED.streak_days,
       due_histogram = EXCLUDED.due_histogram,
       subject_coverage = EXCLUDED.subject_coverage,
       updated_at = EXCLUDED.updated_at`,
    [userId, stats.totalTopics, stats.completedTopics, stats.streakDays,
     JSON.stringify(stats.dueHistogram), JSON.stringify(stats.subjectCoverage)],
  );
  // Activity is fully derivable from the blob (revision timestamps can be
  // edited or deleted in the app), so replace rather than increment.
  const activity = deriveActivity(data);
  await client.query('DELETE FROM user_activity WHERE user_id = $1', [userId]);
  const days = Object.keys(activity);
  if (days.length > 0) {
    await client.query(
      `INSERT INTO user_activity (user_id, day, revisions)
       SELECT $1, d::date, r FROM unnest($2::text[], $3::int[]) AS t(d, r)`,
      [userId, days, days.map((d) => activity[d])],
    );
  }
}

export async function recomputeAllStats(now = Date.now()): Promise<number> {
  const { rows } = await getPool().query<{ user_id: string; data: AppData }>(
    'SELECT user_id, data FROM app_data',
  );
  for (const row of rows) {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await writeStatsInTx(client, row.user_id, row.data, now);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
  return rows.length;
}
```

Replace `writeData` in `services/content-service/src/appDataStore.ts` (keep `readData` unchanged):

```ts
import type { AppData } from '@revision-app/shared';
import { getPool } from './db';
import { writeStatsInTx } from './statsStore';

export async function writeData(userId: string, data: AppData, now = Date.now()): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO app_data (user_id, data, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
      [userId, JSON.stringify(data)],
    );
    await writeStatsInTx(client, userId, data, now);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

`services/content-service/src/backfillStats.ts`:

```ts
// One-off: populate user_stats/user_activity for rows written before the
// stats tables existed. Run inside the container or with DATABASE_URL set:
//   npm run backfill:stats -w services/content-service
import { recomputeAllStats } from './statsStore';

recomputeAllStats()
  .then((n) => {
    console.log(`recomputed stats for ${n} user(s)`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
```

Add to `services/content-service/package.json` scripts:

```json
"backfill:stats": "tsx src/backfillStats.ts"
```

- [ ] **Step 4: Run tests — verify pass**

```bash
npm test -w services/content-service
```
Expected: PASS (statsStore tests + existing appDataStore/server tests — the existing `TRUNCATE app_data` suites are unaffected because stats writes are additive).

- [ ] **Step 5: Commit**

```bash
git add services/content-service
git commit -m "feat(content): maintain user_stats/user_activity transactionally with app_data saves"
```

---

### Task 8: Roster client with cache (content-service)

**Files:**
- Create: `services/content-service/src/authClient.ts`
- Create: `services/content-service/src/authClient.test.ts`

**Interfaces:**
- Consumes: global `fetch` (Node ≥ 18); env `AUTH_SERVICE_URL` (default `http://127.0.0.1:4001`), `SERVICE_SECRET`; `GroupRoster` from `@revision-app/shared`.
- Produces:
  - `class AuthServiceError extends Error { status: number }` — `status` 502 for network/5xx/unconfigured, 404 passthrough for unknown group
  - `fetchGroupRoster(groupId: string, requesterId: string): Promise<GroupRoster>` — 60s in-memory cache keyed `groupId:requesterId`
  - `_clearRosterCache(): void` (tests only)

- [ ] **Step 1: Write the failing test**

`services/content-service/src/authClient.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchGroupRoster, AuthServiceError, _clearRosterCache } from './authClient';

const ROSTER = {
  requesterRole: 'head',
  group: { id: 'g1', name: 'Batch A', orgName: 'XYZ' },
  members: [{ userId: 'u1', username: 'student1' }],
};

beforeEach(() => {
  process.env.AUTH_SERVICE_URL = 'http://127.0.0.1:4001';
  process.env.SERVICE_SECRET = 'test-secret';
  _clearRosterCache();
});
afterEach(() => vi.unstubAllGlobals());

describe('fetchGroupRoster', () => {
  it('calls the internal endpoint with the secret and caches for 60s', async () => {
    const mock = vi.fn().mockResolvedValue(new Response(JSON.stringify(ROSTER), { status: 200 }));
    vi.stubGlobal('fetch', mock);
    const first = await fetchGroupRoster('g1', 'coach');
    expect(first).toEqual(ROSTER);
    expect(mock).toHaveBeenCalledWith(
      'http://127.0.0.1:4001/internal/groups/g1/members?requester=coach',
      { headers: { 'x-service-secret': 'test-secret' } },
    );
    await fetchGroupRoster('g1', 'coach'); // served from cache
    expect(mock).toHaveBeenCalledTimes(1);
    await fetchGroupRoster('g1', 'other-coach'); // different requester → new call
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it('maps auth-service failures to AuthServiceError with the right status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 404 })));
    await expect(fetchGroupRoster('gX', 'coach')).rejects.toMatchObject({ status: 404 });

    _clearRosterCache();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    await expect(fetchGroupRoster('gY', 'coach')).rejects.toMatchObject({ status: 502 });
  });

  it('fails closed when SERVICE_SECRET is missing', async () => {
    delete process.env.SERVICE_SECRET;
    await expect(fetchGroupRoster('g1', 'coach')).rejects.toBeInstanceOf(AuthServiceError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -w services/content-service
```
Expected: FAIL — `Cannot find module './authClient'`.

- [ ] **Step 3: Write the implementation**

`services/content-service/src/authClient.ts`:

```ts
// Content-service's only outbound dependency: asks auth-service who is in a
// group and whether the requester may see it. Cached briefly so one
// dashboard session doesn't hammer auth-service.
import type { GroupRoster } from '@revision-app/shared';

export class AuthServiceError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; roster: GroupRoster }>();

export function _clearRosterCache(): void {
  cache.clear();
}

export async function fetchGroupRoster(groupId: string, requesterId: string): Promise<GroupRoster> {
  const key = `${groupId}:${requesterId}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.roster;

  const secret = process.env.SERVICE_SECRET;
  if (!secret) throw new AuthServiceError('SERVICE_SECRET is not configured', 502);
  const base = process.env.AUTH_SERVICE_URL ?? 'http://127.0.0.1:4001';

  let res: Response;
  try {
    res = await fetch(`${base}/internal/groups/${groupId}/members?requester=${requesterId}`, {
      headers: { 'x-service-secret': secret },
    });
  } catch {
    throw new AuthServiceError('authorization service unavailable', 502);
  }
  if (res.status === 404) throw new AuthServiceError('Group not found', 404);
  if (!res.ok) throw new AuthServiceError('authorization service unavailable', 502);

  const roster = (await res.json()) as GroupRoster;
  cache.set(key, { at: Date.now(), roster });
  return roster;
}
```

- [ ] **Step 4: Run tests — verify pass**

```bash
npm test -w services/content-service
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/content-service/src/authClient.ts services/content-service/src/authClient.test.ts
git commit -m "feat(content): cached roster client for the auth-service internal API"
```

---

### Task 9: Cohort endpoints (content-service)

**Files:**
- Create: `services/content-service/src/session.ts`
- Create: `services/content-service/src/cohort.ts`
- Create: `services/content-service/src/cohort.test.ts`
- Modify: `services/content-service/src/server.ts`

**Interfaces:**
- Consumes: `fetchGroupRoster`, `AuthServiceError` (Task 8); `dueCounts`, `utcDayKey` (Task 6); `readData` from `./appDataStore`; `badgeState`, `nextDueDate`, `lastRevisedAt` and the `CohortSummary` / `CohortStudentRow` / `StudentDrilldown` / `SubjectCoverage` types from `@revision-app/shared`.
- Produces: `cohortRouter(): express.Router` serving (bearer auth; 401 unauthenticated; 403 when `requesterRole` is null; 502 on roster failure; 404 unknown group passthrough):
  - `GET /cohort/groups/:id/summary` → `CohortSummary` (activity = last 30 days, summed across members)
  - `GET /cohort/groups/:id/students?page=1&sort=completion|overdue` → `{ page: number; pageSize: 50; totalMembers: number; students: CohortStudentRow[] }` — `sort=completion` ascending (worst first, default), `sort=overdue` descending
  - `GET /cohort/groups/:id/students/:userId` → `StudentDrilldown`; 404 if target not a member
- Also produces `session.ts`: `sessionUserId(req: express.Request): { userId: string; domain: string } | null` (extracted verbatim from `server.ts`; update `server.ts` to import it).

- [ ] **Step 1: Extract `sessionUserId` into `src/session.ts`, keep tests green**

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

Delete the inline copy in `server.ts`, import it instead, run `npm test -w services/content-service` — existing tests must PASS.

- [ ] **Step 2: Write the failing cohort tests**

`services/content-service/src/cohort.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import { signSession } from '@revision-app/shared/server';
import { DAY_MS } from '@revision-app/shared';
import type { AppData } from '@revision-app/shared';
import { getPool } from './db';
import { writeData } from './appDataStore';
import { createApp } from './server';
import { _clearRosterCache } from './authClient';

const app = createApp();
const NOW = Date.now();
const COACH = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STUDENT = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const coachToken = signSession({ userId: COACH, username: 'coach', domain: 'civil-engineering' });
const studentToken = signSession({ userId: STUDENT, username: 'student1', domain: 'civil-engineering' });

function roster(requesterRole: 'admin' | 'head' | null) {
  return {
    requesterRole,
    group: { id: 'g1', name: 'Batch A', orgName: 'XYZ' },
    members: [{ userId: STUDENT, username: 'student1' }],
  };
}

function stubRoster(requesterRole: 'admin' | 'head' | null) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(roster(requesterRole)), { status: 200 })));
}

function studentBlob(): AppData {
  return {
    subjects: { s1: { id: 's1', name: 'Soil', color: '', icon: '', order: 0, chapterIds: ['c1'] } },
    chapters: { c1: { id: 'c1', subjectId: 's1', name: 'Ch1', order: 0, difficulty: 'Easy', priority: 'Low', topicIds: ['t1', 't2'] } },
    topics: {
      t1: {
        id: 't1', chapterId: 'c1', title: 'Bearing capacity', notes: 'SECRET-NOTE', order: 0,
        difficulty: 'Easy', priority: 'Low',
        revisionHistory: [{ id: 'r1', timestamp: NOW - 3 * DAY_MS }], createdAt: 0, updatedAt: 0,
        attachments: [{ id: 'a1', name: 'secret.pdf', kind: 'pdf', url: '/api/files/a1', createdAt: 0 }],
        flashcards: [{ id: 'f1', front: 'SECRET-FRONT', back: 'SECRET-BACK', createdAt: 0 }],
        bookmarkedAt: NOW, tagIds: ['tag1'],
      },
      t2: {
        id: 't2', chapterId: 'c1', title: 'Slope stability', notes: '', order: 1,
        difficulty: 'Easy', priority: 'Low', revisionHistory: [], createdAt: 0, updatedAt: 0,
      },
    },
    subjectOrder: ['s1'],
    tags: { tag1: { id: 'tag1', name: 'SECRET-TAG', color: '', icon: '', order: 0 } },
    tagOrder: ['tag1'],
  };
}

beforeEach(async () => {
  process.env.SERVICE_SECRET = 'test-secret';
  await getPool().query('TRUNCATE app_data, user_stats, user_activity');
  _clearRosterCache();
});
afterEach(() => vi.unstubAllGlobals());
afterAll(() => getPool().end());

describe('cohort endpoints', () => {
  it('401s without a session and 403s non-coaches', async () => {
    expect((await request(app).get('/cohort/groups/g1/summary')).status).toBe(401);
    stubRoster(null);
    const res = await request(app).get('/cohort/groups/g1/summary').set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
  });

  it('returns a summary with rollups and 30-day activity', async () => {
    await writeData(STUDENT, studentBlob(), NOW);
    stubRoster('head');
    const res = await request(app).get('/cohort/groups/g1/summary').set('Authorization', `Bearer ${coachToken}`);
    expect(res.status).toBe(200);
    expect(res.body.group).toEqual({ id: 'g1', name: 'Batch A', orgName: 'XYZ' });
    expect(res.body.totals.members).toBe(1);
    expect(res.body.totals.completionPct).toBe(50); // 1 of 2 topics revised
    expect(res.body.totals.overdue).toBe(1);        // t1 due 2 days ago
    expect(res.body.activity).toEqual([expect.objectContaining({ revisions: 1 })]);
  });

  it('lists students with a No-data row for members who never saved', async () => {
    stubRoster('admin');
    const res = await request(app).get('/cohort/groups/g1/students').set('Authorization', `Bearer ${coachToken}`);
    expect(res.status).toBe(200);
    expect(res.body.totalMembers).toBe(1);
    expect(res.body.students[0]).toMatchObject({ userId: STUDENT, username: 'student1', hasData: false, completionPct: 0 });
  });

  it('drill-down returns revision state only — never notes/attachments/tags', async () => {
    await writeData(STUDENT, studentBlob(), NOW);
    stubRoster('head');
    const res = await request(app).get(`/cohort/groups/g1/students/${STUDENT}`).set('Authorization', `Bearer ${coachToken}`);
    expect(res.status).toBe(200);
    expect(res.body.subjects[0].chapters[0].topics).toHaveLength(2);
    expect(res.body.subjects[0].chapters[0].topics[0]).toMatchObject({ title: 'Bearing capacity', state: 'Overdue', revisionCount: 1 });
    const raw = JSON.stringify(res.body);
    for (const banned of ['SECRET-NOTE', 'SECRET-FRONT', 'SECRET-TAG', 'secret.pdf', '"notes"', '"attachments"', '"flashcards"', '"bookmarkedAt"', '"tagIds"']) {
      expect(raw, `must not contain ${banned}`).not.toContain(banned);
    }
  });

  it('404s a drill-down for a non-member and 502s when auth-service is down', async () => {
    stubRoster('head');
    const nonMember = await request(app).get('/cohort/groups/g1/students/cccccccc-cccc-cccc-cccc-cccccccccccc')
      .set('Authorization', `Bearer ${coachToken}`);
    expect(nonMember.status).toBe(404);

    _clearRosterCache();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const down = await request(app).get('/cohort/groups/g1/summary').set('Authorization', `Bearer ${coachToken}`);
    expect(down.status).toBe(502);
    expect(down.body.error).toBe('authorization service unavailable');
  });

  it('paginates at 50/page and sorts worst-first', async () => {
    // 60 members, no stats rows needed — pagination/sort operate on the joined rows.
    const members = Array.from({ length: 60 }, (_, i) => ({
      userId: `${String(i).padStart(8, '0')}-0000-0000-0000-000000000000`,
      username: `student${String(i).padStart(2, '0')}`,
    }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      requesterRole: 'head',
      group: { id: 'g1', name: 'Batch A', orgName: 'XYZ' },
      members,
    }), { status: 200 })));
    // Give member 59 stats so completion sort puts the 59 no-data rows (0%) first.
    await writeData(members[59].userId, studentBlob(), NOW);

    const page1 = await request(app).get('/cohort/groups/g1/students?page=1').set('Authorization', `Bearer ${coachToken}`);
    expect(page1.body.students).toHaveLength(50);
    expect(page1.body.totalMembers).toBe(60);
    expect(page1.body.students.every((s: { completionPct: number }) => s.completionPct === 0)).toBe(true);

    const page2 = await request(app).get('/cohort/groups/g1/students?page=2').set('Authorization', `Bearer ${coachToken}`);
    expect(page2.body.students).toHaveLength(10);
    // worst-first: the one student with data (50% complete) sorts last overall
    expect(page2.body.students[9].userId).toBe(members[59].userId);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npm test -w services/content-service
```
Expected: FAIL — 404s (router not mounted).

- [ ] **Step 4: Write the implementation**

`services/content-service/src/cohort.ts`:

```ts
import express from 'express';
import type {
  CohortStudentRow, GroupRoster, StudentDrilldown, SubjectCoverage,
} from '@revision-app/shared';
import { badgeState, nextDueDate, lastRevisedAt } from '@revision-app/shared';
import { sessionUserId } from './session';
import { fetchGroupRoster, AuthServiceError } from './authClient';
import { readData } from './appDataStore';
import { getPool } from './db';
import { dueCounts } from './stats';

const PAGE_SIZE = 50;

interface StatsRow {
  user_id: string;
  total_topics: number;
  completed_topics: number;
  streak_days: number;
  due_histogram: Record<string, number>;
  subject_coverage: SubjectCoverage[];
}

async function statsFor(userIds: string[]): Promise<Map<string, StatsRow>> {
  if (userIds.length === 0) return new Map();
  const { rows } = await getPool().query<StatsRow>(
    'SELECT * FROM user_stats WHERE user_id = ANY($1)',
    [userIds],
  );
  return new Map(rows.map((r) => [r.user_id, r]));
}

async function activityFor(userIds: string[]): Promise<{ day: string; revisions: number }[]> {
  if (userIds.length === 0) return [];
  const { rows } = await getPool().query<{ day: string; revisions: number }>(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day, SUM(revisions)::int AS revisions
     FROM user_activity
     WHERE user_id = ANY($1) AND day >= CURRENT_DATE - 29
     GROUP BY day ORDER BY day`,
    [userIds],
  );
  return rows;
}

export function cohortRouter(): express.Router {
  const router = express.Router();

  // Auth + roster + role check for every /cohort route. Attaches the roster
  // to res.locals; sends the error response itself when the gate fails.
  router.use('/cohort/groups/:id', async (req, res, next) => {
    const session = sessionUserId(req);
    if (!session) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const roster: GroupRoster = await fetchGroupRoster(req.params.id, session.userId);
      if (!roster.requesterRole) {
        return res.status(403).json({ error: 'You are not a head of this group' });
      }
      res.locals.roster = roster;
      next();
    } catch (err) {
      if (err instanceof AuthServiceError) {
        return res.status(err.status).json({
          error: err.status === 404 ? 'Group not found' : 'authorization service unavailable',
        });
      }
      console.error('[cohort gate]', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  router.get('/cohort/groups/:id/summary', async (_req, res) => {
    try {
      const roster: GroupRoster = res.locals.roster;
      const ids = roster.members.map((m) => m.userId);
      const stats = await statsFor(ids);
      const now = Date.now();
      let total = 0, completed = 0, dueToday = 0, overdue = 0;
      for (const row of stats.values()) {
        total += row.total_topics;
        completed += row.completed_topics;
        const d = dueCounts(row.due_histogram, now);
        dueToday += d.dueToday;
        overdue += d.overdue;
      }
      res.json({
        group: roster.group,
        totals: {
          members: ids.length,
          completionPct: total === 0 ? 0 : Math.round((100 * completed) / total),
          dueToday,
          overdue,
        },
        activity: await activityFor(ids),
      });
    } catch (err) {
      console.error('[cohort summary]', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  router.get('/cohort/groups/:id/students', async (req, res) => {
    try {
      const roster: GroupRoster = res.locals.roster;
      const stats = await statsFor(roster.members.map((m) => m.userId));
      const now = Date.now();
      const rows: CohortStudentRow[] = roster.members.map((m) => {
        const s = stats.get(m.userId);
        if (!s) {
          return {
            userId: m.userId, username: m.username, hasData: false,
            totalTopics: 0, completedTopics: 0, completionPct: 0,
            streakDays: 0, dueToday: 0, overdue: 0, subjectCoverage: [],
          };
        }
        const d = dueCounts(s.due_histogram, now);
        return {
          userId: m.userId, username: m.username, hasData: true,
          totalTopics: s.total_topics, completedTopics: s.completed_topics,
          completionPct: s.total_topics === 0 ? 0 : Math.round((100 * s.completed_topics) / s.total_topics),
          streakDays: s.streak_days, dueToday: d.dueToday, overdue: d.overdue,
          subjectCoverage: s.subject_coverage,
        };
      });
      const sort = req.query.sort === 'overdue' ? 'overdue' : 'completion';
      rows.sort(sort === 'overdue'
        ? (a, b) => b.overdue - a.overdue
        : (a, b) => a.completionPct - b.completionPct); // worst-first for coaching
      const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
      res.json({
        page, pageSize: PAGE_SIZE, totalMembers: roster.members.length,
        students: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
      });
    } catch (err) {
      console.error('[cohort students]', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  router.get('/cohort/groups/:id/students/:userId', async (req, res) => {
    try {
      const roster: GroupRoster = res.locals.roster;
      const member = roster.members.find((m) => m.userId === req.params.userId);
      if (!member) return res.status(404).json({ error: 'No such student in this group' });

      const data = await readData(member.userId);
      const now = Date.now();
      // Whitelist projection: revision status only. NEVER spread topic objects
      // here — notes/attachments/flashcards/bookmarks/tags must not leak.
      const subjects = data
        ? data.subjectOrder
            .map((sid) => data.subjects[sid])
            .filter((s) => s && !s.archivedAt)
            .map((s) => ({
              id: s.id,
              name: s.name,
              chapters: s.chapterIds
                .map((cid) => data.chapters[cid])
                .filter((c) => c && !c.archivedAt)
                .map((c) => ({
                  id: c.id,
                  name: c.name,
                  topics: c.topicIds
                    .map((tid) => data.topics[tid])
                    .filter((t) => t && !t.archivedAt)
                    .map((t) => ({
                      id: t.id,
                      title: t.title,
                      state: badgeState(t.revisionHistory, now),
                      revisionCount: t.revisionHistory.length,
                      lastRevisedAt: lastRevisedAt(t.revisionHistory) ?? null,
                      nextDueAt: nextDueDate(t.revisionHistory) ?? null,
                    })),
                })),
            }))
        : [];
      const drilldown: StudentDrilldown = {
        userId: member.userId,
        username: member.username,
        activity: await activityFor([member.userId]),
        subjects,
      };
      res.json(drilldown);
    } catch (err) {
      console.error('[cohort drilldown]', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  return router;
}
```

In `server.ts`, inside `createApp` after `app.use(express.json({ limit: '5mb' }));` add:

```ts
app.use(cohortRouter());
```
with `import { cohortRouter } from './cohort';` at the top.

- [ ] **Step 5: Run tests — verify pass**

```bash
npm test -w services/content-service
npx tsc --noEmit
```
Expected: all content-service tests PASS; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add services/content-service/src
git commit -m "feat(content): cohort summary, student table, and redacted drill-down endpoints"
```

---

### Task 10: Frontend proxy routes + typed org client

**Files:**
- Create: `apps/frontend/app/api/orgs/route.ts`
- Create: `apps/frontend/app/api/orgs/me/route.ts`
- Create: `apps/frontend/app/api/orgs/join/route.ts`
- Create: `apps/frontend/app/api/orgs/[id]/groups/route.ts`
- Create: `apps/frontend/app/api/groups/[id]/invite-codes/route.ts`
- Create: `apps/frontend/app/api/groups/[id]/heads/route.ts`
- Create: `apps/frontend/app/api/groups/[id]/members/[userId]/route.ts`
- Create: `apps/frontend/app/api/invite-codes/[code]/route.ts`
- Create: `apps/frontend/app/api/cohort/groups/[id]/summary/route.ts`
- Create: `apps/frontend/app/api/cohort/groups/[id]/students/route.ts`
- Create: `apps/frontend/app/api/cohort/groups/[id]/students/[userId]/route.ts`
- Create: `apps/frontend/lib/orgs/client.ts`
- Create: `apps/frontend/lib/orgs/client.test.ts`

**Interfaces:**
- Consumes: `proxyRequest` from `@/lib/serviceProxy`; `authFetch` from `@/lib/auth/client`; org types from `@revision-app/shared`.
- Produces — `lib/orgs/client.ts` (each returns parsed JSON; on non-2xx returns `{ error }` from the body):
  - `fetchMemberships(): Promise<{ memberships: MembershipSummary[] } | { error: string }>`
  - `createOrganisation(name: string): Promise<{ id: string; name: string } | { error: string }>`
  - `joinWithCode(code: string): Promise<{ membership: MembershipSummary } | { error: string }>`
  - `createGroup(orgId: string, name: string): Promise<{ id: string; name: string } | { error: string }>`
  - `listGroups(orgId: string): Promise<{ groups: { id: string; name: string }[] } | { error: string }>`
  - `createInviteCode(groupId: string): Promise<{ code: string } | { error: string }>`
  - `assignHead(groupId: string, username: string): Promise<{ message: string } | { error: string }>`
  - `leaveGroup(groupId: string, userId: string): Promise<{ ok: true } | { error: string }>`
  - `fetchCohortSummary(groupId: string): Promise<CohortSummary | { error: string }>`
  - `fetchCohortStudents(groupId: string, page: number, sort: 'completion' | 'overdue'): Promise<{ page: number; pageSize: number; totalMembers: number; students: CohortStudentRow[] } | { error: string }>`
  - `fetchStudentDrilldown(groupId: string, userId: string): Promise<StudentDrilldown | { error: string }>`

- [ ] **Step 1: Write the proxy routes**

Every org route follows the login-route pattern. Auth-service proxies:

`apps/frontend/app/api/orgs/route.ts`:
```ts
import { proxyRequest } from '@/lib/serviceProxy';
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? 'http://127.0.0.1:4001';
export async function POST(req: Request) {
  return proxyRequest(req, `${AUTH_SERVICE_URL}/orgs`);
}
```

`apps/frontend/app/api/orgs/me/route.ts`:
```ts
import { proxyRequest } from '@/lib/serviceProxy';
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? 'http://127.0.0.1:4001';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  return proxyRequest(req, `${AUTH_SERVICE_URL}/me/orgs`);
}
```

`apps/frontend/app/api/orgs/join/route.ts`:
```ts
import { proxyRequest } from '@/lib/serviceProxy';
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? 'http://127.0.0.1:4001';
export async function POST(req: Request) {
  return proxyRequest(req, `${AUTH_SERVICE_URL}/orgs/join`);
}
```

`apps/frontend/app/api/orgs/[id]/groups/route.ts` (Next 15: `params` is a Promise):
```ts
import { proxyRequest } from '@/lib/serviceProxy';
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? 'http://127.0.0.1:4001';
export const dynamic = 'force-dynamic';
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyRequest(req, `${AUTH_SERVICE_URL}/orgs/${id}/groups`);
}
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyRequest(req, `${AUTH_SERVICE_URL}/orgs/${id}/groups`);
}
```

`apps/frontend/app/api/groups/[id]/invite-codes/route.ts`:
```ts
import { proxyRequest } from '@/lib/serviceProxy';
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? 'http://127.0.0.1:4001';
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyRequest(req, `${AUTH_SERVICE_URL}/groups/${id}/invite-codes`);
}
```

`apps/frontend/app/api/groups/[id]/heads/route.ts`:
```ts
import { proxyRequest } from '@/lib/serviceProxy';
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? 'http://127.0.0.1:4001';
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyRequest(req, `${AUTH_SERVICE_URL}/groups/${id}/heads`);
}
```

`apps/frontend/app/api/groups/[id]/members/[userId]/route.ts`:
```ts
import { proxyRequest } from '@/lib/serviceProxy';
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? 'http://127.0.0.1:4001';
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const { id, userId } = await params;
  return proxyRequest(req, `${AUTH_SERVICE_URL}/groups/${id}/members/${userId}`);
}
```

`apps/frontend/app/api/invite-codes/[code]/route.ts`:
```ts
import { proxyRequest } from '@/lib/serviceProxy';
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? 'http://127.0.0.1:4001';
export async function DELETE(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return proxyRequest(req, `${AUTH_SERVICE_URL}/invite-codes/${code}`);
}
```

Content-service proxies:

`apps/frontend/app/api/cohort/groups/[id]/summary/route.ts`:
```ts
import { proxyRequest } from '@/lib/serviceProxy';
const CONTENT_SERVICE_URL = process.env.CONTENT_SERVICE_URL ?? 'http://127.0.0.1:4002';
export const dynamic = 'force-dynamic';
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyRequest(req, `${CONTENT_SERVICE_URL}/cohort/groups/${id}/summary`);
}
```

`apps/frontend/app/api/cohort/groups/[id]/students/route.ts` (must forward the query string):
```ts
import { proxyRequest } from '@/lib/serviceProxy';
const CONTENT_SERVICE_URL = process.env.CONTENT_SERVICE_URL ?? 'http://127.0.0.1:4002';
export const dynamic = 'force-dynamic';
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { search } = new URL(req.url);
  return proxyRequest(req, `${CONTENT_SERVICE_URL}/cohort/groups/${id}/students${search}`);
}
```

`apps/frontend/app/api/cohort/groups/[id]/students/[userId]/route.ts`:
```ts
import { proxyRequest } from '@/lib/serviceProxy';
const CONTENT_SERVICE_URL = process.env.CONTENT_SERVICE_URL ?? 'http://127.0.0.1:4002';
export const dynamic = 'force-dynamic';
export async function GET(req: Request, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const { id, userId } = await params;
  return proxyRequest(req, `${CONTENT_SERVICE_URL}/cohort/groups/${id}/students/${userId}`);
}
```

- [ ] **Step 2: Write the failing client test**

`apps/frontend/lib/orgs/client.test.ts`:

```ts
import { it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ authFetch: vi.fn() }));
vi.mock('@/lib/auth/client', () => ({ authFetch: mocks.authFetch }));

import { fetchMemberships, joinWithCode, fetchCohortStudents } from './client';

beforeEach(() => vi.clearAllMocks());

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

it('fetchMemberships GETs /api/orgs/me', async () => {
  mocks.authFetch.mockResolvedValue(json({ memberships: [] }));
  expect(await fetchMemberships()).toEqual({ memberships: [] });
  expect(mocks.authFetch).toHaveBeenCalledWith('/api/orgs/me');
});

it('joinWithCode POSTs the code and surfaces server errors', async () => {
  mocks.authFetch.mockResolvedValue(json({ error: 'Invalid or expired code' }, 400));
  expect(await joinWithCode('NOPE-XXXX')).toEqual({ error: 'Invalid or expired code' });
  expect(mocks.authFetch).toHaveBeenCalledWith('/api/orgs/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'NOPE-XXXX' }),
  });
});

it('fetchCohortStudents passes page and sort through', async () => {
  mocks.authFetch.mockResolvedValue(json({ page: 2, pageSize: 50, totalMembers: 0, students: [] }));
  await fetchCohortStudents('g1', 2, 'overdue');
  expect(mocks.authFetch).toHaveBeenCalledWith('/api/cohort/groups/g1/students?page=2&sort=overdue');
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npm test -w apps/frontend
```
Expected: FAIL — `Cannot find module './client'` (under `lib/orgs/`).

- [ ] **Step 4: Write the client**

`apps/frontend/lib/orgs/client.ts`:

```ts
import { authFetch } from '@/lib/auth/client';
import type { CohortStudentRow, CohortSummary, MembershipSummary, StudentDrilldown } from '@revision-app/shared';

async function parse<T>(res: Response): Promise<T | { error: string }> {
  if (res.status === 204) return { ok: true } as T;
  const body = await res.json().catch(() => ({ error: 'Unexpected server response' }));
  if (!res.ok) return { error: (body as { error?: string }).error ?? 'Request failed' };
  return body as T;
}

const post = (url: string, body: unknown) =>
  authFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export function fetchMemberships() {
  return authFetch('/api/orgs/me').then((r) => parse<{ memberships: MembershipSummary[] }>(r));
}
export function createOrganisation(name: string) {
  return post('/api/orgs', { name }).then((r) => parse<{ id: string; name: string }>(r));
}
export function joinWithCode(code: string) {
  return post('/api/orgs/join', { code }).then((r) => parse<{ membership: MembershipSummary }>(r));
}
export function createGroup(orgId: string, name: string) {
  return post(`/api/orgs/${orgId}/groups`, { name }).then((r) => parse<{ id: string; name: string }>(r));
}
export function listGroups(orgId: string) {
  return authFetch(`/api/orgs/${orgId}/groups`).then((r) => parse<{ groups: { id: string; name: string }[] }>(r));
}
export function createInviteCode(groupId: string) {
  return post(`/api/groups/${groupId}/invite-codes`, {}).then((r) => parse<{ code: string }>(r));
}
export function assignHead(groupId: string, username: string) {
  return post(`/api/groups/${groupId}/heads`, { username }).then((r) => parse<{ message: string }>(r));
}
export function leaveGroup(groupId: string, userId: string) {
  return authFetch(`/api/groups/${groupId}/members/${userId}`, { method: 'DELETE' }).then((r) => parse<{ ok: true }>(r));
}
export function fetchCohortSummary(groupId: string) {
  return authFetch(`/api/cohort/groups/${groupId}/summary`).then((r) => parse<CohortSummary>(r));
}
export function fetchCohortStudents(groupId: string, page: number, sort: 'completion' | 'overdue') {
  return authFetch(`/api/cohort/groups/${groupId}/students?page=${page}&sort=${sort}`)
    .then((r) => parse<{ page: number; pageSize: number; totalMembers: number; students: CohortStudentRow[] }>(r));
}
export function fetchStudentDrilldown(groupId: string, userId: string) {
  return authFetch(`/api/cohort/groups/${groupId}/students/${userId}`).then((r) => parse<StudentDrilldown>(r));
}
```

Note: `authFetch(url, init?)` is already exported from `lib/auth/client.ts` and attaches the stored bearer token — use it as-is.

- [ ] **Step 5: Run tests + typecheck — verify pass**

```bash
npm test -w apps/frontend
npx tsc --noEmit
```
Expected: PASS / clean.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/app/api apps/frontend/lib/orgs
git commit -m "feat(frontend): org and cohort API proxies with typed client"
```

---

### Task 11: Settings → Organisation card

**Files:**
- Create: `apps/frontend/components/settings/OrganisationCard.tsx`
- Create: `apps/frontend/components/settings/OrganisationCard.test.tsx`
- Modify: `apps/frontend/app/settings/page.tsx`

**Interfaces:**
- Consumes: `lib/orgs/client.ts` functions (Task 10); `useAuth` from `@/components/AuthProvider`; `MembershipSummary` from `@revision-app/shared`.
- Produces: `<OrganisationCard />` — self-contained client component; the settings page renders it below the existing account card with no props.

Behavior:
- On mount, `fetchMemberships()`. While loading show `Loading…`.
- Always visible: **Join with code** form (input + Join button) and **Create organisation** form (name input + Create button). Both refetch memberships on success and show the server `error` string on failure.
- Membership list: one row per membership — `{orgName} / {groupName ?? 'Organisation'} — {role}`; group memberships get a *Leave* button (calls `leaveGroup(groupId, session.userId)`, refetches).
- For each `admin` membership, an **Admin panel** for that org: create-group form; per group (via `listGroups`) a *New invite code* button that displays the generated code in a `<code>` element, and an *Assign head* form (username input).

- [ ] **Step 1: Write the failing component test**

`apps/frontend/components/settings/OrganisationCard.test.tsx`:

```tsx
import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({
  fetchMemberships: vi.fn(),
  createOrganisation: vi.fn(),
  joinWithCode: vi.fn(),
  createGroup: vi.fn(),
  listGroups: vi.fn(),
  createInviteCode: vi.fn(),
  assignHead: vi.fn(),
  leaveGroup: vi.fn(),
  useAuth: vi.fn(),
}));
vi.mock('@/lib/orgs/client', () => ({
  fetchMemberships: mocks.fetchMemberships,
  createOrganisation: mocks.createOrganisation,
  joinWithCode: mocks.joinWithCode,
  createGroup: mocks.createGroup,
  listGroups: mocks.listGroups,
  createInviteCode: mocks.createInviteCode,
  assignHead: mocks.assignHead,
  leaveGroup: mocks.leaveGroup,
}));
vi.mock('@/components/AuthProvider', () => ({ useAuth: mocks.useAuth }));

import { OrganisationCard } from './OrganisationCard';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useAuth.mockReturnValue({ session: { userId: 'u1', username: 'alice', domain: 'civil-engineering' }, loading: false });
  mocks.listGroups.mockResolvedValue({ groups: [] });
});

it('lets a solo user join with a code', async () => {
  mocks.fetchMemberships.mockResolvedValue({ memberships: [] });
  mocks.joinWithCode.mockResolvedValue({ membership: { orgId: 'o1', orgName: 'XYZ', groupId: 'g1', groupName: 'Batch A', role: 'member' } });
  render(<OrganisationCard />);
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Join with code'), 'BATCHA-7F3K');
  await user.click(screen.getByRole('button', { name: 'Join' }));
  await waitFor(() => expect(mocks.joinWithCode).toHaveBeenCalledWith('BATCHA-7F3K'));
  expect(mocks.fetchMemberships).toHaveBeenCalledTimes(2); // mount + after join
});

it('shows memberships and a leave button for group rows', async () => {
  mocks.fetchMemberships.mockResolvedValue({
    memberships: [{ orgId: 'o1', orgName: 'XYZ', groupId: 'g1', groupName: 'Batch A', role: 'member' }],
  });
  mocks.leaveGroup.mockResolvedValue({ ok: true });
  render(<OrganisationCard />);
  expect(await screen.findByText(/XYZ \/ Batch A/)).toBeInTheDocument();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Leave' }));
  await waitFor(() => expect(mocks.leaveGroup).toHaveBeenCalledWith('g1', 'u1'));
});

it('shows the admin panel with invite-code generation for org admins', async () => {
  mocks.fetchMemberships.mockResolvedValue({
    memberships: [{ orgId: 'o1', orgName: 'XYZ', groupId: null, groupName: null, role: 'admin' }],
  });
  mocks.listGroups.mockResolvedValue({ groups: [{ id: 'g1', name: 'Batch A' }] });
  mocks.createInviteCode.mockResolvedValue({ code: 'BATCHA-7F3K' });
  render(<OrganisationCard />);
  expect(await screen.findByText('Batch A')).toBeInTheDocument();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'New invite code' }));
  expect(await screen.findByText('BATCHA-7F3K')).toBeInTheDocument();
});

it('surfaces join errors', async () => {
  mocks.fetchMemberships.mockResolvedValue({ memberships: [] });
  mocks.joinWithCode.mockResolvedValue({ error: 'Invalid or expired code' });
  render(<OrganisationCard />);
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Join with code'), 'BAD-CODE');
  await user.click(screen.getByRole('button', { name: 'Join' }));
  expect(await screen.findByText('Invalid or expired code')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -w apps/frontend
```
Expected: FAIL — `Cannot find module './OrganisationCard'`.

- [ ] **Step 3: Write the component**

`apps/frontend/components/settings/OrganisationCard.tsx` — follow the settings page's existing markup conventions (`auth-field`, `auth-label`, `auth-subtitle`, `auth-error` class names; look at `app/settings/page.tsx` while building):

```tsx
'use client';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import type { MembershipSummary } from '@revision-app/shared';
import {
  fetchMemberships, createOrganisation, joinWithCode, createGroup,
  listGroups, createInviteCode, assignHead, leaveGroup,
} from '@/lib/orgs/client';

function AdminPanel({ orgId, orgName }: { orgId: string; orgName: string }) {
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [groupName, setGroupName] = useState('');
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [headNames, setHeadNames] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(() => {
    listGroups(orgId).then((r) => { if (!('error' in r)) setGroups(r.groups); });
  }, [orgId]);
  useEffect(refresh, [refresh]);

  async function handleCreateGroup(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const r = await createGroup(orgId, groupName.trim());
    if ('error' in r) setError(r.error);
    else { setGroupName(''); refresh(); }
  }

  async function handleInvite(groupId: string) {
    const r = await createInviteCode(groupId);
    if ('error' in r) setError(r.error);
    else setCodes((c) => ({ ...c, [groupId]: r.code }));
  }

  async function handleAssignHead(e: React.FormEvent, groupId: string) {
    e.preventDefault();
    setError('');
    setNotice('');
    const r = await assignHead(groupId, (headNames[groupId] ?? '').trim());
    if ('error' in r) setError(r.error);
    else setNotice(r.message);
  }

  return (
    <div className="auth-field">
      <span className="auth-label">Manage {orgName}</span>
      <form onSubmit={handleCreateGroup} className="flex gap-2">
        <input
          aria-label={`New group in ${orgName}`}
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          placeholder="New group name"
        />
        <button type="submit" disabled={!groupName.trim()}>Create group</button>
      </form>
      <ul>
        {groups.map((g) => (
          <li key={g.id}>
            <span>{g.name}</span>
            <button type="button" onClick={() => handleInvite(g.id)}>New invite code</button>
            {codes[g.id] && <code>{codes[g.id]}</code>}
            <form onSubmit={(e) => handleAssignHead(e, g.id)} className="flex gap-2">
              <input
                aria-label={`Head username for ${g.name}`}
                value={headNames[g.id] ?? ''}
                onChange={(e) => setHeadNames((h) => ({ ...h, [g.id]: e.target.value }))}
                placeholder="Username to make head"
              />
              <button type="submit" disabled={!(headNames[g.id] ?? '').trim()}>Assign head</button>
            </form>
          </li>
        ))}
      </ul>
      {notice && <p className="auth-subtitle">{notice}</p>}
      {error && <p className="auth-error">{error}</p>}
    </div>
  );
}

export function OrganisationCard() {
  const { session } = useAuth();
  const [memberships, setMemberships] = useState<MembershipSummary[] | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [orgName, setOrgName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(() => {
    fetchMemberships().then((r) => setMemberships('error' in r ? [] : r.memberships));
  }, []);
  useEffect(refresh, [refresh]);

  if (!session) return null;

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    const r = await joinWithCode(joinCode.trim().toUpperCase());
    if ('error' in r) setError(r.error);
    else {
      setNotice(`Joined ${r.membership.orgName} / ${r.membership.groupName}`);
      setJoinCode('');
      refresh();
    }
  }

  async function handleCreateOrg(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    const r = await createOrganisation(orgName.trim());
    if ('error' in r) setError(r.error);
    else {
      setNotice(`Created ${r.name} — you are its admin`);
      setOrgName('');
      refresh();
    }
  }

  async function handleLeave(groupId: string) {
    if (!session) return;
    const r = await leaveGroup(groupId, session.userId);
    if ('error' in r) setError(r.error);
    else refresh();
  }

  const admins = memberships?.filter((m) => m.role === 'admin' && m.groupId === null) ?? [];

  return (
    <div className="auth-card">
      <h2 className="auth-title">Organisation</h2>
      {memberships === null ? (
        <p className="auth-subtitle">Loading…</p>
      ) : (
        <>
          {memberships.length > 0 && (
            <ul>
              {memberships.map((m) => (
                <li key={`${m.orgId}:${m.groupId ?? 'org'}`}>
                  {m.orgName} / {m.groupName ?? 'Organisation'} — {m.role}
                  {m.groupId && m.role === 'member' && (
                    <button type="button" onClick={() => handleLeave(m.groupId!)}>Leave</button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={handleJoin} className="auth-field">
            <label className="auth-label" htmlFor="org-join-code">Join with code</label>
            <input id="org-join-code" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="e.g. BATCHA-7F3K" />
            <button type="submit" disabled={!joinCode.trim()}>Join</button>
          </form>
          <form onSubmit={handleCreateOrg} className="auth-field">
            <label className="auth-label" htmlFor="org-create-name">Create organisation</label>
            <input id="org-create-name" value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Organisation name" />
            <button type="submit" disabled={orgName.trim().length < 3}>Create</button>
          </form>
          {admins.map((m) => <AdminPanel key={m.orgId} orgId={m.orgId} orgName={m.orgName} />)}
        </>
      )}
      {notice && <p className="auth-subtitle">{notice}</p>}
      {error && <p className="auth-error">{error}</p>}
    </div>
  );
}
```

In `app/settings/page.tsx`: add `import { OrganisationCard } from '@/components/settings/OrganisationCard';` and render `<OrganisationCard />` as a sibling directly after the existing `auth-card` div (inside `auth-card-wrap`).

Adjust class names/markup to match what the existing settings page actually uses (verify `auth-error` exists; if the page uses a different error class, use that one).

- [ ] **Step 4: Run tests — verify pass**

```bash
npm test -w apps/frontend
```
Expected: PASS (card tests + the existing settings page tests still green).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/components/settings apps/frontend/app/settings
git commit -m "feat(frontend): organisation management card in settings"
```

---

### Task 12: Coaching nav gating + dashboard page

**Files:**
- Create: `apps/frontend/lib/orgs/useMemberships.ts`
- Create: `apps/frontend/app/coaching/page.tsx`
- Create: `apps/frontend/app/coaching/CoachingPage.test.tsx`
- Modify: `apps/frontend/components/layout/AppShell.tsx`
- Modify: `apps/frontend/components/layout/MobileNavDrawer.tsx`

**Interfaces:**
- Consumes: `fetchMemberships`, `listGroups`, `fetchCohortSummary`, `fetchCohortStudents` (Task 10); `useAuth`; `StatTile` from `@/components/insights/StatTile` (props: `label: string; value: string | number; caption?: string; tone?: 'ink' | 'accent' | 'go' | 'annotation' | 'alarm'`); `CohortSummary`, `CohortStudentRow`, `MembershipSummary` from `@revision-app/shared`.
- Produces:
  - `useMemberships(): { memberships: MembershipSummary[] | null; isCoach: boolean }` — fetches once per mount when a session exists; `isCoach` true iff any membership has role `admin` or `head`; `memberships === null` while loading or logged out.
  - `/coaching` page; "Coaching" links in both nav components rendered only when `isCoach`.

- [ ] **Step 1: Write the hook**

`apps/frontend/lib/orgs/useMemberships.ts`:

```ts
'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import type { MembershipSummary } from '@revision-app/shared';
import { fetchMemberships } from '@/lib/orgs/client';

export function useMemberships(): { memberships: MembershipSummary[] | null; isCoach: boolean } {
  const { session } = useAuth();
  const [memberships, setMemberships] = useState<MembershipSummary[] | null>(null);

  useEffect(() => {
    if (!session) {
      setMemberships(null);
      return;
    }
    let cancelled = false;
    fetchMemberships().then((r) => {
      if (!cancelled) setMemberships('error' in r ? [] : r.memberships);
    });
    return () => {
      cancelled = true;
    };
  }, [session]);

  return {
    memberships,
    isCoach: memberships?.some((m) => m.role === 'admin' || m.role === 'head') ?? false,
  };
}
```

- [ ] **Step 2: Gate the nav links**

In `components/layout/AppShell.tsx`: import and call `useMemberships()` inside the component, then insert directly after the Insights link (line ~51):

```tsx
{isCoach && (
  <Link href="/coaching" className="tblabel hidden rounded px-2 py-1 transition hover:bg-panel hover:text-ink sm:block">Coaching</Link>
)}
```

In `components/layout/MobileNavDrawer.tsx`: same pattern next to its Insights link, using that file's existing link classes.

Run `npm test -w apps/frontend` — existing AppShell-adjacent tests (NavTree, MobileNavDrawer) must still PASS. The drawer test may need `fetchMemberships` mocked; if it fails with an unmocked fetch, add at the top of the failing test file:

```ts
vi.mock('@/lib/orgs/client', () => ({ fetchMemberships: vi.fn().mockResolvedValue({ memberships: [] }) }));
```

- [ ] **Step 3: Write the failing dashboard test**

`apps/frontend/app/coaching/CoachingPage.test.tsx`:

```tsx
import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  fetchMemberships: vi.fn(),
  listGroups: vi.fn(),
  fetchCohortSummary: vi.fn(),
  fetchCohortStudents: vi.fn(),
}));
vi.mock('@/components/AuthProvider', () => ({ useAuth: mocks.useAuth }));
vi.mock('@/lib/orgs/client', () => ({
  fetchMemberships: mocks.fetchMemberships,
  listGroups: mocks.listGroups,
  fetchCohortSummary: mocks.fetchCohortSummary,
  fetchCohortStudents: mocks.fetchCohortStudents,
}));

import CoachingPage from './page';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useAuth.mockReturnValue({ session: { userId: 'coach', username: 'coach', domain: 'civil-engineering' }, loading: false });
  mocks.fetchMemberships.mockResolvedValue({
    memberships: [{ orgId: 'o1', orgName: 'XYZ', groupId: 'g1', groupName: 'Batch A', role: 'head' }],
  });
  mocks.fetchCohortSummary.mockResolvedValue({
    group: { id: 'g1', name: 'Batch A', orgName: 'XYZ' },
    totals: { members: 2, completionPct: 68, dueToday: 12, overdue: 5 },
    activity: [{ day: '2026-07-15', revisions: 9 }],
  });
  mocks.fetchCohortStudents.mockResolvedValue({
    page: 1, pageSize: 50, totalMembers: 2,
    students: [
      { userId: 'u1', username: 'sharma', hasData: true, totalTopics: 100, completedTopics: 82, completionPct: 82, streakDays: 12, dueToday: 1, overdue: 0, subjectCoverage: [{ subject: 'Soil', total: 50, revised: 41 }] },
      { userId: 'u2', username: 'nair', hasData: false, totalTopics: 0, completedTopics: 0, completionPct: 0, streakDays: 0, dueToday: 0, overdue: 0, subjectCoverage: [] },
    ],
  });
});

it('renders rollup tiles, the student table, and a no-data row', async () => {
  render(<CoachingPage />);
  await waitFor(() => expect(mocks.fetchCohortSummary).toHaveBeenCalledWith('g1'));
  expect(await screen.findByText('68%')).toBeInTheDocument();   // completion tile
  expect(screen.getByText('12')).toBeInTheDocument();           // due today tile
  expect(screen.getByText('sharma')).toBeInTheDocument();
  expect(screen.getByText('No data yet')).toBeInTheDocument();  // u2 row
});

it('shows a friendly message for non-coaches', async () => {
  mocks.fetchMemberships.mockResolvedValue({ memberships: [] });
  render(<CoachingPage />);
  expect(await screen.findByText(/You are not a head of any group/)).toBeInTheDocument();
});
```

- [ ] **Step 4: Run test to verify it fails**

```bash
npm test -w apps/frontend
```
Expected: FAIL — `Cannot find module './page'` under `app/coaching/`.

- [ ] **Step 5: Write the dashboard page**

`apps/frontend/app/coaching/page.tsx`:

```tsx
'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { StatTile } from '@/components/insights/StatTile';
import type { CohortStudentRow, CohortSummary, MembershipSummary } from '@revision-app/shared';
import { fetchMemberships, listGroups, fetchCohortSummary, fetchCohortStudents } from '@/lib/orgs/client';

interface GroupOption { groupId: string; label: string }

// Heads coach the group on their membership row; admins coach every group in
// their org, which takes one listGroups call per admin org to enumerate.
async function resolveGroupOptions(memberships: MembershipSummary[]): Promise<GroupOption[]> {
  const options = new Map<string, GroupOption>();
  for (const m of memberships) {
    if (m.role === 'head' && m.groupId) {
      options.set(m.groupId, { groupId: m.groupId, label: `${m.orgName} / ${m.groupName}` });
    }
    if (m.role === 'admin' && m.groupId === null) {
      const r = await listGroups(m.orgId);
      if (!('error' in r)) {
        for (const g of r.groups) options.set(g.id, { groupId: g.id, label: `${m.orgName} / ${g.name}` });
      }
    }
  }
  return [...options.values()];
}

function ActivityBars({ activity }: { activity: { day: string; revisions: number }[] }) {
  const max = Math.max(1, ...activity.map((a) => a.revisions));
  return (
    <div className="glass rounded-xl p-4">
      <div className="tblabel mb-2">Revision activity (last 30 days)</div>
      <div className="flex h-24 items-end gap-1" role="img" aria-label="Cohort revision activity">
        {activity.map((a) => (
          <div
            key={a.day}
            title={`${a.day}: ${a.revisions}`}
            className="w-2 rounded-t bg-accent"
            style={{ height: `${Math.round((a.revisions / max) * 100)}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export default function CoachingPage() {
  const { session, loading } = useAuth();
  const [groups, setGroups] = useState<GroupOption[] | null>(null);
  const [selected, setSelected] = useState<string>('');
  const [summary, setSummary] = useState<CohortSummary | null>(null);
  const [students, setStudents] = useState<CohortStudentRow[]>([]);
  const [totalMembers, setTotalMembers] = useState(0);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<'completion' | 'overdue'>('completion');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!session) return;
    fetchMemberships().then(async (r) => {
      const options = 'error' in r ? [] : await resolveGroupOptions(r.memberships);
      setGroups(options);
      if (options[0]) setSelected(options[0].groupId);
    });
  }, [session]);

  useEffect(() => {
    if (!selected) return;
    setError('');
    fetchCohortSummary(selected).then((r) => ('error' in r ? setError(r.error) : setSummary(r)));
  }, [selected]);

  useEffect(() => {
    if (!selected) return;
    fetchCohortStudents(selected, page, sort).then((r) => {
      if (!('error' in r)) {
        setStudents(r.students);
        setTotalMembers(r.totalMembers);
      }
    });
  }, [selected, page, sort]);

  const subjects = useMemo(() => {
    const names = new Set<string>();
    for (const s of students) for (const c of s.subjectCoverage) names.add(c.subject);
    return [...names];
  }, [students]);

  if (loading || !session) return null;
  if (groups && groups.length === 0) {
    return <p className="p-6">You are not a head of any group yet — ask your organisation admin, or create an organisation in Settings.</p>;
  }
  if (!groups || !summary) return <p className="p-6">Loading…</p>;

  const pages = Math.max(1, Math.ceil(totalMembers / 50));

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="bp-figure text-2xl">Coaching Dashboard</h1>
        {groups.length > 1 ? (
          <select aria-label="Group" value={selected} onChange={(e) => { setSelected(e.target.value); setPage(1); }}>
            {groups.map((g) => <option key={g.groupId} value={g.groupId}>{g.label}</option>)}
          </select>
        ) : (
          <span className="tblabel">{groups[0].label}</span>
        )}
      </div>
      {error && <p className="text-alarm">{error}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Cohort completion" value={`${summary.totals.completionPct}%`} />
        <StatTile label="Students" value={summary.totals.members} />
        <StatTile label="Due today" value={summary.totals.dueToday} tone="accent" />
        <StatTile label="Overdue" value={summary.totals.overdue} tone="alarm" />
      </div>

      <ActivityBars activity={summary.activity} />

      <div className="glass overflow-x-auto rounded-xl p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="tblabel">Students</div>
          <select aria-label="Sort" value={sort} onChange={(e) => { setSort(e.target.value as 'completion' | 'overdue'); setPage(1); }}>
            <option value="completion">Lowest completion first</option>
            <option value="overdue">Most overdue first</option>
          </select>
        </div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="tblabel">
              <th>Student</th><th>Completion</th><th>Streak</th><th>Status</th>
              {subjects.map((s) => <th key={s}>{s}</th>)}
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.userId}>
                <td>
                  <Link className="underline" href={`/coaching/${selected}/${s.userId}`}>{s.username}</Link>
                </td>
                {s.hasData ? (
                  <>
                    <td>{s.completionPct}%</td>
                    <td>{s.streakDays}d</td>
                    <td>{s.overdue > 0 ? `Overdue (${s.overdue})` : 'On track'}</td>
                    {subjects.map((name) => {
                      const cov = s.subjectCoverage.find((c) => c.subject === name);
                      const pct = cov && cov.total > 0 ? Math.round((100 * cov.revised) / cov.total) : null;
                      return (
                        <td key={name}>
                          {pct === null ? '—' : (
                            <span className="inline-block rounded bg-accent px-1" style={{ opacity: Math.max(0.15, pct / 100) }}>
                              {pct}%
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </>
                ) : (
                  <td colSpan={3 + subjects.length}>No data yet</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {pages > 1 && (
          <div className="mt-2 flex items-center gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button>
            <span className="tblabel">page {page} / {pages}</span>
            <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        )}
      </div>
    </div>
  );
}
```

Match the visual details (spacing, classes) to the existing `/insights` page while building — the structure above is the contract, the styling should look native.

- [ ] **Step 6: Run tests — verify pass**

```bash
npm test -w apps/frontend
npx tsc --noEmit
```
Expected: PASS / clean.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/lib/orgs apps/frontend/app/coaching apps/frontend/components/layout
git commit -m "feat(frontend): role-gated coaching nav and cohort dashboard"
```

---

### Task 13: Student drill-down page

**Files:**
- Create: `apps/frontend/app/coaching/[groupId]/[userId]/page.tsx`
- Create: `apps/frontend/app/coaching/[groupId]/[userId]/DrilldownPage.test.tsx`

**Interfaces:**
- Consumes: `fetchStudentDrilldown` (Task 10); `useAuth`; `StudentDrilldown` from `@revision-app/shared`; Next's `useParams`.
- Produces: read-only page at `/coaching/[groupId]/[userId]` — student header + per-topic badge tree + personal activity bars. Renders only whitelisted fields (the API already redacts; the page never asks for more).

- [ ] **Step 1: Write the failing test**

`apps/frontend/app/coaching/[groupId]/[userId]/DrilldownPage.test.tsx`:

```tsx
import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useParams: vi.fn(),
  fetchStudentDrilldown: vi.fn(),
}));
vi.mock('@/components/AuthProvider', () => ({ useAuth: mocks.useAuth }));
vi.mock('next/navigation', () => ({ useParams: mocks.useParams }));
vi.mock('@/lib/orgs/client', () => ({ fetchStudentDrilldown: mocks.fetchStudentDrilldown }));

import DrilldownPage from './page';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useAuth.mockReturnValue({ session: { userId: 'coach', username: 'coach', domain: 'civil-engineering' }, loading: false });
  mocks.useParams.mockReturnValue({ groupId: 'g1', userId: 'u1' });
});

it('renders the student topic tree with badge states', async () => {
  mocks.fetchStudentDrilldown.mockResolvedValue({
    userId: 'u1', username: 'sharma',
    activity: [{ day: '2026-07-15', revisions: 3 }],
    subjects: [{
      id: 's1', name: 'Soil Mechanics',
      chapters: [{ id: 'c1', name: 'Bearing Capacity', topics: [
        { id: 't1', title: 'Terzaghi theory', state: 'Overdue', revisionCount: 2, lastRevisedAt: 1, nextDueAt: 2 },
      ] }],
    }],
  });
  render(<DrilldownPage />);
  expect(await screen.findByText('sharma')).toBeInTheDocument();
  expect(screen.getByText('Soil Mechanics')).toBeInTheDocument();
  expect(screen.getByText('Terzaghi theory')).toBeInTheDocument();
  expect(screen.getByText('Overdue')).toBeInTheDocument();
});

it('shows the API error when access is denied', async () => {
  mocks.fetchStudentDrilldown.mockResolvedValue({ error: 'You are not a head of this group' });
  render(<DrilldownPage />);
  expect(await screen.findByText('You are not a head of this group')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -w apps/frontend
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the page**

`apps/frontend/app/coaching/[groupId]/[userId]/page.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import type { StudentDrilldown } from '@revision-app/shared';
import { fetchStudentDrilldown } from '@/lib/orgs/client';

const STATE_TONE: Record<string, string> = {
  NeverRevised: 'text-ink-faint',
  Overdue: 'text-alarm',
  DueToday: 'text-accent',
  DueTomorrow: 'text-accent',
  RecentlyRevised: 'text-go',
  Upcoming: 'text-ink',
};

export default function DrilldownPage() {
  const { session, loading } = useAuth();
  const params = useParams<{ groupId: string; userId: string }>();
  const [data, setData] = useState<StudentDrilldown | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!session) return;
    fetchStudentDrilldown(params.groupId, params.userId).then((r) => {
      if ('error' in r) setError(r.error);
      else setData(r);
    });
  }, [session, params.groupId, params.userId]);

  if (loading || !session) return null;
  if (error) return <p className="p-6 text-alarm">{error}</p>;
  if (!data) return <p className="p-6">Loading…</p>;

  const maxActivity = Math.max(1, ...data.activity.map((a) => a.revisions));

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center gap-3">
        <Link href="/coaching" className="tblabel underline">← Coaching</Link>
        <h1 className="bp-figure text-2xl">{data.username}</h1>
      </div>

      <div className="glass rounded-xl p-4">
        <div className="tblabel mb-2">Activity (last 30 days)</div>
        <div className="flex h-16 items-end gap-1" role="img" aria-label={`${data.username} revision activity`}>
          {data.activity.map((a) => (
            <div key={a.day} title={`${a.day}: ${a.revisions}`} className="w-2 rounded-t bg-accent"
              style={{ height: `${Math.round((a.revisions / maxActivity) * 100)}%` }} />
          ))}
        </div>
      </div>

      {data.subjects.map((s) => (
        <div key={s.id} className="glass rounded-xl p-4">
          <h2 className="bp-figure mb-2 text-lg">{s.name}</h2>
          {s.chapters.map((c) => (
            <div key={c.id} className="mb-3">
              <h3 className="tblabel mb-1">{c.name}</h3>
              <ul className="flex flex-col gap-1">
                {c.topics.map((t) => (
                  <li key={t.id} className="flex items-center justify-between text-sm">
                    <span>{t.title}</span>
                    <span className="flex items-center gap-3">
                      <span className="text-ink-faint">{t.revisionCount}×</span>
                      <span className={STATE_TONE[t.state] ?? 'text-ink'}>{t.state}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ))}
      {data.subjects.length === 0 && <p className="auth-subtitle">No data yet.</p>}
    </div>
  );
}
```

- [ ] **Step 4: Run tests — verify pass**

```bash
npm test -w apps/frontend
npx tsc --noEmit
npm run lint
```
Expected: PASS / clean / clean.

- [ ] **Step 5: Commit**

```bash
git add "apps/frontend/app/coaching/[groupId]"
git commit -m "feat(frontend): read-only student drill-down page"
```

---

### Task 14: Environment wiring, backfill, docs, end-to-end verification

**Files:**
- Modify: `docker-compose.yml`
- Modify: `.env.example`
- Modify: `README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: a deployable stack where auth-service and content-service share `SERVICE_SECRET`, content-service can reach auth-service, existing users have stats backfilled, and the README documents the feature.

- [ ] **Step 1: Wire environment**

`.env.example` — add after the SESSION_SECRET block:

```bash
# Shared secret for service-to-service calls (content-service -> auth-service
# internal roster API). Generate with: openssl rand -hex 32
SERVICE_SECRET=
```

`docker-compose.yml`:
- auth-service `environment`: add `- SERVICE_SECRET=${SERVICE_SECRET}`
- content-service `environment`: add `- SERVICE_SECRET=${SERVICE_SECRET}` and `- AUTH_SERVICE_URL=http://auth-service:4001`
- content-service `depends_on`: add `auth-service: { condition: service_started }` (match the file's existing depends_on style)

Add a real value to your local `.env`: `openssl rand -hex 32` → `SERVICE_SECRET=…`

- [ ] **Step 2: Update README**

In `README.md`:
- Replace the "Roadmap: Coaching Dashboard" section with a "Coaching dashboard" entry in the Features table: `| **Coaching dashboard** | Organisations → groups with invite-code joining; heads/admins see cohort completion, activity, per-student drill-down (revision status only — notes/attachments stay private) at /coaching |`
- In the Architecture section, note the new arrow: content-service → auth-service (`X-Service-Secret`, roster lookups) and add it to the mermaid diagram: `CONTENT -- "X-Service-Secret" --> AUTH`.
- Under Getting started, mention `SERVICE_SECRET` next to `SESSION_SECRET`, and document the one-off backfill: `docker compose exec content-service npm run backfill:stats`.

- [ ] **Step 3: Full verification suite**

```bash
cd /home/subaru/projects/revision_app
set -a; source .env; set +a
DATABASE_URL="postgres://revision:${POSTGRES_PASSWORD}@127.0.0.1:5433/revision_auth_test" npm test -w services/auth-service
DATABASE_URL="postgres://revision:${POSTGRES_PASSWORD}@127.0.0.1:5433/revision_content_test" npm test -w services/content-service
npm test -w packages/shared
npm test -w apps/frontend
npm test -w services/files-service
npx tsc --noEmit
npm run lint
```
Expected: every suite PASS, typecheck and lint clean.

- [ ] **Step 4: End-to-end smoke against the running stack**

```bash
docker compose up -d --build
docker compose exec content-service npm run backfill:stats
```

Then exercise the whole flow over HTTP (`jq` available; base URL `http://127.0.0.1:3200`):

```bash
BASE=http://127.0.0.1:3200
# 1. login as an existing user (or register + verify one)
TOKEN=$(curl -s $BASE/api/auth/login -H 'content-type: application/json' \
  -d '{"username":"<existing-user>","password":"<password>"}' | jq -r .token)
# 2. create org + group + invite
ORG=$(curl -s $BASE/api/orgs -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"name":"Smoke Academy"}' | jq -r .id)
GROUP=$(curl -s $BASE/api/orgs/$ORG/groups -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"name":"Batch A"}' | jq -r .id)
CODE=$(curl -s $BASE/api/groups/$GROUP/invite-codes -X POST -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{}' | jq -r .code)
# 3. join as a second user
TOKEN2=$(curl -s $BASE/api/auth/login -H 'content-type: application/json' \
  -d '{"username":"<second-user>","password":"<password>"}' | jq -r .token)
curl -s $BASE/api/orgs/join -H "authorization: Bearer $TOKEN2" -H 'content-type: application/json' -d "{\"code\":\"$CODE\"}" | jq
# 4. dashboard as the admin
curl -s $BASE/api/cohort/groups/$GROUP/summary -H "authorization: Bearer $TOKEN" | jq
curl -s "$BASE/api/cohort/groups/$GROUP/students?page=1" -H "authorization: Bearer $TOKEN" | jq
```

Expected: join returns the membership; summary returns `totals.members: 1`; students lists the second user (with `hasData` true if they have saved data, else the No-data row). Also open `http://127.0.0.1:3200/settings` and `/coaching` in a browser and click through: create/join, tiles, table, drill-down.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml .env.example README.md
git commit -m "feat: wire SERVICE_SECRET and auth URL, document coaching dashboard"
```

---

## Execution notes

- Tasks 1→9 are strictly ordered (each consumes the previous task's exports). Tasks 10→13 depend on 1–9 but only on each other as listed. Task 14 is last.
- If `npm test -w <service>` fails with connection errors, the Postgres container isn't up (`docker compose up -d db`) or `DATABASE_URL` doesn't point at the `*_test` database.
- The repo may have an autonomous committer on some machines — commit promptly after each task so unrelated changes don't get swept into your commits.
