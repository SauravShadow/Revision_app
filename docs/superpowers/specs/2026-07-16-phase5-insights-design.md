# Phase 5: Insights — Design Spec

**Date:** 2026-07-16
**Status:** Approved (design) — pending implementation planning
**Builds on:** Phases 1–4 + Postgres foundation + microservices split (all shipped)

## 1. Overview

Phase 5 turns the accumulated revision history into feedback the user can act on:
**how much have I revised, what's my momentum, and what's coming up.** Two
tracks, one implementation plan:

1. **Statistics dashboard** (`/insights`) — a heatmap of revision activity,
   current/longest streak, most/least revised topics, averages (revisions per
   topic, days between revisions), and completion %.
2. **Calendar view** (`/calendar`) — a month grid bucketing topics into
   **Due Today / Upcoming / Missed / Completed**, with prev/next month
   navigation and a per-day topic list.

Everything is **derived, client-side**, from the `AppData` already held in the
Zustand store (hydrated from content-service's `/app-data` blob). Phase 5 adds
**no new service, endpoint, database, or migration**, and makes **no change to
`packages/shared/src/types.ts`** or the store snapshot. It is purely additive: a
new pure `lib/insights/` module plus two pages and their components.

## 2. Load-bearing decisions

**Pure derivation, nothing persisted.** Every statistic is a pure function of
`(AppData, now)`. Insights state is never stored, never enters the snapshot, and
never touches the undo history. This mirrors how `lib/revision/` and
`lib/filters/` are already structured and keeps the phase zero-risk to the sync
layer.

**Reuse the revision engine, don't reinvent scheduling math.** Insights consumes
the existing pure functions in `lib/revision/engine.ts` and
`lib/revision/progress.ts`:
- **Completion %** = the existing `inGoodStanding` definition (already used by
  `chapterProgress`/`subjectProgress`).
- **Due / overdue / upcoming** = existing `badgeState` + `nextDueDate`.
- **"Completed on a day"** = timestamps in each topic's `revisionHistory`.

Insights never redefines the ladder or badge states.

**Archived entities are excluded everywhere.** Consistent with filters and
search: subjects/chapters/topics carrying `archivedAt` are omitted from every
statistic, ranking, heatmap bucket, and calendar bucket.

**Local-day bucketing.** Heatmap, streak, and calendar all bucket timestamps by
**local** start-of-day (matching `startOfDay` in the engine), so a revision at
11pm counts for that calendar day in the user's timezone.

**Streak definition.** A streak is a run of consecutive local days on which **at
least one** revision (across any topic) was recorded. The *current* streak ends
today or yesterday (revising today extends it; a fully missed day breaks it —
"yesterday" is allowed so a not-yet-revised today doesn't read as a broken
streak). The *longest* streak is the maximum such run over all history.

**Most/least revised** ranks non-archived topics by `revisionHistory.length`,
tie-broken by most-recent revision (`lastRevisedAt`). Never-revised topics are
reported as a separate count, not mixed into "least revised".

## 3. Data model changes

**None.** Phase 5 reads existing fields only:
`Topic.revisionHistory: Revision[]` (`{ id, timestamp }`), `archivedAt`, and the
`AppData` maps. No new types, no snapshot change, no service or DB change.

## 4. New module: `lib/insights/` (pure, unit-tested)

All functions are pure and take `now: number` where "today" matters.

### 4.1 `heatmap.ts`
```ts
export interface DayCount { day: number; count: number } // day = local start-of-day ms
export function revisionCountsByDay(data: AppData, rangeDays: number, now: number): DayCount[];
```
Counts revisions per local day over the last `rangeDays` (default 365),
producing one entry per day in range (including zero-count days) for a dense
grid. Archived topics excluded.

### 4.2 `streak.ts`
```ts
export function currentStreak(data: AppData, now: number): number;
export function longestStreak(data: AppData, now: number): number;
```
Both built from the set of local days that have ≥1 revision (archived excluded).

### 4.3 `rankings.ts`
```ts
export interface TopicRevisionRank {
  topicId: string; title: string; subjectId: string; chapterId: string;
  count: number; lastRevised?: number;
}
export interface OverallStats {
  totalTopics: number;      // non-archived
  completionPct: number;    // % of non-archived topics inGoodStanding
  neverRevised: number;
  dueToday: number;
  overdue: number;
  avgRevisionsPerTopic: number;
  avgDaysBetween?: number;  // mean gap between consecutive revisions, all topics
}
export function overallStats(data: AppData, now: number): OverallStats;
export function topicsByRevisionCount(data: AppData): {
  most: TopicRevisionRank[]; least: TopicRevisionRank[]; // top-N each, N default 5
};
```
`least` excludes never-revised topics (count 0); `most`/`least` tie-break by
`lastRevised` desc. Each rank carries subject/chapter ids so the UI can render
context and a link.

### 4.4 `calendar.ts`
```ts
export interface CalendarDay {
  day: number;               // local start-of-day ms
  inMonth: boolean;          // false for leading/trailing padding cells
  dueTopicIds: string[];     // next due date falls on this day
  overdueTopicIds: string[]; // only on the "today" cell: currently overdue
  completedTopicIds: string[];// a revision was recorded on this day
}
export function calendarMonth(data: AppData, year: number, month: number, now: number): CalendarDay[];
```
Returns a full 6-week grid (leading/trailing padding days flagged `inMonth:false`)
for stable layout. "Due" uses `nextDueDate`; "completed" uses revision
timestamps; "overdue" is surfaced on the today cell so the user always sees the
current backlog. Archived topics excluded.

## 5. UI components & pages

Follows existing conventions (server/client split, molten-reactor palette, the
`TopicResultRow` context-row pattern from Phase 4).

- `components/insights/HeatmapGrid.tsx` — GitHub-style calendar heatmap from
  `revisionCountsByDay`; intensity buckets colored in the bronze family; hover
  title shows date + count. Horizontally scrollable on narrow viewports.
- `components/insights/StatTile.tsx` — a labelled metric tile (value + caption),
  used for completion %, current/longest streak, totals, averages.
- `app/insights/page.tsx` — a row of `StatTile`s (`overallStats` + streaks), the
  `HeatmapGrid`, and **Most revised / Least revised** lists (each row links to
  the topic via its subject/chapter context).
- `components/insights/MonthCalendar.tsx` — month grid from `calendarMonth` with
  prev/next/today navigation (local component state for the viewed month); each
  in-month cell shows small dot counts for due / overdue / completed; selecting a
  day reveals the topics for that day.
- `app/calendar/page.tsx` — hosts `MonthCalendar`; the selected-day topic list
  reuses `TopicResultRow`.
- **Nav** — add **Insights** and **Calendar** links to
  `components/layout/AppShell.tsx` and `components/layout/MobileNavDrawer.tsx`,
  alongside Filtered / Bookmarks / Archive.

Both pages read the store the same way existing pages do; when there is no data
yet they render a friendly empty state rather than zeroed charts.

## 6. Testing

Unit (Vitest), correctness-critical:
- `streak`: empty history → 0; single day → 1; consecutive days accumulate; a
  fully missed day breaks the current streak; revision yesterday (none today)
  still counts as current; `longestStreak` picks the max historical run.
- `heatmap`: revisions bucket to the correct **local** day; a late-evening
  timestamp counts for that day; zero-count days present across the range;
  archived topics excluded.
- `rankings`: `overallStats` completion matches `inGoodStanding`; averages and
  `neverRevised`/`dueToday`/`overdue` counts; `topicsByRevisionCount` ordering
  and tie-break; `least` excludes never-revised; archived excluded.
- `calendar`: due topic lands on its `nextDueDate` cell; completed topic lands on
  its revision day; overdue surfaced on the today cell; padding cells flagged;
  archived excluded.

Component (Vitest + Testing Library):
- `insights` page renders a computed stat tile and a heatmap cell for seeded
  data, and an empty state for empty data.
- `MonthCalendar` renders a day with a due topic and reveals it on selection.

## 7. Out of scope for Phase 5 (deferred)

In-app and browser/OS notifications (deferred to a later phase), SM-2 / adaptive
scheduling, data export or reporting, cross-user or aggregate/admin analytics,
and any AI-generated insights. No server-side aggregation — all statistics remain
a client-side derivation of the user's own in-memory data.
