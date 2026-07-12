# Phase 4: Filters & Search — Design Spec

**Date:** 2026-07-12
**Status:** Approved (design) — pending implementation planning
**Builds on:** Phases 1–3 + server-side persistence (all shipped)

## 1. Overview

Phase 4 makes the growing library navigable: tags, filters, and global search.
Three tracks, one implementation plan:

1. **Tags** — a `Tag` entity with color/icon/description; topics carry `tagIds`;
   a few built-in tags ship seeded. "Custom filters" from the roadmap are simply
   user-created tags.
2. **Filters** — a shared filter bar (derived status filters + tag chips) on the
   subject and chapter pages (filtering topics in place) and a global `/filtered`
   view listing every matching topic app-wide. Combination is **AND** (each
   active chip narrows the results).
3. **Search** — a Cmd/Ctrl+K command palette searching subjects, chapters,
   topics (title + notes), and tags, with keyboard navigation to jump to a
   result. Dependency-free.

The Phase 1–3 architecture is preserved: pure domain layer, the
`RevisionRepository` snapshot contract, a single Zustand store for persisted
state. Filter selection is **ephemeral UI state** kept in a separate,
non-persisted store so it never enters the snapshot or the undo history.

## 2. Load-bearing decisions

**Tags are persisted domain data; filter selection is not.** Tags live in
`AppData` (persisted, undoable via `commit`). The *active filter selection* lives
in a separate `useFilters` store — not persisted, not undoable — because it is
transient view state.

**"Custom filters" == tags.** The roadmap's built-in labels (Formula, PYQ, Weak,
…) and "unlimited custom filters (color + icon + description)" are the same
concept: a `Tag`. Built-ins are just tags seeded by default. Status filters
(Needs Revision, etc.) are **derived**, not stored.

**Backfill built-ins for existing data.** The already-deployed snapshot (the
seeded syllabus) has no `tags` field. On hydrate, when `tagOrder` is *absent*
(old data), seed the built-in tags. This does not fire when a user has
deliberately emptied their tags (the field exists, just empty).

**AND filter semantics.** A topic matches when it satisfies **every** active
filter (each active status and includes every active tag). Simple and
predictable; an OR mode can be added later.

**No new dependencies.** Search is a small case-insensitive ranking function
over the in-memory store (all data is already loaded client-side).

## 3. Data model changes (`lib/domain/types.ts`)

```ts
export interface Tag {
  id: string;
  name: string;
  color: string;
  icon: string;         // lucide icon name (stored; optional in UI)
  description?: string;
  order: number;
}

// AppData gains:
//   tags: Record<string, Tag>
//   tagOrder: string[]

// Topic gains:
//   tagIds?: string[]
```

`snapshot()` in the store is extended to include `tags` and `tagOrder`. Loading
an old snapshot normalizes missing `tags`→`{}` / `tagOrder`→`[]` and triggers the
built-in backfill described above.

Built-in tags (seeded fresh, and backfilled for old data): **Formula**,
**PYQ** (previous-year question), **Weak**, **Important**, **Revise Again** —
each with a distinct color and a lucide icon.

## 4. Store changes

### 4.1 Tag actions (persisted, undoable)
- `addTag(name, color, icon, description?): string`
- `updateTag(id, patch: Partial<Pick<Tag,'name'|'color'|'icon'|'description'>>)`
- `deleteTag(id)` — removes the tag **and** strips its id from every topic's
  `tagIds`.
- `toggleTopicTag(topicId, tagId)` — add/remove a tag on a topic.

### 4.2 Hydrate normalization + backfill
`hydrate` ensures `tags`/`tagOrder` exist on the loaded state and, when the
loaded data had no `tagOrder` field, seeds the built-in tags. `seedData()` also
includes the built-in tags for fresh installs.

### 4.3 Filter store (`store/useFilters.ts`, not persisted)
State: `tagIds: string[]`, `statuses: StatusFilter[]`, `query: string`.
Actions: `toggleTag(id)`, `toggleStatus(s)`, `clear()`, `setQuery(q)`.

## 5. Filter predicates (`lib/filters/predicates.ts`, pure, unit-tested)

