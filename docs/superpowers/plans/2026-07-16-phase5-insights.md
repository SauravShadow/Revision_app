# Phase 5: Insights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a statistics dashboard (`/insights`) and a calendar view (`/calendar`) that turn each user's revision history into visible progress, momentum, and upcoming-schedule feedback.

**Architecture:** Everything is a **pure, client-side derivation** of the `AppData` already held in the Zustand store — a new `apps/frontend/lib/insights/` module of pure functions (mirroring `lib/revision/` and `lib/filters/`), consumed by two new pages and their components. No new service, endpoint, database, migration, or change to `packages/shared`.

**Tech Stack:** Next.js 15 (App Router) · React 19 · TypeScript (strict) · Zustand · lucide-react · Tailwind (molten-reactor palette) · Vitest + Testing Library (jsdom).

## Global Constraints

- **No new runtime dependencies.** Insights is pure TS over in-memory data; charts are hand-rolled with Tailwind/DOM.
- **No change to `packages/shared/src/types.ts`, the store snapshot, or any service/DB.** Phase 5 is purely additive and read-only over existing fields.
- **Reuse the revision engine.** Completion = `inGoodStanding`; due/overdue = `badgeState`/`nextDueDate`; never redefine scheduling math.
- **Archived entities excluded everywhere** (topics, chapters, subjects carrying `archivedAt`).
- **Local-day bucketing.** All day math goes through `startOfDay` (local midnight) and the `addDays` helper — never raw `ts + N*DAY_MS` for day identity.
- **All work is under `apps/frontend/`.** Run commands from that directory. Tests: `npx vitest run <path>`.
- TypeScript strict: no `any`, exact prop/return types as specified in each task's Interfaces block.

## File Structure

- `apps/frontend/lib/revision/engine.ts` — **modify**: export the existing `startOfDay`.
- `apps/frontend/lib/insights/day.ts` — **create**: `DAY_MS`, `addDays`, re-export `startOfDay`. Single day-math surface for the module.
- `apps/frontend/lib/insights/heatmap.ts` — **create**: `revisionCountsByDay`.
- `apps/frontend/lib/insights/streak.ts` — **create**: `currentStreak`, `longestStreak`.
- `apps/frontend/lib/insights/rankings.ts` — **create**: `overallStats`, `topicsByRevisionCount`, types.
- `apps/frontend/lib/insights/calendar.ts` — **create**: `calendarMonth`, `CalendarDay`.
- `apps/frontend/components/insights/StatTile.tsx` — **create**: labelled metric tile.
- `apps/frontend/components/insights/HeatmapGrid.tsx` — **create**: GitHub-style heatmap.
- `apps/frontend/components/insights/MonthCalendar.tsx` — **create**: month grid + selected-day list.
- `apps/frontend/app/insights/page.tsx` — **create**: dashboard page.
- `apps/frontend/app/calendar/page.tsx` — **create**: calendar page.
- `apps/frontend/components/layout/AppShell.tsx` — **modify**: add Insights + Calendar nav links.
- `apps/frontend/components/layout/MobileNavDrawer.tsx` — **modify**: add Insights + Calendar nav links.

---

### Task 1: Day helpers + revision heatmap data

**Files:**
- Modify: `apps/frontend/lib/revision/engine.ts:7` (export `startOfDay`)
- Create: `apps/frontend/lib/insights/day.ts`
- Create: `apps/frontend/lib/insights/heatmap.ts`
- Test: `apps/frontend/lib/insights/heatmap.test.ts`

**Interfaces:**
- Consumes: `startOfDay(ts: number): number` from `@/lib/revision/engine`; `AppData`, `Revision` from `@revision-app/shared`.
- Produces:
  - `day.ts`: `export const DAY_MS: number`; `export function addDays(day: number, n: number): number`; `export { startOfDay }`.
  - `heatmap.ts`: `export interface DayCount { day: number; count: number }`; `export function revisionCountsByDay(data: AppData, rangeDays: number, now: number): DayCount[]` — one entry per local day over the last `rangeDays` (oldest→newest, zero-count days included), archived topics excluded.

- [ ] **Step 1: Export `startOfDay` from the engine**

In `apps/frontend/lib/revision/engine.ts`, change the existing declaration on line 7 from:

```ts
function startOfDay(ts: number): number {
```

to:

```ts
export function startOfDay(ts: number): number {
```

(No other change to that file — it is already used internally.)

- [ ] **Step 2: Create the day helper**

Create `apps/frontend/lib/insights/day.ts`:

```ts
import { startOfDay } from '@/lib/revision/engine';

export const DAY_MS = 24 * 60 * 60 * 1000;

// DST-safe day stepping: advance the local calendar date, then snap to local midnight.
export function addDays(day: number, n: number): number {
  const d = new Date(day);
  d.setDate(d.getDate() + n);
  return startOfDay(d.getTime());
}

export { startOfDay };
```

- [ ] **Step 3: Write the failing test**

