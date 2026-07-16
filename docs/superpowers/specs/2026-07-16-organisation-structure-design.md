# Organisation Structure & Coaching Dashboard — Design

**Date:** 2026-07-16
**Status:** Approved for planning

## Goal

Give the app an organisation layer so a head person (coach) can see summary
reports across their students, per the README "Roadmap: Coaching Dashboard"
mockup. Today every content-service query is scoped to the requesting user;
this design adds the org structure, the authorization to cross that boundary
read-only, and the denormalized stats needed to do it at scale.

## Decisions (settled during brainstorming)

| Question | Decision |
|---|---|
| Org shape | Full hierarchy: organisation → groups (batches) → students; org-level admin above group-level heads |
| Joining | Invite codes generated per group; students enter the code in Settings |
| Who can create orgs | Any user, self-serve; creator becomes that org's admin. Roles are per-organisation, not global |
| Head visibility | Stats + per-topic revision status only. Notes/markdown, attachments, bookmarks and tags are never exposed (enforced server-side) |
| UI placement | Org management in Settings; a "Coaching" nav item shown only to users with a head/admin role, leading to `/coaching` |
| Scale target | 200+ students per organisation → precomputed stats, paginated dashboard |
| Architecture | Approach A: org tables live in auth-service (identity owner); denormalized stats live in content-service; one internal service-to-service endpoint |

## Architecture

```
frontend ──bearer──▶ auth-service      (orgs, groups, memberships, invite codes)
frontend ──bearer──▶ content-service   (cohort dashboards, per-student drill-down)
content-service ──X-Service-Secret──▶ auth-service /internal/groups/:id/members
```

This is the app's first service-to-service call. It is authenticated by a new
shared `SERVICE_SECRET` env var and its response is cached in content-service
for 60 seconds.

## Database changes

### revision_auth — migration `0004_organisations.sql`

```sql
organisations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

org_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name text NOT NULL,                    -- e.g. "Batch A"
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

org_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  group_id uuid REFERENCES org_groups(id) ON DELETE CASCADE,  -- NULL = org-level role
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin','head','member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, group_id, user_id)
);

invite_codes (
  code text PRIMARY KEY,                 -- e.g. "BATCHA-7F3K", crypto-random suffix
  group_id uuid NOT NULL REFERENCES org_groups(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES users(id),
  expires_at timestamptz,                -- NULL = no expiry
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

Role semantics:

- `admin` — org-level (`group_id IS NULL`). Manages groups, assigns heads,
  sees every group's dashboard in the org.
- `head` — group-level. Sees only their group's dashboard.
- `member` — a student in a group.

The existing `users` table is **not modified**. A user may hold different
roles in different orgs and none at all as a solo user; existing auth flows
are untouched.

### revision_content — migration `0002_stats.sql`

```sql
user_stats (
  user_id uuid PRIMARY KEY,
  total_topics int NOT NULL,
  completed_topics int NOT NULL,         -- revised at least once
  streak_days int NOT NULL,
  due_histogram jsonb NOT NULL,          -- {"2026-07-16": 3, ...} topic-count per next-due date (≤ ~90 keys)
  subject_coverage jsonb NOT NULL,       -- [{subject, total, revised}] for the heatmap
  updated_at timestamptz NOT NULL
);