```ts
export type StatusFilter =
  | 'needs-revision' | 'never-revised' | 'bookmarked'
  | 'has-flashcards' | 'has-attachments';

export interface ActiveFilters { tagIds: string[]; statuses: StatusFilter[] }

export function topicMatchesStatus(topic: Topic, status: StatusFilter, now: number): boolean;
export function topicMatchesFilters(topic: Topic, f: ActiveFilters, now: number): boolean;
export function hasActiveFilters(f: ActiveFilters): boolean;
```

- `needs-revision` → `badgeState` is `Overdue` or `DueToday`.
- `never-revised` → empty `revisionHistory`.
- `bookmarked` → `!!bookmarkedAt`.
- `has-flashcards` / `has-attachments` → non-empty arrays.
- `topicMatchesFilters` = matches **all** active statuses **and** contains
  **all** active tag ids (AND). Archived topics never match.

A selector `matchingTopics(data, f, now, scope?)` returns matching topics,
optionally scoped to a subject or chapter, each paired with its subject/chapter
for context.

## 6. Search (`lib/search/search.ts`, pure, unit-tested)

```ts
export type SearchKind = 'subject' | 'chapter' | 'topic' | 'tag';
export interface SearchResult { kind: SearchKind; id: string; label: string; sublabel?: string; href: string; score: number }
export function search(query: string, data: AppData): SearchResult[];
```

- Case-insensitive. Ranks: title/name startsWith > word-boundary match > includes;
  topic **notes** matches rank below title matches. Tag matches link to
  `/filtered?tag=<id>`. Excludes archived entities. Caps results (e.g. 40),
  sorted by score then label.

## 7. UI components

- `components/FilterBar.tsx` — a chip row: the five status filters and one chip
  per tag (colored), reading/writing `useFilters`; a **Clear** appears when any
  filter is active. Used on subject, chapter, and `/filtered` pages.
- `components/TopicResultRow.tsx` — a topic row showing title, badge, and its
  `Subject ▸ Chapter` context; links to the topic. Used by `/filtered` and by
  the scoped filtered lists.
- `app/filtered/page.tsx` — global view: `<FilterBar>` + the app-wide matching
  topics (via `matchingTopics`). Reads an optional `?tag=` / `?status=` query to
  pre-activate a filter (used by the palette and tag chips).
- **Subject & chapter pages** — render `<FilterBar>`; when
  `hasActiveFilters`, replace the normal child list with the scoped matching
  topics (`matchingTopics` scoped to that subject/chapter); otherwise the usual
  chapter/topic list.
- **Topic page** — a tag picker (toggle chips of all tags) writing
  `toggleTopicTag`; tags render as small chips near the title.
- `components/CommandPalette.tsx` — a modal overlay opened by Cmd/Ctrl+K (and a
  header search button); an input, grouped results from `search()`, arrow/enter
  navigation via `next/navigation` `useRouter`. Mounted once in `AppShell`.
- `components/TagManager.tsx` — a small popover (add tag: name+color+icon;
  rename/recolor/delete existing), reachable from the FilterBar. Deleting warns
  it removes the tag from all topics.
- **Header** — a search affordance (icon/hint) and a **Filtered** link.

## 8. Testing

Unit (Vitest), correctness-critical:
- `predicates`: each status; `topicMatchesFilters` AND semantics; archived never
  match; `hasActiveFilters`.
- `search`: title match ranks above notes match; tag results link correctly;
  archived excluded; empty query → no results.
- Store: `addTag`/`updateTag`/`deleteTag` (strips topic tagIds), `toggleTopicTag`,
  and hydrate backfill of built-ins when `tagOrder` was absent.
- `useFilters`: toggle/clear.

Component (Vitest + Testing Library):
- `FilterBar` toggles a status/tag and reflects Clear.
- `CommandPalette` shows a matching topic for a typed query.
- `/filtered` lists a topic matching an active tag.

## 9. Out of scope for Phase 4 (per roadmap)

Statistics / heatmap / streaks, calendar, in-app notifications, SM-2 scheduling,
authentication, cloud sync, AI features, OCR/PDF import, voice notes, mobile app.
OR filter semantics and saved compound filters are explicitly deferred.