Create `apps/frontend/lib/insights/heatmap.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { AppData } from '@revision-app/shared';
import { revisionCountsByDay } from './heatmap';

// Local-time anchors so start-of-day math is timezone-stable.
const now = new Date(2026, 6, 15, 12, 0, 0).getTime();     // 2026-07-15 noon
const today = new Date(2026, 6, 15, 22, 0, 0).getTime();   // same day, 10pm
const twoDaysAgo = new Date(2026, 6, 13, 9, 0, 0).getTime();

function fixture(): AppData {
  return {
    subjectOrder: ['s1'],
    subjects: { s1: { id: 's1', name: 'S', color: '#000', icon: 'X', order: 0, chapterIds: ['c1'] } },
    chapters: { c1: { id: 'c1', subjectId: 's1', name: 'C', order: 0, difficulty: 'Medium', priority: 'Medium', topicIds: ['t1', 't2'] } },
    topics: {
      t1: { id: 't1', chapterId: 'c1', title: 'A', notes: '', order: 0, difficulty: 'Medium', priority: 'Medium',
        revisionHistory: [{ id: 'r1', timestamp: today }, { id: 'r2', timestamp: twoDaysAgo }], createdAt: 0, updatedAt: today },
      t2: { id: 't2', chapterId: 'c1', title: 'B', notes: '', order: 1, difficulty: 'Medium', priority: 'Medium',
        revisionHistory: [{ id: 'r3', timestamp: today }], createdAt: 0, updatedAt: today, archivedAt: 1 },
    },
    tags: {}, tagOrder: [],
  };
}

describe('revisionCountsByDay', () => {
  it('returns one dense entry per day, oldest to newest', () => {
    const out = revisionCountsByDay(fixture(), 7, now);
    expect(out).toHaveLength(7);
    expect(out[0].day).toBeLessThan(out[6].day);
    expect(out[6].day).toBe(new Date(2026, 6, 15).getTime()); // last entry is today
  });

  it('buckets a late-evening revision on its local day and excludes archived topics', () => {
    const out = revisionCountsByDay(fixture(), 7, now);
    const byDay = new Map(out.map((d) => [d.day, d.count]));
    expect(byDay.get(new Date(2026, 6, 15).getTime())).toBe(1); // t1 today only (t2 archived)
    expect(byDay.get(new Date(2026, 6, 13).getTime())).toBe(1); // t1 two days ago
    expect(byDay.get(new Date(2026, 6, 14).getTime())).toBe(0); // zero-count day present
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run lib/insights/heatmap.test.ts`
Expected: FAIL — `Failed to resolve import "./heatmap"` / `revisionCountsByDay is not a function`.

- [ ] **Step 5: Implement `heatmap.ts`**

Create `apps/frontend/lib/insights/heatmap.ts`:

```ts
import type { AppData } from '@revision-app/shared';
import { startOfDay, addDays } from './day';

export interface DayCount {
  day: number;
  count: number;
}

export function revisionCountsByDay(data: AppData, rangeDays: number, now: number): DayCount[] {
  const today = startOfDay(now);
  const start = addDays(today, -(rangeDays - 1));

  const counts = new Map<number, number>();
  for (const topic of Object.values(data.topics)) {
    if (topic.archivedAt) continue;
    for (const rev of topic.revisionHistory) {
      const day = startOfDay(rev.timestamp);
      if (day < start || day > today) continue;
      counts.set(day, (counts.get(day) ?? 0) + 1);
    }
  }

  const out: DayCount[] = [];
  for (let i = 0; i < rangeDays; i++) {
    const day = addDays(start, i);
    out.push({ day, count: counts.get(day) ?? 0 });
  }
  return out;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd apps/frontend && npx vitest run lib/insights/heatmap.test.ts`
Expected: PASS (2 passed).

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/lib/revision/engine.ts apps/frontend/lib/insights/day.ts apps/frontend/lib/insights/heatmap.ts apps/frontend/lib/insights/heatmap.test.ts
git commit -m "feat(insights): day helpers + revision heatmap data"
```

---

### Task 2: Streaks

**Files:**
- Create: `apps/frontend/lib/insights/streak.ts`
- Test: `apps/frontend/lib/insights/streak.test.ts`

**Interfaces:**
- Consumes: `startOfDay`, `addDays` from `@/lib/insights/day`; `AppData` from `@revision-app/shared`.
- Produces: `export function currentStreak(data: AppData, now: number): number`; `export function longestStreak(data: AppData): number`. A streak is consecutive local days with ≥1 revision across any non-archived topic. Current streak anchors to today (if revised today) else yesterday; otherwise 0.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/lib/insights/streak.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { AppData, Revision } from '@revision-app/shared';
import { currentStreak, longestStreak } from './streak';

const now = new Date(2026, 6, 15, 12, 0, 0).getTime(); // 2026-07-15
function at(y: number, m: number, d: number): number { return new Date(y, m, d, 10, 0, 0).getTime(); }

function data(history: Revision[], archived = false): AppData {
  return {
    subjectOrder: ['s1'],
    subjects: { s1: { id: 's1', name: 'S', color: '#000', icon: 'X', order: 0, chapterIds: ['c1'] } },
    chapters: { c1: { id: 'c1', subjectId: 's1', name: 'C', order: 0, difficulty: 'Medium', priority: 'Medium', topicIds: ['t1'] } },
    topics: {
      t1: { id: 't1', chapterId: 'c1', title: 'A', notes: '', order: 0, difficulty: 'Medium', priority: 'Medium',
        revisionHistory: history, createdAt: 0, updatedAt: 0, ...(archived ? { archivedAt: 1 } : {}) },
    },
    tags: {}, tagOrder: [],
  };
}
const rev = (ts: number, i = 0): Revision => ({ id: `r${ts}-${i}`, timestamp: ts });

describe('currentStreak', () => {
  it('is 0 with no history', () => expect(currentStreak(data([]), now)).toBe(0));

  it('counts consecutive days ending today', () => {
    const h = [rev(at(2026, 6, 13)), rev(at(2026, 6, 14)), rev(at(2026, 6, 15))];
    expect(currentStreak(data(h), now)).toBe(3);
  });

  it('still counts when the most recent day is yesterday (today not yet revised)', () => {
    const h = [rev(at(2026, 6, 13)), rev(at(2026, 6, 14))];
    expect(currentStreak(data(h), now)).toBe(2);
  });

  it('breaks when the last revision is older than yesterday', () => {
    const h = [rev(at(2026, 6, 10)), rev(at(2026, 6, 11))];
    expect(currentStreak(data(h), now)).toBe(0);
  });

  it('ignores archived topics', () => {
    const h = [rev(at(2026, 6, 15))];
    expect(currentStreak(data(h, true), now)).toBe(0);
  });
});

describe('longestStreak', () => {
  it('finds the longest historical run', () => {
    const h = [
      rev(at(2026, 6, 1), 1), rev(at(2026, 6, 2), 2),                 // run of 2
      rev(at(2026, 6, 10), 3), rev(at(2026, 6, 11), 4), rev(at(2026, 6, 12), 5), // run of 3
    ];
    expect(longestStreak(data(h))).toBe(3);
  });

  it('is 0 with no history', () => expect(longestStreak(data([]))).toBe(0));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run lib/insights/streak.test.ts`
