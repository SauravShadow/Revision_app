# Multiple study domains per account

**Date:** 2026-08-08
**Status:** Approved, ready for implementation planning

## Summary

A domain (Civil Engineering, GATE CS, School Tuition) is picked once during
registration and then frozen for the life of the account. There is no way to
change it, no way to hold more than one, and no way to study anything the
built-in list does not already name.

This spec makes a domain a first-class, user-owned object. An account may hold
up to **six** domains, each with its own subjects, chapters, topics, revision
history and statistics. A user creates their own domain by naming it and
choosing a colour and an icon; it opens as a blank workspace they fill
themselves. Domains are added, renamed, recoloured, deleted and switched
between from inside the app, and a custom domain can also be created during
registration.

Coaching groups become bound to a single domain, so a Civil head sees a
student's Civil progress and nothing else.

## Context

Three services, each owning its own Postgres database, sit behind a Next.js 15
frontend. `auth-service` owns users, organisations, groups, memberships and
invite codes. `content-service` owns per-user revision data and derived
statistics. `files-service` owns attachments.

Four facts about the existing system drive the design:

1. **`Domain` is a closed union type.** `packages/shared/src/authTypes.ts:3`
   declares six string literals, and `DOMAIN_LABELS` / `DOMAIN_ICONS` /
   `DOMAIN_COLORS` are `Record<Domain, string>` keyed off it. User-created
   domains cannot exist inside a compile-time union.

2. **The domain rides in the session token.** `signSession` embeds it
   (`packages/shared/src/session.ts`), and every consumer reads
   `session.domain` locally — `app/api/data/route.ts:17`,
   `services/content-service/src/session.ts:4`. No service calls auth-service
   to resolve it. This is what makes switching cheap: re-sign the token and
   the whole request path follows.

3. **Content is one blob per user.** `app_data` has `user_id` as its primary
   key (`services/content-service/db/migrations/0001_init.sql`), as do
   `user_stats` and `user_activity`. Nothing is partitioned by domain today.

4. **Two of the six domains are dead.** `seedDataForDomain`
   (`apps/frontend/lib/repository/seed.ts:819`) only has syllabi for civil,
   software-engineering/gate-cs and school-tuition. `mechanical-engineering`
   and `electrical-engineering` fall through to `default` and hand the user a
   completely empty app while presenting themselves as curated choices.

A fifth fact is a hazard rather than a driver: **saves are debounced.**
`SaveQueue` (`apps/frontend/store/saveQueue.ts`) holds a pending blob for a
short window. Switching domain without draining it would write one domain's
content under another domain's key. The "Switching domains" section addresses
this.

## Decisions

| Question | Decision |
|---|---|
| How many domains per account | Six, counting built-ins and custom together |
| What a custom domain needs | Name, colour, icon — the same three fields a subject has |
| What a custom domain contains | Nothing; the user builds it from an empty workspace |
| Where domains can be created | Registration (one) and inside the app (up to the cap) |
| Fate of mechanical / electrical | Removed as built-ins; existing holders converted to custom domains of the same name |
| Who owns the domain list | `auth-service` |
| How a switch propagates | Re-signed session token |
| What a coach sees | Only the group's domain |
| Statistics granularity | Per `(user, domain)` |

## Domain identity

`Domain` becomes a plain key string. Built-in domains keep their present
slugs. Custom domains are keyed `custom:<uuid>`, generated server-side.

`packages/shared/src/authTypes.ts` replaces the three parallel `Record<Domain,
…>` maps with one array, which is the only place a built-in is described:

```ts
export type Domain = string;

export interface DomainDef {
  id: Domain;
  label: string;
  icon: string;
  color: string;
}

export const BUILTIN_DOMAINS: DomainDef[] = [
  { id: 'civil-engineering',    label: 'Civil Engineering',           icon: 'Building2',      color: '#f97316' },
  { id: 'software-engineering', label: 'Software Engineering',        icon: 'Code2',          color: '#6366f1' },
  { id: 'gate-cs',              label: 'GATE CS',                     icon: 'Cpu',            color: '#8b5cf6' },
  { id: 'school-tuition',       label: 'School Tuition (PUC & SSLC)', icon: 'GraduationCap',  color: '#10b981' },
];
```