user_activity (
  user_id uuid NOT NULL,
  day date NOT NULL,
  revisions int NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
```

Both tables are maintained **inside the same transaction** as every existing
`app_data` save (the service already parses the blob to validate it, so
deriving stats there is cheap). `due_today` and `overdue` are *not* stored;
they are computed at read time from `due_histogram` (overdue = sum of counts
before today, due today = today's entry), so a student who hasn't saved in
weeks still reports correctly.

A one-off backfill script populates both tables for existing users.
`user_activity` history can only be reconstructed from `lastRevised`
timestamps in the blobs, so the activity chart starts sparse and fills in
from launch day.

## API

### auth-service — org management (existing bearer-token auth)

| Endpoint | Who | Behaviour |
|---|---|---|
| `POST /orgs` | any user | Create org; caller becomes `admin` |
| `POST /orgs/:id/groups` | org admin | Create group |
| `POST /groups/:id/heads` | org admin | Assign an existing org member as `head` of the group |
| `POST /groups/:id/invite-codes` | admin/head | Generate code |
| `DELETE /invite-codes/:code` | admin/head | Revoke code |
| `POST /orgs/join` | any user | Body `{code}` → creates `member` membership; joining an already-joined group is a no-op; rate-limited like login |
| `GET /me/orgs` | any user | Own memberships + roles (frontend uses this to show/hide Coaching nav) |
| `DELETE /groups/:gid/members/:uid` | admin/head, or the student themself | Remove/leave |

### auth-service — internal endpoint (X-Service-Secret header)

```
GET /internal/groups/:id/members?requester=<userId>
→ { requesterRole: 'head' | 'admin' | null, members: [{ userId, username }] }
```

Answers "may this requester see this group" and "who is in it, with display
names" in one call. Content-service caches responses for 60s.

### content-service — cohort endpoints (bearer auth + internal role check)

| Endpoint | Behaviour |
|---|---|
| `GET /cohort/groups/:id/summary` | Rollup tiles (completion %, due today, overdue) + 30-day activity time-series summed from `user_activity` |
| `GET /cohort/groups/:id/students?page=&sort=` | Paginated (50/page) per-student rows from `user_stats`, LEFT JOINed against the roster; members with no stats row render as "No data yet". Server-side sort by completion/overdue |
| `GET /cohort/students/:userId` | Drill-down: parses that one student's `app_data` on demand; returns subject → chapter → topic revision status only. Notes, attachments, bookmarks, tags stripped server-side |

Every cohort endpoint resolves the requester's role via the internal call
first; non-head/admin requesters get 403. If the internal call fails, return
502 ("authorization service unavailable") — never fail open.

## UI

### Settings → "Organisation" card

- Solo user: **Create organisation** (name → becomes admin) and **Join with
  code** inputs.
- Member: list of memberships ("XYZ Academy / Batch A — member") with
  *Leave*.
- Admin: management panel — create groups, assign heads (picked from org
  members), generate/revoke invite codes per group.

### Coaching nav + `/coaching`

The "Coaching" nav item renders only when `GET /me/orgs` reports a `head` or
`admin` role anywhere; `AuthProvider` fetches this once alongside the session.

`/coaching` implements the README mockup, reusing insights/chart components
where possible:

1. Group switcher (hidden for single-group heads; admins see all org groups)
2. Rollup tiles: cohort completion %, due today, overdue
3. 30-day activity bar chart
4. Paginated student table: username, completion bar, streak, status badge
   (`On track` / `Overdue (n)`), server-side sortable
5. Subject coverage heatmap, same pagination as the table

### `/coaching/student/[id]`

Read-only drill-down: subject → chapter → topic tree with each topic's
six-state revision badge, plus the student's personal 30-day activity chart.
No note content ever — enforced server-side, not just hidden.

## Edge cases & error handling

- **Invite codes:** unguessable (crypto-random suffix), revocable, optional
  expiry; join attempts rate-limited using auth-service's existing pattern.
- **New member, never saved:** dashboard LEFT JOIN renders "No data yet"; no
  cross-service write on join.
- **Departed members:** stats keyed by user, not group — removal only edits
  the roster; nothing to clean up.
- **Internal call failure:** 502 with a clear message; never fail open.
- **Backfill:** one-off script over `app_data`; activity history sparse
  before launch day (see DB section).

## Testing

Vitest per service:

- Authorization matrix: admin / head / member / outsider × every org and
  cohort endpoint.
- Stats derivation unit tests against known `app_data` blobs (histogram,
  streak, coverage).
- Invite-code lifecycle: create, join, duplicate join no-op, expired,
  revoked, rate-limit.
- Drill-down redaction: assert notes/attachments/bookmarks are absent from
  the response body.
- Pagination and server-side sort.

## Out of scope

- Email invitations (blocked on Resend key; invite codes chosen instead)
- Head write-access to student data (read-only by design)
- Org-level billing/quotas, notifications to heads, CSV export