Expected: FAIL — cannot resolve `./streak`.

- [ ] **Step 3: Implement `streak.ts`**

Create `apps/frontend/lib/insights/streak.ts`:

```ts
import type { AppData } from '@revision-app/shared';
import { startOfDay, addDays } from './day';

function revisedDays(data: AppData): Set<number> {
  const days = new Set<number>();
  for (const topic of Object.values(data.topics)) {
    if (topic.archivedAt) continue;
    for (const rev of topic.revisionHistory) days.add(startOfDay(rev.timestamp));
  }
  return days;
}

export function currentStreak(data: AppData, now: number): number {
  const days = revisedDays(data);
  const today = startOfDay(now);
  let anchor: number;
  if (days.has(today)) anchor = today;
  else if (days.has(addDays(today, -1))) anchor = addDays(today, -1);
  else return 0;

  let streak = 0;
  let cursor = anchor;
  while (days.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function longestStreak(data: AppData): number {
  const days = [...revisedDays(data)].sort((a, b) => a - b);
  if (days.length === 0) return 0;
  let longest = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    if (days[i] === addDays(days[i - 1], 1)) run += 1;
    else run = 1;
    if (run > longest) longest = run;
  }
  return longest;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && npx vitest run lib/insights/streak.test.ts`
Expected: PASS (7 passed).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/lib/insights/streak.ts apps/frontend/lib/insights/streak.test.ts
git commit -m "feat(insights): current + longest revision streaks"
```

---

### Task 3: Overall stats + topic rankings

**Files:**
- Create: `apps/frontend/lib/insights/rankings.ts`
- Test: `apps/frontend/lib/insights/rankings.test.ts`

**Interfaces:**
- Consumes: `badgeState`, `inGoodStanding`, `lastRevisedAt` from `@/lib/revision/engine`; `DAY_MS` from `@/lib/insights/day`; `AppData` from `@revision-app/shared`.
- Produces:
  - `export interface OverallStats { totalTopics: number; completionPct: number; neverRevised: number; dueToday: number; overdue: number; avgRevisionsPerTopic: number; avgDaysBetween?: number }`
  - `export interface TopicRevisionRank { topicId: string; title: string; subjectId: string; chapterId: string; count: number; lastRevised?: number }`
  - `export function overallStats(data: AppData, now: number): OverallStats`
  - `export function topicsByRevisionCount(data: AppData, limit?: number): { most: TopicRevisionRank[]; least: TopicRevisionRank[] }` — `least` excludes never-revised (count 0); both tie-break by `lastRevised` desc; archived topics/chapters/subjects excluded.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/lib/insights/rankings.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { AppData } from '@revision-app/shared';
import { overallStats, topicsByRevisionCount } from './rankings';

const now = new Date(2026, 6, 15, 12, 0, 0).getTime();
const day = (d: number) => new Date(2026, 6, d, 10, 0, 0).getTime();

function fixture(): AppData {
  return {
    subjectOrder: ['s1'],
    subjects: { s1: { id: 's1', name: 'S', color: '#000', icon: 'X', order: 0, chapterIds: ['c1'] } },
    chapters: { c1: { id: 'c1', subjectId: 's1', name: 'C', order: 0, difficulty: 'Medium', priority: 'Medium', topicIds: ['t1', 't2', 't3'] } },
    topics: {
      // revised twice, most recently day 14 -> in good standing
      t1: { id: 't1', chapterId: 'c1', title: 'A', notes: '', order: 0, difficulty: 'Medium', priority: 'Medium',
        revisionHistory: [{ id: 'a1', timestamp: day(12) }, { id: 'a2', timestamp: day(14) }], createdAt: 0, updatedAt: 0 },
      // revised once
      t2: { id: 't2', chapterId: 'c1', title: 'B', notes: '', order: 1, difficulty: 'Medium', priority: 'Medium',
        revisionHistory: [{ id: 'b1', timestamp: day(14) }], createdAt: 0, updatedAt: 0 },
      // never revised
      t3: { id: 't3', chapterId: 'c1', title: 'C', notes: '', order: 2, difficulty: 'Medium', priority: 'Medium',
        revisionHistory: [], createdAt: 0, updatedAt: 0 },
    },
    tags: {}, tagOrder: [],
  };
}

describe('overallStats', () => {
  it('reports totals, never-revised, and averages', () => {
    const s = overallStats(fixture(), now);
    expect(s.totalTopics).toBe(3);
    expect(s.neverRevised).toBe(1);
    expect(s.avgRevisionsPerTopic).toBe(1); // (2 + 1 + 0) / 3
    expect(s.avgDaysBetween).toBe(2);       // only t1 has a gap: day14 - day12 = 2 days
  });

  it('is all zeros for empty data', () => {
    const empty: AppData = { subjectOrder: [], subjects: {}, chapters: {}, topics: {}, tags: {}, tagOrder: [] };
    const s = overallStats(empty, now);
    expect(s.totalTopics).toBe(0);
    expect(s.completionPct).toBe(0);
    expect(s.avgDaysBetween).toBeUndefined();
  });
});

describe('topicsByRevisionCount', () => {
  it('ranks most by count desc and excludes never-revised from least', () => {
    const { most, least } = topicsByRevisionCount(fixture());
    expect(most.map((r) => r.topicId)).toEqual(['t1', 't2', 't3']); // desc by count; t3 (count 0) sorts last but is still listed
    expect(most[0].topicId).toBe('t1');
    expect(least.map((r) => r.topicId)).toEqual(['t2', 't1']); // ascending by count; t3 excluded (never revised)
    expect(least.every((r) => r.count > 0)).toBe(true);
    expect(most[0].subjectId).toBe('s1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run lib/insights/rankings.test.ts`