`mechanical-engineering` and `electrical-engineering` are gone. They offered a
curated syllabus and delivered an empty store; the custom-domain flow now does
the same job honestly, and better, because the resulting domain is renameable.

Callers that index `DOMAIN_LABELS[session.domain]`
(`components/layout/AppShell.tsx:52`, `MobileNavDrawer.tsx:79`) cannot resolve a
custom label from a static map, so they read from the user's fetched domain
list instead. A `BUILTIN_BY_ID` lookup remains for the registration grid.

### Validation rules

Enforced in `packages/shared` so client and server share one implementation:

- Label: trimmed, 2–40 characters, must not be blank after trimming.
- Label must be unique within the account, compared case-insensitively.
- Colour: `#rrggbb`.
- Icon: a member of the existing icon allowlist used by subjects.
- Key: either a member of `BUILTIN_DOMAINS` or matching `custom:<uuid>`.

## Auth service owns the domain list

New migration `services/auth-service/db/migrations/0005_user_domains.sql`:

```sql
CREATE TABLE user_domains (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain_key  text NOT NULL,
  label       text NOT NULL,
  color       text NOT NULL,
  icon        text NOT NULL,
  builtin     boolean NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, domain_key)
);

CREATE INDEX user_domains_user_idx ON user_domains (user_id);
```

`users.domain` is kept and re-read as **the active domain key**. Keeping the
column avoids touching login, registration and session signing, all of which
already read it.

The same migration backfills one row per existing user from `users.domain`,
with labels, colours and icons supplied by a `VALUES` list covering the six
historical slugs. Rows for `mechanical-engineering` and
`electrical-engineering` are written as `custom:<uuid>` with `builtin = false`
and their former label, and `users.domain` is updated to the new key in the
same statement so the two stay consistent.

### Endpoints

All under `auth-service`, each proxied by a thin Next route under
`/api/domains` that forwards the session, matching how the existing auth
routes are proxied.

| Method | Path | Behaviour |
|---|---|---|
| `GET` | `/domains` | The caller's domains plus which is active |
| `POST` | `/domains` | Add a built-in, or create a custom one from name/colour/icon |
| `PATCH` | `/domains/:key` | Rename or recolour. Custom domains only |
| `DELETE` | `/domains/:key` | Remove a domain and its content |
| `POST` | `/domains/:key/activate` | Make it active; returns a new session token |

`POST /domains` returns **409** when the account already holds six, and
**400** on a duplicate label or a failed validation rule. Adding a built-in
that the account already holds is also a 400.

`PATCH` on a built-in domain returns **400**. Built-in labels are part of the
product vocabulary; a user who wants a different name creates a custom domain.

`DELETE` refuses to remove the last remaining domain (**400**), since an
account with no domain has nowhere to land after login. Deleting the *active*
domain activates the oldest remaining one and returns a re-signed token in the
same response, so the client is never left holding a token for a domain that
no longer exists. Before responding, auth-service calls content-service's
internal delete for that `(user, domain)`; a failure there fails the request
so the two databases cannot drift.

One internal, service-secret-guarded endpoint is added for content-service:

| Method | Path | Behaviour |
|---|---|---|
| `GET` | `/internal/users/domains` | `{userId, domain}` for every user, for the one-off backfill |

### Switching domains

`POST /domains/:key/activate` verifies the caller owns the key, updates
`users.domain`, and returns a session token freshly signed with the new
domain. The client swaps its stored token.

This is the cheapest correct mechanism available. Every downstream reader
already derives the domain from `session.domain` and verifies the signature
locally, so no route, no service boundary and no query needs a new "which
domain" parameter threaded through it. It also inherits the existing
per-tab-token property (`packages/shared/src/session.ts:1`): two tabs can hold
tokens for two different domains and study both at once, with no extra work.

