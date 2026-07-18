# Cohort Seed Script — Design

**Date:** 2026-07-18
**Status:** Approved (design)
**Author:** brainstorming session

## Problem

The coaching dashboard (org → groups → students, shipped Phase 7) has no realistic
data to demo against. The only existing seed script, `scripts/seed-demo-user.mjs`,
creates a **single** user with rich revision history for the Insights/Calendar views.
Nothing populates a *cohort*: an organisation, groups, and a spread of students whose
revision data exercises the dashboard's completion tiles, activity chart, per-student
table, and drill-down.

## Goal

A single, headless, re-runnable script — `scripts/seed-cohort.mjs` — that populates a
demo organisation with two groups and ~28 students spanning every dashboard state, so
that logging in as the coach and opening `/coaching` shows a realistic, varied cohort.

Non-goals: unit tests (this is a side-effecting integration script, like
`seed-demo-user.mjs`); production use; multi-domain cohorts (all students use
`civil-engineering` so the coach sees one syllabus).

## Key mechanics (verified against current code)

- **Auto-seed on GET.** `apps/frontend/app/api/data/route.ts` GET auto-seeds the
  domain syllabus (`seedDataForDomain(session.domain)`) and PUTs it when a user has no
  data yet. So a brand-new user gets their subjects/topics on the first `GET /api/data`
  — no client-side "log in once" step is needed. The stale comment in
  `seed-demo-user.mjs` about logging in first no longer applies.
- **Completion %** = `completedTopics / totalTopics`, where a topic counts as completed
  if `revisionHistory.length > 0` (`services/content-service/src/stats.ts`). Coverage
  is therefore controlled purely by *what fraction of a student's topics get any
  revision history*.
- **Overdue / due-today** derive from each topic's `nextDueDate(revisionHistory)`
  bucketed by UTC day (`dueCounts`). Controlled by the state ladder in
  `makeHistory()` (reused from `seed-demo-user.mjs`).
- **Streak** = `currentStreak(data, now)` counts consecutive **local** days (from today,
  or yesterday) that have *any* revision across all topics. To give a student a streak
  we place single revisions on consecutive recent days, spread across distinct topics.
- **Stats rows** (`user_stats`, `user_activity`) are written on every `PUT /api/data`.
  A student who never PUTs has **no `user_stats` row**; the cohort dashboard LEFT-JOINs
  the roster against `user_stats` and renders such members as "No data yet".

## API surface (all via the frontend proxy at `http://127.0.0.1:3200`)

| Call | Purpose |
|---|---|
| `POST /api/auth/register` | create coach/students (409 = already exists → reuse) |
| `POST /api/auth/login` | obtain bearer token |
| `GET /api/orgs/me` (`/me/orgs`) | look up the coach's existing org on rerun |
| `POST /api/orgs` | create org (creator becomes admin) — **names are not unique**, so only create when `/orgs/me` shows none |
| `POST /api/orgs/:id/groups` | create group (409 `GROUP_NAME_TAKEN` → reuse) |
| `GET /api/orgs/:id/groups` | list groups to reuse by name on rerun |
| `POST /api/groups/:id/invite-codes` | mint a group invite code |
| `POST /api/orgs/join` | student joins with `{code}` (re-join is a no-op) |
| `GET /api/data` / `PUT /api/data` | auto-seed + apply revision history |
| `GET /api/cohort/groups/:id/summary` | built-in post-seed sanity check |

Email verification is not exposed via API for scripted use, so it is done with the same
psql bypass `seed-demo-user.mjs` uses, batched into one `UPDATE` over all seeded
usernames (in DB `revision_auth`).

## What the script creates

- **Coach**: `coach` / `coach1234`, domain `civil-engineering`, `coach@example.com`.
  Creates the org → becomes org **admin**.
- **Org**: "Sunrise ESE Academy".
- **Groups**: "Batch A (Morning)" (~16 students), "Batch B (Evening)" (~12 students),
  one invite code each.
- **Students**: `stu01`…`stu28`, password `student1234`, domain `civil-engineering`.

Per-student flow (except the two "No data yet" students):
`register → verify (batched psql) → login → GET /api/data (auto-seeds) → apply persona
history → PUT /api/data → POST /api/orgs/join`.

## Persona spread (28 students)