Expected: FAIL — cannot resolve `./rankings`.

- [ ] **Step 3: Implement `rankings.ts`**

Create `apps/frontend/lib/insights/rankings.ts`:

```ts
import type { AppData } from '@revision-app/shared';
import { badgeState, inGoodStanding, lastRevisedAt } from '@/lib/revision/engine';
import { DAY_MS } from './day';

export interface OverallStats {
  totalTopics: number;
  completionPct: number;
  neverRevised: number;
  dueToday: number;
  overdue: number;
  avgRevisionsPerTopic: number;
  avgDaysBetween?: number;
}

export interface TopicRevisionRank {
  topicId: string;
  title: string;
  subjectId: string;
  chapterId: string;
  count: number;
  lastRevised?: number;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function overallStats(data: AppData, now: number): OverallStats {
  const topics = Object.values(data.topics).filter((t) => !t.archivedAt);
  const total = topics.length;
  if (total === 0) {
    return { totalTopics: 0, completionPct: 0, neverRevised: 0, dueToday: 0, overdue: 0, avgRevisionsPerTopic: 0 };
  }

  let good = 0;
  let neverRevised = 0;
  let dueToday = 0;
  let overdue = 0;
  let totalRevisions = 0;
  let gapSum = 0;
  let gapCount = 0;

  for (const t of topics) {
    const h = t.revisionHistory;
    if (inGoodStanding(h, now)) good += 1;
    if (h.length === 0) neverRevised += 1;
    const state = badgeState(h, now);
    if (state === 'DueToday') dueToday += 1;
    if (state === 'Overdue') overdue += 1;
    totalRevisions += h.length;
    for (let i = 1; i < h.length; i++) {
      gapSum += (h[i].timestamp - h[i - 1].timestamp) / DAY_MS;
      gapCount += 1;
    }
  }

  return {
    totalTopics: total,
    completionPct: Math.round((good / total) * 100),
    neverRevised,
    dueToday,
    overdue,
    avgRevisionsPerTopic: round1(totalRevisions / total),
    avgDaysBetween: gapCount === 0 ? undefined : round1(gapSum / gapCount),
  };
}

export function topicsByRevisionCount(data: AppData, limit = 5): { most: TopicRevisionRank[]; least: TopicRevisionRank[] } {
  const ranks: TopicRevisionRank[] = [];
  for (const t of Object.values(data.topics)) {
    if (t.archivedAt) continue;
    const chapter = data.chapters[t.chapterId];
    if (!chapter || chapter.archivedAt) continue;
    if (data.subjects[chapter.subjectId]?.archivedAt) continue;
    ranks.push({
      topicId: t.id,
      title: t.title,
      subjectId: chapter.subjectId,
      chapterId: t.chapterId,
      count: t.revisionHistory.length,
      lastRevised: lastRevisedAt(t.revisionHistory),
    });
  }

  const most = [...ranks]
    .sort((a, b) => b.count - a.count || (b.lastRevised ?? 0) - (a.lastRevised ?? 0))
    .slice(0, limit);

  const least = ranks
    .filter((r) => r.count > 0)
    .sort((a, b) => a.count - b.count || (b.lastRevised ?? 0) - (a.lastRevised ?? 0))
    .slice(0, limit);

  return { most, least };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && npx vitest run lib/insights/rankings.test.ts`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/lib/insights/rankings.ts apps/frontend/lib/insights/rankings.test.ts