The token is the authority for which blob the request reads, and it is only
ever issued after ownership is verified, so a user cannot forge access to a
domain — or another account's data — by editing what they hold.

## Content service partitions by (user, domain)

New migration `services/content-service/db/migrations/0003_domains.sql`:

```sql
ALTER TABLE app_data      ADD COLUMN domain text NOT NULL DEFAULT '';
ALTER TABLE user_stats    ADD COLUMN domain text NOT NULL DEFAULT '';
ALTER TABLE user_activity ADD COLUMN domain text NOT NULL DEFAULT '';

ALTER TABLE app_data      DROP CONSTRAINT app_data_pkey,
                          ADD PRIMARY KEY (user_id, domain);
ALTER TABLE user_stats    DROP CONSTRAINT user_stats_pkey,
                          ADD PRIMARY KEY (user_id, domain);
ALTER TABLE user_activity DROP CONSTRAINT user_activity_pkey,
                          ADD PRIMARY KEY (user_id, domain, day);
```

The `DEFAULT ''` is a placeholder, not a resting state. Content-service's
database has no `users` table, so it cannot resolve each row's domain in SQL.
A backfill script — `services/content-service/src/backfillDomains.ts`, run as
`npm run backfill:domains`, following the shape of the existing
`backfillStats.ts` — calls `GET /internal/users/domains` and stamps every row
with its owner's single existing domain. Every pre-existing user has exactly
one, so the mapping is unambiguous. A follow-up migration,
`0004_domains_not_null.sql`, drops the `DEFAULT ''` once the script has run,
so a row can never again be written without a domain.

`readData` and `writeData` (`services/content-service/src/appDataStore.ts`)
take a domain argument; `writeStatsInTx` and `recomputeAllStats`
(`statsStore.ts`) do the same. A new internal `DELETE /app-data` for a
`(user, domain)` pair removes the blob, the stats row and the activity rows in
one transaction, and is what auth-service calls on domain deletion.

Attachments need no change. Blob ids are referenced from inside the AppData
blob, so they partition with it automatically, and files-service already scopes
reads by user.

## Coaching becomes domain-bound

`org_groups` gains `domain_key text`, backfilled from the domain of the group's
creator — groups are single-subject in practice today, so this preserves what
every existing group already means. The column is set at group creation from
the creating head's active domain and is not editable afterwards; changing it
would silently redefine every historical number on the dashboard.

`services/content-service/src/cohort.ts` threads the group's domain through
`statsFor`, `activityFor` and the drilldown's `readData` call. A member who
holds that domain but has not started it, or who does not hold it at all,
produces no stats row and falls through the existing `hasData: false` path, so
the dashboard already renders that case correctly.

The privacy property this buys: a coach reads exactly one domain of a
student's account, chosen when the group was made, and a student's unrelated
domains are invisible to them.

## Frontend

### Registration

Step 2 of `app/(auth)/register/page.tsx` keeps the card grid, now over four
built-ins, and adds a *Create my own* card. Selecting it expands the card into
a name field, a colour swatch row and an icon picker — the same three controls
the subject editor already uses, so no new UI vocabulary is introduced. One
domain is chosen at registration; the rest are added from inside the app.

`POST /register` accepts either a built-in id or a `{label, color, icon}`
object, validates it with the shared rules, and writes both the `users` row and
the first `user_domains` row in one transaction.

### Switching and managing

The read-only domain label in `components/layout/AppShell.tsx:52` and
`MobileNavDrawer.tsx:79` becomes a switcher: the current domain, the others
listed below it with their colour and icon, and an *Add domain* entry while the
account is under six.

A **Domains** section in `app/settings/page.tsx` lists all domains with their
colour and icon, and offers add, rename, recolour and delete. The cap is stated
in the UI, and *Add* is disabled at six with the reason shown rather than
failing on submit. Deletion asks the user to type the domain's name to confirm,
and states plainly that its subjects, revision history and statistics are being
destroyed.

