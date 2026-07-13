# Editable Revision History, Filter Cleanup & Docker Persistence — Design Spec

**Date:** 2026-07-13
**Status:** Approved

## Goal

Three user-requested changes: (1) revision-history entries become editable — a mistaken "Mark as Revised" can be deleted, and an entry's timestamp can be corrected; (2) the filter bar drops the `Bookmarked` and `Has Flashcards` status chips and renames `Has Attachments` to `Attachments`; (3) app data survives Docker container removal — the container runs with a named volume, with a one-time migration of the live data.

## Non-goals

- No undo-stack (Ctrl+Z) integration for revision edits (Approach B rejected: it conflicts with `preserveSilentFields`, which deliberately treats `revisionHistory` as a silent field).
- No "add manual revision entry" backfill control.
- No removal of the bookmark/flashcard features themselves — only their filter chips.
- No change to the full-snapshot persistence model.

## 1. Editable revision history

**Chosen approach:** silent edits with confirm guards (same `commitSilent` channel as Mark-as-Revised itself; the confirm dialog is the safety net, not Ctrl+Z).

### Pure helpers — `lib/revision/engine.ts`

Alongside the existing `markRevised`:

```ts
export function deleteRevision(topic: Topic, revisionId: string): Topic
// Removes the entry; returns the topic unchanged (same reference is fine) if id not found.
// Bumps updatedAt when a removal happened.

export function updateRevisionTimestamp(topic: Topic, revisionId: string, timestamp: number, now: number): Topic
// Sets the entry's timestamp to min(timestamp, now) — future timestamps are clamped,
// since a future "last revised" produces a negative days-since and a wrong badge.
// Re-sorts revisionHistory ascending by timestamp afterwards: the engine reads
// h[h.length - 1] as "latest", so sort order is an invariant of the model.
// Returns the topic unchanged if id not found. Bumps updatedAt on change.
```

### Store actions — `store/useStore.ts`

Both via `commitSilent` (no undo entry, persisted through the save queue):

```ts
deleteRevision: (topicId: string, revisionId: string) => void;
updateRevisionTimestamp: (topicId: string, revisionId: string, timestamp: number) => void;
```

No-ops when the topic is missing. They wrap the engine helpers; `now` is `Date.now()`.

### UI — `components/RevisionHistoryPanel.tsx`

The panel gains store access via `useStore.getState()` (idiom used by `AttachmentsPanel`). Each history row gets hover-revealed row actions, matching the row-action styling used elsewhere:

- **× (delete):** `window.confirm('Delete Revision N (<date>)? The revision count and next due date will recalculate.')` → `deleteRevision`.
- **✎ (edit):** swaps the date text for a `<input type="datetime-local">` pre-filled with the entry's time, `max` = now. Commit on blur or Enter; Escape cancels. Commits through `updateRevisionTimestamp`.

Derived values (total count, "last revised", due badge, progress) recompute automatically from `revisionHistory` — deleting the only revision returns the topic to "Not revised yet" / NEW badge. That ripple is the intended behavior.

## 2. Filter bar cleanup

- `lib/filters/predicates.ts`: `StatusFilter` shrinks to `'needs-revision' | 'never-revised' | 'has-attachments'`; the `bookmarked` and `has-flashcards` cases leave `topicMatchesStatus`.
- `components/FilterBar.tsx`: `STATUSES` becomes Needs Revision, Never Revised, and **Attachments** (key stays `has-attachments`; only the label changes).
- Untouched: `/bookmarks` page, topic-card and topic-page bookmark stars, `FlashcardsPanel`. Only the chips go.
- `useFilters` is ephemeral (per-session, not persisted), so no stale-key migration is needed.
- Tests asserting the removed statuses are deleted; the remaining status tests stay.

## 3. Docker data persistence

**Verified current state (2026-07-13):** the running `ce-revision` container (port 3200) has zero mounts — `appdata.json` lives in the container's writable layer and dies with `docker rm`. Restart policy is `no`. A named volume `ce-revision-data` exists but is unattached and holds a stale Jul 12 copy. A leftover `ce-revision-blueprint` container (port 3201) serves the deleted blueprint branch.

### Deliverable: `docker-compose.yml` (repo root)

```yaml
services:
  app:
    image: ce-revision:latest
    build: .
    container_name: ce-revision
    ports:
      - "3200:3000"
    volumes:
      - ce-revision-data:/app/data
    restart: unless-stopped

volumes:
  ce-revision-data:
    external: true
```

`external: true` reuses the existing `ce-revision-data` volume rather than creating a compose-namespaced one.

### One-time migration (runbook, executed during implementation — approved by user)

1. `docker cp ce-revision:/app/data/appdata.json ~/ce-revision-backups/appdata-2026-07-13.json` (create the directory first) — the **container's** copy is the live one (newer than the volume's); back it up to the host before touching anything.
2. `docker rm -f ce-revision` and `docker rm -f ce-revision-blueprint` (user approved removing the stale blueprint container).
3. Build the current master image and `docker compose up -d` — volume attaches at `/app/data`.
4. Copy the backed-up `appdata.json` into the volume (overwriting the stale Jul 12 copy), restart the container so it re-reads it (data loads at request time, so a restart is the simple correctness guarantee).
5. Verify end-to-end before declaring done: `curl http://127.0.0.1:3200/api/data` returns the migrated data (spot-check a known subject count/notes), and `docker inspect ce-revision` shows the volume mount and `unless-stopped`.
6. Destruction test: `docker rm -f ce-revision && docker compose up -d` → data still present via `/api/data`.

No uploaded files existed in the old container (`/app/data/files` absent), so `appdata.json` is the only artifact to migrate.

## Error handling

- Engine helpers: unknown revision id → return input topic unchanged; store actions: unknown topic id → no-op.
- Timestamp clamp guarantees `revisionHistory` never contains a future entry.
- Migration: every step verifies before the next (backup checked on host before `docker rm`; API verified before the old image is considered replaceable). The host backup file is kept after migration.

## Testing

- Engine: delete removes the right entry / no-op on missing id; edit re-sorts (edit an older entry past a newer one and assert `lastRevisedAt` changes accordingly); future timestamp clamps to `now`; deleting the latest entry shifts `lastRevisedAt` and `badgeState`.
- Store: both actions leave `history.past` length unchanged (silent); both persist (saveState transitions to `saving`).
- Panel: render → delete flow via mocked `window.confirm`; edit flow commits a changed timestamp.
- Predicates: removed statuses gone from the type (compile-time), remaining three behave as before.
- Docker: runbook steps 5–6 are the acceptance test.

## Exit criteria

`npx tsc --noEmit` clean, `npm run lint` clean, `npm test` fully green with the new tests; migration runbook completed through the destruction test on the host.