git commit -m "feat(insights): overall stats + topic revision rankings"
```

---

### Task 4: Calendar month buckets

**Files:**
- Create: `apps/frontend/lib/insights/calendar.ts`
- Test: `apps/frontend/lib/insights/calendar.test.ts`

**Interfaces:**
- Consumes: `badgeState`, `nextDueDate` from `@/lib/revision/engine`; `startOfDay` from `@/lib/insights/day`; `AppData` from `@revision-app/shared`.
- Produces:
  - `export interface CalendarDay { day: number; inMonth: boolean; dueTopicIds: string[]; overdueTopicIds: string[]; completedTopicIds: string[] }`
  - `export function calendarMonth(data: AppData, year: number, month: number, now: number): CalendarDay[]` — a 42-cell (6×7, Sunday-first) grid. `month` is 0-indexed (Jan=0). "Due" = topic's `nextDueDate` lands on that day; "completed" = a revision recorded that day; "overdue" appears only on the today cell. Archived topics excluded.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/lib/insights/calendar.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { AppData } from '@revision-app/shared';
import { calendarMonth } from './calendar';
import { startOfDay } from './day';

// now = 2026-07-15. A topic revised on 2026-07-14 is due +1 day = 2026-07-15 (today, DueToday).
const now = new Date(2026, 6, 15, 12, 0, 0).getTime();
const revisedYesterday = new Date(2026, 6, 14, 10, 0, 0).getTime();

function fixture(): AppData {
  return {
    subjectOrder: ['s1'],
    subjects: { s1: { id: 's1', name: 'S', color: '#000', icon: 'X', order: 0, chapterIds: ['c1'] } },
    chapters: { c1: { id: 'c1', subjectId: 's1', name: 'C', order: 0, difficulty: 'Medium', priority: 'Medium', topicIds: ['t1', 't2'] } },
    topics: {
      t1: { id: 't1', chapterId: 'c1', title: 'A', notes: '', order: 0, difficulty: 'Medium', priority: 'Medium',
        revisionHistory: [{ id: 'r1', timestamp: revisedYesterday }], createdAt: 0, updatedAt: 0 },
      t2: { id: 't2', chapterId: 'c1', title: 'B', notes: '', order: 1, difficulty: 'Medium', priority: 'Medium',
        revisionHistory: [{ id: 'r2', timestamp: revisedYesterday }], createdAt: 0, updatedAt: 0, archivedAt: 1 },
    },
    tags: {}, tagOrder: [],
  };
}

describe('calendarMonth', () => {
  it('returns a 42-cell grid with in-month flags', () => {
    const cells = calendarMonth(fixture(), 2026, 6, now); // July 2026
    expect(cells).toHaveLength(42);
    expect(cells.some((c) => !c.inMonth)).toBe(true);
    const july1 = cells.find((c) => c.day === new Date(2026, 6, 1).getTime());
    expect(july1?.inMonth).toBe(true);
  });

  it('places completed on the revision day and due on the due day, excluding archived', () => {
    const cells = calendarMonth(fixture(), 2026, 6, now);
    const y14 = cells.find((c) => c.day === new Date(2026, 6, 14).getTime())!;
    const y15 = cells.find((c) => c.day === new Date(2026, 6, 15).getTime())!;
    expect(y14.completedTopicIds).toEqual(['t1']); // t2 archived -> excluded
    expect(y15.dueTopicIds).toEqual(['t1']);       // due +1 day from revision
  });

  it('surfaces the current overdue backlog on the today cell only', () => {
    const overdue: AppData = fixture();
    // revised long ago so it is now overdue
    overdue.topics.t1.revisionHistory = [{ id: 'r1', timestamp: new Date(2026, 5, 1, 10, 0, 0).getTime() }];
    const cells = calendarMonth(overdue, 2026, 6, now);
    const todayCell = cells.find((c) => c.day === startOfDay(now))!;
    expect(todayCell.overdueTopicIds).toContain('t1');
    const otherCell = cells.find((c) => c.day === new Date(2026, 6, 20).getTime())!;
    expect(otherCell.overdueTopicIds).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run lib/insights/calendar.test.ts`
Expected: FAIL — cannot resolve `./calendar`.

- [ ] **Step 3: Implement `calendar.ts`**

Create `apps/frontend/lib/insights/calendar.ts`:

```ts
import type { AppData } from '@revision-app/shared';
import { badgeState, nextDueDate } from '@/lib/revision/engine';
import { startOfDay } from './day';

export interface CalendarDay {
  day: number;
  inMonth: boolean;
  dueTopicIds: string[];
  overdueTopicIds: string[];
  completedTopicIds: string[];
}

function pushId(map: Map<number, string[]>, key: number, id: string): void {
  const arr = map.get(key);
  if (arr) arr.push(id);
  else map.set(key, [id]);
}

export function calendarMonth(data: AppData, year: number, month: number, now: number): CalendarDay[] {
  const first = new Date(year, month, 1);
  const gridStart = new Date(first);
  gridStart.setDate(1 - first.getDay()); // back up to the Sunday on/before the 1st
  const today = startOfDay(now);

  const dueByDay = new Map<number, string[]>();
  const completedByDay = new Map<number, string[]>();
  const overdueToday: string[] = [];

  for (const t of Object.values(data.topics)) {
    if (t.archivedAt) continue;
    const due = nextDueDate(t.revisionHistory);
    if (due !== undefined) pushId(dueByDay, startOfDay(due), t.id);
    if (badgeState(t.revisionHistory, now) === 'Overdue') overdueToday.push(t.id);
    for (const rev of t.revisionHistory) pushId(completedByDay, startOfDay(rev.timestamp), t.id);
  }

  const cells: CalendarDay[] = [];
  const cursor = new Date(gridStart);
  for (let i = 0; i < 42; i++) {
    const day = startOfDay(cursor.getTime());
    cells.push({
      day,
      inMonth: cursor.getMonth() === month,
      dueTopicIds: dueByDay.get(day) ?? [],
      overdueTopicIds: day === today ? overdueToday : [],
      completedTopicIds: completedByDay.get(day) ?? [],
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return cells;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && npx vitest run lib/insights/calendar.test.ts`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/lib/insights/calendar.ts apps/frontend/lib/insights/calendar.test.ts
git commit -m "feat(insights): calendar month buckets (due/overdue/completed)"
```

---

### Task 5: Insights dashboard page + nav

**Files:**
- Create: `apps/frontend/components/insights/StatTile.tsx`
- Create: `apps/frontend/components/insights/HeatmapGrid.tsx`
- Create: `apps/frontend/app/insights/page.tsx`
- Modify: `apps/frontend/components/layout/AppShell.tsx` (add Insights link after the Filtered link, ~line 50)
- Modify: `apps/frontend/components/layout/MobileNavDrawer.tsx` (add Insights link after the Filtered link, ~line 49)
- Test: `apps/frontend/app/insights/InsightsPage.test.tsx`

**Interfaces:**
- Consumes: `overallStats`, `topicsByRevisionCount`, `TopicRevisionRank` from `@/lib/insights/rankings`; `revisionCountsByDay`, `DayCount` from `@/lib/insights/heatmap`; `currentStreak`, `longestStreak` from `@/lib/insights/streak`; `useStore` (returns `AppData`); `Breadcrumb` from `@/components/layout/Breadcrumb`.
- Produces: `StatTile` (`{ label: string; value: string | number; caption?: string }`), `HeatmapGrid` (`{ days: DayCount[] }`), default-export `InsightsPage`.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/app/insights/InsightsPage.test.tsx`:

```tsx
import { it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import InsightsPage from './page';
import { useStore } from '@/store/useStore';

beforeEach(() => useStore.setState({ subjects: {}, chapters: {}, topics: {}, subjectOrder: [], tags: {}, tagOrder: [] }));

it('shows an empty state when there is no data', () => {
  render(<InsightsPage />);
  expect(screen.getByText(/no revision activity yet/i)).toBeInTheDocument();
});

it('renders stats, a heatmap, and the topic in Most revised after a revision', () => {
  const s = useStore.getState().addSubject('S');
  const c = useStore.getState().addChapter(s, 'C');
  const t = useStore.getState().addTopic(c, 'Bernoulli');
  useStore.getState().markTopicRevised(t);
  render(<InsightsPage />);
  expect(screen.getByText('Completion')).toBeInTheDocument();
  expect(screen.getAllByTestId('heatmap-cell').length).toBeGreaterThan(0);
  expect(screen.getByText('Bernoulli')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run app/insights/InsightsPage.test.tsx`
Expected: FAIL — cannot resolve `./page`.

- [ ] **Step 3: Implement `StatTile.tsx`**

Create `apps/frontend/components/insights/StatTile.tsx`:

```tsx
export function StatTile({ label, value, caption }: { label: string; value: string | number; caption?: string }) {
  return (
    <div className="glass rounded-xl p-4">
      <div className="tblabel mb-1.5">{label}</div>
      <div className="text-2xl font-semibold tracking-tight text-ink">{value}</div>
      {caption && <div className="mt-0.5 text-xs opacity-50">{caption}</div>}
    </div>
  );
}
```

- [ ] **Step 4: Implement `HeatmapGrid.tsx`**

Create `apps/frontend/components/insights/HeatmapGrid.tsx`:

```tsx
'use client';
import type { DayCount } from '@/lib/insights/heatmap';

// Bronze-family intensity ramp (molten-reactor palette). bg-panel = empty day.
const LEVEL_CLASS = ['bg-panel', 'bg-accent/25', 'bg-accent/45', 'bg-accent/70', 'bg-accent'];

function level(count: number): number {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 5) return 3;
  return 4;
}

export function HeatmapGrid({ days }: { days: DayCount[] }) {
  const weeks: DayCount[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {week.map((d) => (
              <div
                key={d.day}
                data-testid="heatmap-cell"
                data-count={d.count}
                title={`${new Date(d.day).toLocaleDateString()} · ${d.count} revision${d.count === 1 ? '' : 's'}`}
                className={`h-3 w-3 rounded-sm ${LEVEL_CLASS[level(d.count)]}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Implement `app/insights/page.tsx`**

Create `apps/frontend/app/insights/page.tsx`:

```tsx
'use client';
import Link from 'next/link';
import type { AppData } from '@revision-app/shared';
import { useStore } from '@/store/useStore';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { StatTile } from '@/components/insights/StatTile';
import { HeatmapGrid } from '@/components/insights/HeatmapGrid';
import { overallStats, topicsByRevisionCount, type TopicRevisionRank } from '@/lib/insights/rankings';
import { revisionCountsByDay } from '@/lib/insights/heatmap';
import { currentStreak, longestStreak } from '@/lib/insights/streak';

function RankList({ title, rows, data }: { title: string; rows: TopicRevisionRank[]; data: AppData }) {
  return (
    <div>
      <div className="tblabel mb-2">{title}</div>
      {rows.length === 0 ? (
        <p className="text-sm opacity-50">Nothing yet.</p>
      ) : (
        <div className="grid gap-2">
          {rows.map((r) => {
            const subject = data.subjects[r.subjectId];
            const chapter = data.chapters[r.chapterId];
            return (
              <Link key={r.topicId} href={`/topic/${r.topicId}`} className="glass flex items-center justify-between gap-3 rounded-xl p-3 hover:bg-panel-2">
                <div className="min-w-0">
                  <div className="font-medium">{r.title}</div>
                  <div className="mt-0.5 truncate text-xs opacity-50">{subject?.name}{chapter ? ` · ${chapter.name}` : ''}</div>
                </div>
                <span className="tblabel shrink-0">{r.count}×</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function InsightsPage() {
  const data = useStore();
  const now = Date.now();
  const stats = overallStats(data, now);
  const heat = revisionCountsByDay(data, 365, now);
  const streak = currentStreak(data, now);
  const longest = longestStreak(data);
  const { most, least } = topicsByRevisionCount(data);

  return (
    <div>
      <Breadcrumb items={[{ label: 'Subjects', href: '/' }, { label: 'Insights' }]} />
      <div className="mb-6 mt-4">
        <div className="tblabel mb-1.5">Progress · Statistics</div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Insights</h1>
      </div>

      {stats.totalTopics === 0 ? (
        <p className="text-sm opacity-50">No revision activity yet. Mark a topic revised to start building insights.</p>
      ) : (
        <div className="grid gap-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Completion" value={`${stats.completionPct}%`} caption={`${stats.totalTopics} topics`} />
            <StatTile label="Current streak" value={streak} caption="days" />
            <StatTile label="Longest streak" value={longest} caption="days" />
            <StatTile label="Due / Overdue" value={`${stats.dueToday} / ${stats.overdue}`} caption={`${stats.neverRevised} never revised`} />
          </div>

          <div>
            <div className="tblabel mb-2">Activity · last 12 months</div>
            <HeatmapGrid days={heat} />
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <RankList title="Most revised" rows={most} data={data} />
            <RankList title="Least revised" rows={least} data={data} />
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Add the Insights nav link (desktop)**

In `apps/frontend/components/layout/AppShell.tsx`, immediately after the existing Filtered `<Link>` (the line containing `href="/filtered"`), add:

```tsx
            <Link href="/insights" className="tblabel hidden rounded px-2 py-1 transition hover:bg-panel hover:text-ink sm:block">Insights</Link>
```

- [ ] **Step 7: Add the Insights nav link (mobile)**

In `apps/frontend/components/layout/MobileNavDrawer.tsx`, immediately after the existing Filtered `<Link>` (the line containing `href="/filtered"`), add:

```tsx
              <Link href="/insights" onClick={close} className="tblabel rounded px-2 py-1 transition hover:bg-panel hover:text-ink">Insights</Link>
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd apps/frontend && npx vitest run app/insights/InsightsPage.test.tsx`
Expected: PASS (2 passed).

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/components/insights/StatTile.tsx apps/frontend/components/insights/HeatmapGrid.tsx apps/frontend/app/insights/ apps/frontend/components/layout/AppShell.tsx apps/frontend/components/layout/MobileNavDrawer.tsx
git commit -m "feat(insights): statistics dashboard page + nav link"
```

---

### Task 6: Calendar page + nav

**Files:**
- Create: `apps/frontend/components/insights/MonthCalendar.tsx`
- Create: `apps/frontend/app/calendar/page.tsx`
- Modify: `apps/frontend/components/layout/AppShell.tsx` (add Calendar link after the Insights link)
- Modify: `apps/frontend/components/layout/MobileNavDrawer.tsx` (add Calendar link after the Insights link)
- Test: `apps/frontend/app/calendar/CalendarPage.test.tsx`