| Persona | Count | Topic coverage | Behavior | Dashboard result |
|---|---|---|---|---|
| Star | 3 | ~90–100% | mastered/advanced states + a consecutive-day streak | top of table, active, streak badge |
| Average | 14 | ~40–70% | mixed recent/upcoming/due-today/overdue | middle of table |
| Struggling | 5 | ~30–50% | heavy overdue | low completion, high overdue |
| Inactive | 3 | ~50–70% but all timestamps 20–40 days old | no recent activity, broken streak | data present, flat recent activity |
| Enrolled, 0% | 1 | 0% (GET auto-seeds, no revisions applied) | stats row exists at 0% | 0%-completion row |
| No data yet | 2 | — (register + join only, **never** GET/PUT) | no `user_stats` row | "No data yet" (LEFT-JOIN null path) |

The last two rows deliberately split the two empty-states so both the
*0%-with-data* path and the *no-stats-row* path are exercised.

Persona → group assignment: fill Batch A (~16) then Batch B (~12); distribute the
edge-case personas (inactive / 0% / no-data) across both groups so each group shows a
realistic mix rather than clustering all empties in one batch.

### History construction

- Reuse `makeHistory(state)` and `STATE_WEIGHTS` from `seed-demo-user.mjs` (copied into
  this script — the two scripts stay independent; no shared module is introduced for a
  pair of dev scripts).
- Each persona defines: a **coverage fraction** (share of active topics that receive any
  history) and a **state-weight table** (distribution over `makeHistory` states for the
  covered topics). Uncovered topics stay at `[]` (NeverRevised).
- New helper `buildStreak(topicIds, n)`: places one revision on each of the last `n`
  consecutive days, on `n` distinct topics, so `currentStreak` returns `n`. Applied to
  Star personas only, layered on top of their state histories.

## Idempotency and `--reset`

**Rerun (default):** safe and convergent.
- `register` → 409 handled, user reused.
- Org: look up via `GET /api/orgs/me`; reuse if the coach already admins "Sunrise ESE
  Academy"; create only if absent (names are not unique — never blind-create).
- Groups: `GET /api/orgs/:id/groups`, reuse by name; create handles 409.
- Invite code: mint fresh each run (multiple valid codes is harmless); students re-join
  as a no-op.
- Revision history is re-derived and re-PUT each run (histories are anchored to "now",
  so rerunning refreshes the relative dates — desirable).

**`--reset` flag:** tear down before (or instead of) seeding, via psql — there is no
delete API. Delete in FK-safe order:
- `revision_content` DB: rows in `user_activity`, `user_stats`, `app_data` for the
  seeded user ids.
- `revision_auth` DB: `invite_codes` and `org_memberships` for the seeded org/groups;
  the org's groups; the `organisations` row for "Sunrise ESE Academy"; then the
  `coach`/`stu%` users. (If FKs already `ON DELETE CASCADE` from `organisations`, the
  org delete suffices for its children — verify during implementation and delete
  children explicitly only if cascade is absent.)

Both DBs are reached with the same dual-command psql fallback `seed-demo-user.mjs` uses
(`psql "$DATABASE_URL"` then `docker exec revision_app_db psql -U revision -d <db>`).

## Output and built-in self-check

On success the script prints:
- Coach credentials and login URL.
- Org id, both group ids, both invite codes.
- Per-persona counts and per-group totals.
- Then, as a sanity check, calls `GET /api/cohort/groups/:id/summary` (as the coach) for
  each group and prints completion / due-today / overdue, so the spread is verified as
  non-trivial before opening the browser.
- A closing pointer: log in as `coach` and open `/coaching`.

## Error handling

- Fail-fast with clear messages (mirroring `seed-demo-user.mjs`).
- Connection-refused → print a "start the docker-compose stack first" hint.
- Verify psql failure → warn and continue (a subsequent login failure surfaces it).
- Any non-expected HTTP status throws with method, path, status, and response body.

## Testing / verification

No unit tests (consistent with `seed-demo-user.mjs`). Verification is:
1. The built-in per-group summary self-check printed at the end.
2. Manual: log in as `coach`, open `/coaching`, confirm both batches show the intended
   spread (stars on top, struggling with overdue, "No data yet" rows present).
3. `--reset` then reseed to confirm idempotency and clean teardown.

## Files

- **Create:** `scripts/seed-cohort.mjs` (only file; no changes to app code).