### Store and hydration

A domain switch performs, in order:

1. `flushSave()`, awaited — drains the debounced `SaveQueue` under the **old**
   token, so no pending blob can land under the new key.
2. `POST /domains/:key/activate`, swapping the stored token.
3. `hydrate()` — `ApiRepository` now sends the new token, so `GET /api/data`
   returns the new domain's blob with no signature change to the data layer.

Step 1 is not optional. Without it, an edit made moments before the switch is
serialised against whichever token the request happens to carry, which
corrupts one domain with another's content. The switcher shows a pending state
until all three steps resolve, and a failure at any step leaves the old domain
active with an error surfaced.

`seedDataForDomain` (`lib/repository/seed.ts:819`) keeps its `switch` for the
built-ins. Custom keys fall through to the existing `default` branch —
`buildSeed([])`, an empty store with built-in tags — which is already exactly
the intended behaviour for a user-created domain. The two dead cases disappear
along with their slugs.

`StoreHydrator.tsx` re-runs hydration when the active domain changes rather
than only on mount.

Because tokens are per-tab, one tab can delete the domain another tab is
holding a token for. `StoreHydrator` therefore fetches `GET /domains` before
hydrating and, if the token's domain is absent from the list, activates the
first remaining domain and hydrates that instead. Without this reconciliation
the stale tab would seed an empty store and save it, resurrecting a blob for a
domain the user just deleted.

## Error handling

| Condition | Response |
|---|---|
| Seventh domain | 409; UI disables *Add* at six with the reason shown |
| Duplicate label in account | 400, field-level message |
| Rename or recolour of a built-in | 400 |
| Delete of the last domain | 400, delete control disabled with the reason |
| Delete of the active domain | Succeeds; oldest remaining domain activated, new token returned |
| Activate a domain not owned | 403 |
| Content delete fails during domain delete | Whole request fails; domain survives |
| Flush fails before a switch | Switch aborted, old domain stays active |
| Stale token for a domain deleted in another tab | Client reconciles on load (below); no 500, no resurrected blob |

## Testing

**Shared.** Label, colour, icon and key validation, including the trim, length
and case-insensitive uniqueness rules.

**Auth service.** Create built-in and custom; the six cap; duplicate label
rejection; last-domain delete guard; rename rejected on built-ins; activate
returns a token whose decoded payload carries the new domain; activate of an
unowned key is refused; deleting the active domain returns a token for the
successor; a content-service failure during delete leaves the domain in place.

**Content service.** Two domains of one user read and write independently and
never see each other's blob; stats and activity rows are written per domain;
the internal delete removes all three tables' rows for that pair and nothing
else; cohort reads the group's domain and reports `hasData: false` for a
member with nothing there.

**Frontend.** A custom domain seeds to an empty store with built-in tags; the
switcher flushes pending saves before activating, verified by asserting the
save lands under the old domain; hydration re-runs on a domain change; *Add* is
disabled at six; registration accepts a custom domain and rejects a blank
label; a token whose domain is absent from `GET /domains` reconciles to a
remaining domain instead of seeding and saving an empty store.

**Migration.** An existing user ends with exactly one `user_domains` row
matching their old domain; a mechanical or electrical user ends with a
`custom:` key, `builtin = false`, their former label, and a consistent
`users.domain`; the content backfill stamps every pre-existing `app_data`,
`user_stats` and `user_activity` row; group `domain_key` matches the creator's
domain.

## Out of scope

- Sharing or publishing a custom domain's syllabus between accounts.
- Importing a syllabus from a file or pasted text into a new domain.
- Cloning an existing built-in syllabus as the starting point for a custom
  domain.
- Cross-domain views — the queue, calendar, insights and bookmarks all stay
  scoped to the active domain.
- Raising or making configurable the six-domain cap.