**Interfaces:**
- Consumes: `calendarMonth`, `CalendarDay` from `@/lib/insights/calendar`; `useStore`; `TopicResultRow` from `@/components/TopicResultRow` (props `{ topic: Topic; subject?: Subject; chapter?: Chapter }`); `Breadcrumb`; `ChevronLeft`/`ChevronRight` from `lucide-react`.
- Produces: `MonthCalendar` (no props), default-export `CalendarPage`.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/app/calendar/CalendarPage.test.tsx`:

```tsx
import { it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import CalendarPage from './page';
import { useStore } from '@/store/useStore';

beforeEach(() => useStore.setState({ subjects: {}, chapters: {}, topics: {}, subjectOrder: [], tags: {}, tagOrder: [] }));

it('renders the current month heading', () => {
  render(<CalendarPage />);
  const monthName = new Date().toLocaleString('en-US', { month: 'long' });
  expect(screen.getAllByText(new RegExp(monthName, 'i')).length).toBeGreaterThan(0);
});

it('lists a topic revised today under the default-selected today cell', () => {
  const s = useStore.getState().addSubject('S');
  const c = useStore.getState().addChapter(s, 'C');
  const t = useStore.getState().addTopic(c, 'Bernoulli');
  useStore.getState().markTopicRevised(t); // recorded now -> completed today
  render(<CalendarPage />);
  expect(screen.getByText('Bernoulli')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run app/calendar/CalendarPage.test.tsx`
Expected: FAIL — cannot resolve `./page`.

- [ ] **Step 3: Implement `MonthCalendar.tsx`**

Create `apps/frontend/components/insights/MonthCalendar.tsx`:

```tsx
'use client';
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { AppData } from '@revision-app/shared';
import { useStore } from '@/store/useStore';
import { calendarMonth, type CalendarDay } from '@/lib/insights/calendar';
import { TopicResultRow } from '@/components/TopicResultRow';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function SelectedDayTopics({ cell, data }: { cell: CalendarDay; data: AppData }) {
  const ids = [...new Set([...cell.overdueTopicIds, ...cell.dueTopicIds, ...cell.completedTopicIds])];
  if (ids.length === 0) return <p className="text-sm opacity-50">Nothing scheduled or completed on this day.</p>;
  return (
    <div className="grid gap-2">
      {ids.map((id) => {
        const topic = data.topics[id];
        if (!topic) return null;
        const chapter = data.chapters[topic.chapterId];
        const subject = chapter ? data.subjects[chapter.subjectId] : undefined;
        return <TopicResultRow key={id} topic={topic} subject={subject} chapter={chapter} />;
      })}
    </div>
  );
}

export function MonthCalendar() {
  const data = useStore();
  const now = Date.now();
  const todayMidnight = new Date(now);
  todayMidnight.setHours(0, 0, 0, 0);

  const [view, setView] = useState({ year: todayMidnight.getFullYear(), month: todayMidnight.getMonth() });
  const [selected, setSelected] = useState<number>(todayMidnight.getTime());

  const cells = useMemo(() => calendarMonth(data, view.year, view.month, now), [data, view, now]);
  const selectedCell = cells.find((c) => c.day === selected);

  const step = (delta: number) => {
    const d = new Date(view.year, view.month + delta, 1);
    setView({ year: d.getFullYear(), month: d.getMonth() });
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button onClick={() => step(-1)} aria-label="Previous month" className="rounded p-1 transition hover:bg-panel"><ChevronLeft size={16} /></button>
        <div className="font-medium">{MONTHS[view.month]} {view.year}</div>
        <button onClick={() => step(1)} aria-label="Next month" className="rounded p-1 transition hover:bg-panel"><ChevronRight size={16} /></button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {DOW.map((d) => <div key={d} className="tblabel py-1">{d}</div>)}
        {cells.map((c) => {
          const isSelected = c.day === selected;
          return (
            <button
              key={c.day}
              onClick={() => setSelected(c.day)}
              className={`aspect-square rounded-lg p-1 text-xs transition ${c.inMonth ? 'bg-panel hover:bg-panel-2' : 'opacity-30'} ${isSelected ? 'ring-1 ring-accent' : ''}`}
            >
              <div>{new Date(c.day).getDate()}</div>
              <div className="mt-0.5 flex justify-center gap-0.5">
                {c.overdueTopicIds.length > 0 && <span className="h-1 w-1 rounded-full bg-red-400" title="Overdue" />}
                {c.dueTopicIds.length > 0 && <span className="h-1 w-1 rounded-full bg-amber-400" title="Due" />}
                {c.completedTopicIds.length > 0 && <span className="h-1 w-1 rounded-full bg-emerald-400" title="Completed" />}
              </div>
            </button>
          );
        })}
      </div>

      {selectedCell && (
        <div className="mt-4">
          <div className="tblabel mb-2">{new Date(selectedCell.day).toLocaleDateString()}</div>
          <SelectedDayTopics cell={selectedCell} data={data} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Implement `app/calendar/page.tsx`**

Create `apps/frontend/app/calendar/page.tsx`:

```tsx
'use client';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { MonthCalendar } from '@/components/insights/MonthCalendar';

export default function CalendarPage() {
  return (
    <div>
      <Breadcrumb items={[{ label: 'Subjects', href: '/' }, { label: 'Calendar' }]} />
      <div className="mb-6 mt-4">
        <div className="tblabel mb-1.5">Schedule · Upcoming</div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Calendar</h1>
      </div>
      <MonthCalendar />
    </div>
  );
}
```

- [ ] **Step 5: Add the Calendar nav link (desktop)**

In `apps/frontend/components/layout/AppShell.tsx`, immediately after the Insights `<Link>` added in Task 5, add:

```tsx
            <Link href="/calendar" className="tblabel hidden rounded px-2 py-1 transition hover:bg-panel hover:text-ink sm:block">Calendar</Link>
```

- [ ] **Step 6: Add the Calendar nav link (mobile)**

In `apps/frontend/components/layout/MobileNavDrawer.tsx`, immediately after the Insights `<Link>` added in Task 5, add:

```tsx
              <Link href="/calendar" onClick={close} className="tblabel rounded px-2 py-1 transition hover:bg-panel hover:text-ink">Calendar</Link>
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd apps/frontend && npx vitest run app/calendar/CalendarPage.test.tsx`
Expected: PASS (2 passed).

- [ ] **Step 8: Full suite + typecheck (regression gate)**

Run: `cd apps/frontend && npx vitest run && npx tsc --noEmit`
Expected: all tests PASS; no type errors.

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/components/insights/MonthCalendar.tsx apps/frontend/app/calendar/ apps/frontend/components/layout/AppShell.tsx apps/frontend/components/layout/MobileNavDrawer.tsx
git commit -m "feat(insights): calendar view page + nav link"
```

---

## Self-Review Notes (author checklist — for reference during execution)

- **Spec coverage:** heatmap → Task 1; streaks → Task 2; most/least revised + completion % + averages → Task 3; calendar buckets → Task 4; dashboard page + heatmap UI + nav → Task 5; calendar page + nav → Task 6. Notifications intentionally omitted (deferred per spec §7).
- **Type consistency:** `DayCount`, `TopicRevisionRank`, `OverallStats`, `CalendarDay` are defined once in their module and imported by name in later tasks. `startOfDay` is exported in Task 1 and re-exported via `day.ts`.
- **No new deps:** all UI is Tailwind + lucide-react (already used). No charting library.
- **Palette caveat:** heatmap/calendar use `bg-accent`, `bg-panel`, `bg-panel-2`, `ring-accent` — confirm these exist in the Tailwind config during Task 5/6; if an accent-opacity class (`bg-accent/25`) isn't generated, use the nearest existing bronze token rather than adding config.
```
