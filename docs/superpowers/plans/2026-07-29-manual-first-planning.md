# Manual-First Revision Planning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ladder-derived due dates with user-set `plannedAt` dates; the ladder survives only as a suggestion offered when marking a topic revised.

**Architecture:** `Topic` gains `plannedAt?: number | null` (number = planned, `null` = deliberately unplanned, `undefined` = legacy → migrated at load). The shared engine's `nextDueDate`/`badgeState` read only `plannedAt`; the old ladder math becomes `suggestedNextDate()`. Everything downstream (badges, calendar, agenda, stats, cohort) derives from those two functions, so the ripple is mostly mechanical signature updates plus new planning UI (post-revise dialog, calendar day-rail picker, subject bulk planner).

**Tech Stack:** TypeScript monorepo — Next 15 App Router + zustand + vitest (apps/frontend), zod (packages/shared), express (services/content-service). No new dependencies.

## Global Constraints

- No new npm dependencies anywhere.
- `plannedAt` semantics are fixed: `number` (epoch ms, local start-of-day) = planned; `null` = deliberately unplanned; `undefined` = legacy, backfilled once at the load boundary (`normalizeData`).
- New badge state is spelled exactly `Unplanned`.
- Engine call convention after this change: `nextDueDate(topic)` and `badgeState(topic, now)` take a `Plannable` (`{ revisionHistory, plannedAt? }`) — never a bare `Revision[]`.
- Commit with explicit file paths (`git add <paths>`), never `git add -A` — this repo has a history of unrelated files being swept into commits.
- Use `127.0.0.1`, never `localhost`, in any curl/verification command.
- Tests: `npm test` inside `packages/shared`, `apps/frontend`, `services/content-service`; type check with `npx tsc --noEmit` in `apps/frontend`.

---

### Task 1: Shared engine — `plannedAt`, `Unplanned`, `suggestedNextDate`

**Files:**
- Modify: `packages/shared/src/types.ts` (Topic interface, ~line 58)
- Modify: `packages/shared/src/schema.ts` (topicSchema, ~line 9)
- Modify: `packages/shared/src/revision.ts`
- Test: `packages/shared/src/revision.test.ts`

**Interfaces:**
- Consumes: existing `Revision`, `Topic`, `LADDER`, `nextInterval`, `lastRevisedAt`, `startOfDay`, `DAY_MS`.
- Produces (later tasks rely on these exact signatures, all exported from `@revision-app/shared`):
  - `interface Plannable { revisionHistory: Revision[]; plannedAt?: number | null }`
  - `nextDueDate(t: Plannable): number | undefined`
  - `suggestedNextDate(h: Revision[]): number | undefined`
  - `badgeState(t: Plannable, now: number): BadgeState` where `BadgeState` now includes `'Unplanned'`
  - `Topic.plannedAt?: number | null`

- [ ] **Step 1: Write the failing tests**

Append to `packages/shared/src/revision.test.ts` (follow the file's existing describe/it style; `DAY_MS` is already exported):

```ts
describe('manual-first scheduling', () => {
  const NOW = new Date(2026, 6, 29, 12, 0, 0).getTime();
  const rev = (ts: number) => ({ id: `r${ts}`, timestamp: ts });

  it('nextDueDate returns plannedAt and ignores the ladder', () => {
    const planned = startOfDay(NOW + 5 * DAY_MS);
    expect(nextDueDate({ revisionHistory: [rev(NOW - DAY_MS)], plannedAt: planned })).toBe(planned);
  });

  it('nextDueDate returns undefined when plannedAt is null or undefined', () => {
    expect(nextDueDate({ revisionHistory: [rev(NOW - DAY_MS)], plannedAt: null })).toBeUndefined();
    expect(nextDueDate({ revisionHistory: [rev(NOW - DAY_MS)] })).toBeUndefined();
  });

  it('suggestedNextDate preserves the old ladder math', () => {
    const last = NOW - DAY_MS;
    expect(suggestedNextDate([rev(last)])).toBe(last + 1 * DAY_MS);       // 1 revision -> +1d
    expect(suggestedNextDate([rev(last - DAY_MS), rev(last)])).toBe(last + 3 * DAY_MS); // 2 -> +3d
    expect(suggestedNextDate([])).toBeUndefined();
  });

  it('badgeState distinguishes NeverRevised from Unplanned', () => {
    expect(badgeState({ revisionHistory: [] }, NOW)).toBe('NeverRevised');
    expect(badgeState({ revisionHistory: [rev(NOW - 3 * DAY_MS)], plannedAt: null }, NOW)).toBe('Unplanned');
    expect(badgeState({ revisionHistory: [rev(NOW - 3 * DAY_MS)] }, NOW)).toBe('Unplanned');
  });

  it('badgeState rates due states against plannedAt', () => {
    const h = [rev(NOW - 10 * DAY_MS)];
    expect(badgeState({ revisionHistory: h, plannedAt: startOfDay(NOW - DAY_MS) }, NOW)).toBe('Overdue');
    expect(badgeState({ revisionHistory: h, plannedAt: startOfDay(NOW) }, NOW)).toBe('DueToday');
    expect(badgeState({ revisionHistory: h, plannedAt: startOfDay(NOW + DAY_MS) }, NOW)).toBe('DueTomorrow');
    expect(badgeState({ revisionHistory: h, plannedAt: startOfDay(NOW + 5 * DAY_MS) }, NOW)).toBe('Upcoming');
  });

  it('badgeState returns RecentlyRevised when revised within a day and planned ahead', () => {
    const h = [rev(NOW - DAY_MS)];
    expect(badgeState({ revisionHistory: h, plannedAt: startOfDay(NOW + 7 * DAY_MS) }, NOW)).toBe('RecentlyRevised');
  });

  it('a planned but never-revised topic gets due states, not NeverRevised', () => {
    expect(badgeState({ revisionHistory: [], plannedAt: startOfDay(NOW) }, NOW)).toBe('DueToday');
  });
});
```

Add `suggestedNextDate` to the test file's import from `./revision`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/subaru/projects/revision_app/packages/shared && npm test`
Expected: FAIL — `suggestedNextDate` not exported; `badgeState`/`nextDueDate` argument type mismatches.

- [ ] **Step 3: Implement the engine change**

In `packages/shared/src/types.ts`, add to `Topic` after `revisionHistory: Revision[];`:

```ts
  // Manual-first scheduling: number = user-planned due date (local start-of-day
  // epoch ms), null = deliberately unplanned, undefined = legacy snapshot
  // (backfilled from the ladder at the load boundary).
  plannedAt?: number | null;
```

In `packages/shared/src/schema.ts`, add to `topicSchema` after `revisionHistory`:

```ts
  plannedAt: z.number().nullable().optional(),
```

In `packages/shared/src/revision.ts`, replace `nextDueDate` and `badgeState` with:

```ts
// A topic-shaped value the scheduler can read. Topic satisfies this.
export interface Plannable {
  revisionHistory: Revision[];
  plannedAt?: number | null;
}

// Manual-first: a topic is due only when the user planned it.
export function nextDueDate(t: Plannable): number | undefined {
  return t.plannedAt ?? undefined;
}

// The old ladder-derived date, demoted to a suggestion for the plan-next UI.
export function suggestedNextDate(h: Revision[]): number | undefined {
  const last = lastRevisedAt(h);
  if (last === undefined) return undefined;
  return last + nextInterval(h.length) * DAY_MS;
}
```

Extend `BadgeState` and rewrite `badgeState`:

```ts
export type BadgeState =
  | 'NeverRevised' | 'Unplanned' | 'Overdue' | 'DueToday'
  | 'DueTomorrow' | 'RecentlyRevised' | 'Upcoming';

export function badgeState(t: Plannable, now: number): BadgeState {
  const due = nextDueDate(t);
  if (due === undefined) return t.revisionHistory.length === 0 ? 'NeverRevised' : 'Unplanned';
  const dayDiff = Math.round((startOfDay(due) - startOfDay(now)) / DAY_MS);
  if (dayDiff < 0) return 'Overdue';
  if (dayDiff === 0) return 'DueToday';
  const since = daysSince(t.revisionHistory, now);
  if (since !== undefined && since <= 1) return 'RecentlyRevised';
  if (dayDiff === 1) return 'DueTomorrow';
  return 'Upcoming';
}
```

- [ ] **Step 4: Fix pre-existing tests in this package**

Any existing `revision.test.ts` cases calling `nextDueDate(history)` / `badgeState(history, now)` must wrap the history: `badgeState({ revisionHistory: h, plannedAt: <the date the old ladder would have produced> }, now)` — use `suggestedNextDate(h)` as the `plannedAt` value when a test's intent was "ladder schedule in effect". Tests asserting ladder math itself should now target `suggestedNextDate`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /home/subaru/projects/revision_app/packages/shared && npm test`
Expected: PASS, all suites.

- [ ] **Step 6: Commit**

```bash
cd /home/subaru/projects/revision_app
git add packages/shared/src/types.ts packages/shared/src/schema.ts packages/shared/src/revision.ts packages/shared/src/revision.test.ts
git commit -m "feat(engine): manual-first scheduling — plannedAt is the only due date, ladder becomes suggestedNextDate"
```

Note: `apps/frontend` and `services/content-service` will not type-check until Tasks 2–3 land; that is expected mid-plan.

---

### Task 2: Content-service cohort projection

**Files:**
- Modify: `services/content-service/src/cohort.ts:167,170`

**Interfaces:**
- Consumes: `badgeState(t, now)`, `nextDueDate(t)` from Task 1.
- Produces: unchanged `StudentDrilldown` wire shape (`state`, `nextDueAt`) — values now reflect plans.

- [ ] **Step 1: Update the two call sites**

In the topic projection (~lines 165–171), change:

```ts
state: badgeState(t.revisionHistory, now),
...
nextDueAt: nextDueDate(t.revisionHistory) ?? null,
```

to:

```ts
state: badgeState(t, now),
...
nextDueAt: nextDueDate(t) ?? null,
```

(`t` here is a full `Topic` from `data.topics`, which satisfies `Plannable`. The whitelist projection still only emits scalar fields — nothing new leaks.)

- [ ] **Step 2: Type-check and test**

Run: `cd /home/subaru/projects/revision_app/services/content-service && npx tsc --noEmit && npm test`
Expected: tsc clean; vitest PASS. If tests require Postgres, start it first with `docker compose up -d` from the repo root and re-run.

- [ ] **Step 3: Commit**

```bash
cd /home/subaru/projects/revision_app
git add services/content-service/src/cohort.ts
git commit -m "refactor(content-service): cohort projection reads plan-aware badgeState/nextDueDate"
```

---

### Task 3: Frontend — engine wrapper, call sites, migration, store actions, badge

This is the "make the frontend compile and pass again" task: mechanical signature updates everywhere, plus the load-boundary migration, silent-field preservation, the store's planning actions, and the `Unplanned` badge variant.

**Files:**
- Modify: `apps/frontend/lib/revision/engine.ts`
- Modify: `apps/frontend/lib/domain/normalize.ts`
- Modify: `apps/frontend/store/silentFields.ts`
- Modify: `apps/frontend/store/useStore.ts`
- Modify: `apps/frontend/components/RevisionBadge.tsx`
- Modify (mechanical, listed below): `lib/insights/calendar.ts`, `lib/insights/agenda.ts`, `lib/insights/rankings.ts`, `lib/filters/quickFilters.ts`, `lib/filters/predicates.ts`, `lib/revision/progress.ts`, `lib/revision/todayQueue.ts`, `components/TopicResultRow.tsx`, `components/cards/TopicCard.tsx`, `app/topic/[id]/page.tsx`
- Test: existing frontend suites (`npm test`), plus new cases in `apps/frontend/store/useStore.test.ts`

**Interfaces:**
- Consumes: `Plannable`, `nextDueDate(t)`, `badgeState(t, now)`, `suggestedNextDate(h)` from Task 1.
- Produces (later tasks rely on):
  - Store actions: `planTopic(id: string, date: number): void`, `planTopics(ids: string[], date: number): void`, `clearPlan(id: string): void`
  - `markRevised(topic, now)` (lib/revision/engine) now also sets `plannedAt: null`
  - `suggestedNextDate` re-exported from `@/lib/revision/engine`
  - `RevisionBadge` renders `Unplanned`

- [ ] **Step 1: Update the frontend engine wrapper** (`lib/revision/engine.ts`)

Add `suggestedNextDate` to both the import and re-export lists from `@revision-app/shared`, and re-export the type: `export type { BadgeState, Plannable } from '@revision-app/shared';`

Change `inGoodStanding` (an unplanned topic needs attention — it is not in good standing):

```ts
export function inGoodStanding(t: Plannable, now: number): boolean {
  const s = badgeState(t, now);
  return s !== 'Overdue' && s !== 'DueToday' && s !== 'NeverRevised' && s !== 'Unplanned';
}
```

Change `markRevised` — revising fulfils the current plan; the plan-next dialog (Task 4) sets the next one:

```ts
export function markRevised(topic: Topic, now: number): Topic {
  const revision: Revision = { id: makeId(), timestamp: now };
  return {
    ...topic,
    revisionHistory: [...topic.revisionHistory, revision],
    plannedAt: null,
    updatedAt: now,
  };
}
```

- [ ] **Step 2: Mechanical call-site updates** (compile-error driven; this is the complete list)

| File:line | Before | After |
|---|---|---|
| `lib/insights/calendar.ts:31` | `nextDueDate(t.revisionHistory)` | `nextDueDate(t)` |
| `lib/insights/calendar.ts:33` | `badgeState(t.revisionHistory, now)` | `badgeState(t, now)` |
| `lib/insights/agenda.ts:53,93` | `badgeState(t.revisionHistory, now)` | `badgeState(t, now)` |
| `lib/insights/agenda.ts:62,94,102` | `nextDueDate(t.revisionHistory)` | `nextDueDate(t)` |
| `lib/insights/rankings.ts:46` | `inGoodStanding(h, now)` | `inGoodStanding(t, now)` |
| `lib/insights/rankings.ts:48` | `badgeState(h, now)` | `badgeState(t, now)` |
| `lib/filters/quickFilters.ts:22,23` | `badgeState(topic.revisionHistory, now)` | `badgeState(topic, now)` |
| `lib/filters/predicates.ts:18` | `badgeState(topic.revisionHistory, now)` | `badgeState(topic, now)` |
| `lib/revision/progress.ts:19` | `badgeState(t.revisionHistory, now)` | `badgeState(t, now)` |
| `lib/revision/progress.ts:35,65` | `inGoodStanding(t.revisionHistory, now)` | `inGoodStanding(t, now)` |
| `lib/revision/todayQueue.ts:22` | `badgeState(topic.revisionHistory, now)` | `badgeState(topic, now)` |
| `components/TopicResultRow.tsx:14` | `badgeState(topic.revisionHistory, Date.now())` | `badgeState(topic, Date.now())` |
| `components/cards/TopicCard.tsx:38` | `badgeState(topic.revisionHistory, now)` | `badgeState(topic, now)` |
| `app/topic/[id]/page.tsx:45` | `badgeState(topic.revisionHistory, Date.now())` | `badgeState(topic, Date.now())` |

- [ ] **Step 3: Load-boundary migration** (`lib/domain/normalize.ts`)

```ts
import type { AppData } from '@revision-app/shared';
import { suggestedNextDate } from '@revision-app/shared';
import { makeBuiltinTags } from './builtinTags';

export function normalizeData(raw: Partial<AppData> | null | undefined): AppData {
  const src = raw ?? {};
  const base: AppData = {
    subjects: src.subjects ?? {},
    chapters: src.chapters ?? {},
    topics: src.topics ?? {},
    subjectOrder: src.subjectOrder ?? [],
    tags: src.tags ?? {},
    tagOrder: src.tagOrder ?? [],
  };
  // plannedAt migration: legacy snapshots (field absent) inherit the old
  // ladder-derived due date so calendars don't empty on upgrade. null
  // (deliberate skip/clear) is preserved as-is.
  let topics = base.topics;
  let changed = false;
  for (const id of Object.keys(topics)) {
    const t = topics[id];
    if (t.plannedAt === undefined && t.revisionHistory.length > 0) {
      if (!changed) { topics = { ...topics }; changed = true; }
      topics[id] = { ...t, plannedAt: suggestedNextDate(t.revisionHistory) };
    }
  }
  const migrated = changed ? { ...base, topics } : base;
  if (src.tagOrder === undefined) return { ...migrated, ...makeBuiltinTags() };
  return migrated;
}
```

- [ ] **Step 4: Preserve plans across undo/redo** (`store/silentFields.ts`)

Planning is a silent (non-undoable) edit like mark-revised, so undo must not revert it:

```ts
if (cur) topics[id] = { ...topics[id], notes: cur.notes, revisionHistory: cur.revisionHistory, plannedAt: cur.plannedAt };
```

- [ ] **Step 5: Store planning actions** (`store/useStore.ts`)

Add to the `StoreState` interface after `markTopicRevised`:

```ts
  planTopic: (id: string, date: number) => void;
  planTopics: (ids: string[], date: number) => void;
  clearPlan: (id: string) => void;
```

Add `startOfDay` to the import from `@/lib/revision/engine`, and implement after `markTopicRevised` (silent commits, matching mark-revised semantics):

```ts
      planTopic: (id, date) => {
        const s = get();
        const topic = s.topics[id];
        if (!topic) return;
        commitSilent({ topics: { ...s.topics, [id]: { ...topic, plannedAt: startOfDay(date), updatedAt: Date.now() } } });
      },

      planTopics: (ids, date) => {
        const s = get();
        const day = startOfDay(date);
        const now = Date.now();
        const topics = { ...s.topics };
        let any = false;
        for (const id of ids) {
          const t = topics[id];
          if (!t) continue;
          topics[id] = { ...t, plannedAt: day, updatedAt: now };
          any = true;
        }
        if (any) commitSilent({ topics });
      },

      clearPlan: (id) => {
        const s = get();
        const topic = s.topics[id];
        if (!topic) return;
        commitSilent({ topics: { ...s.topics, [id]: { ...topic, plannedAt: null, updatedAt: Date.now() } } });
      },
```

- [ ] **Step 6: `Unplanned` badge variant** (`components/RevisionBadge.tsx`)

```ts
const LABELS: Record<BadgeState, string> = {
  NeverRevised: 'NEW', Unplanned: 'UNPLANNED', Overdue: 'OVERDUE', DueToday: 'DUE TODAY',
  DueTomorrow: 'DUE +1D', RecentlyRevised: 'REVISED', Upcoming: 'UPCOMING',
};
```

and in `COLORS` add: `Unplanned: 'border-line-strong text-ink-dim bg-panel-2',`

- [ ] **Step 7: Store tests for the new actions**

Append to `store/useStore.test.ts` (follow its existing setup helpers):

```ts
describe('manual planning', () => {
  it('planTopic stamps start-of-day plannedAt', () => {
    // create subject -> chapter -> topic via existing store actions, then:
    const ts = Date.now() + 3 * 86_400_000;
    useStore.getState().planTopic(topicId, ts);
    const planned = useStore.getState().topics[topicId].plannedAt;
    expect(planned).toBe(new Date(new Date(ts).setHours(0, 0, 0, 0)).getTime());
  });

  it('clearPlan sets plannedAt to null (deliberately unplanned)', () => {
    useStore.getState().planTopic(topicId, Date.now());
    useStore.getState().clearPlan(topicId);
    expect(useStore.getState().topics[topicId].plannedAt).toBeNull();
  });

  it('markTopicRevised clears the plan', () => {
    useStore.getState().planTopic(topicId, Date.now() + 86_400_000);
    useStore.getState().markTopicRevised(topicId);
    expect(useStore.getState().topics[topicId].plannedAt).toBeNull();
  });

  it('planTopics stamps every listed topic', () => {
    const ts = Date.now() + 2 * 86_400_000;
    useStore.getState().planTopics([topicA, topicB], ts);
    expect(useStore.getState().topics[topicA].plannedAt).toBe(useStore.getState().topics[topicB].plannedAt);
  });
});
```

- [ ] **Step 8: Repair existing frontend tests**

Run: `cd /home/subaru/projects/revision_app/apps/frontend && npx tsc --noEmit && npm test`

Expected initial failures cluster in fixtures that assume the ladder schedules automatically. Repair rules (apply exactly — the semantics changed on purpose):

1. **Fixtures that build topics with `revisionHistory` timed to hit a due state** (e.g. `lib/insights/agenda.test.ts`, `lib/insights/calendar` tests, `app/calendar/CalendarPage.test.tsx`, `app/insights/InsightsPage.test.tsx`): add an explicit `plannedAt` to the fixture topic equal to the date the test intended, e.g. a topic that was "due tomorrow" via one revision yesterday becomes `{ ...topic, plannedAt: startOfDay(NOW + DAY_MS) }`. Where the fixture drives state through `markTopicRevised`, follow it with `useStore.getState().planTopic(topicId, <intended due ts>)` — e.g. `CalendarPage.test.tsx:19` becomes:

```ts
useStore.getState().markTopicRevised(t);
useStore.getState().planTopic(t, NOW + DAY_MS); // due tomorrow -> appears in the agenda horizon
```

2. **Tests asserting badge/stat outcomes after `markTopicRevised` alone**: the topic is now `Unplanned` (or `RecentlyRevised` is gone unless planned). Either plan it (rule 1) or update the expectation to `Unplanned` when the test's point is "what happens right after revising with no plan".
3. **Do not weaken assertions** — every updated test must still pin a specific state.

Iterate until: `npx tsc --noEmit` clean and `npm test` fully green.

- [ ] **Step 9: Commit**

```bash
cd /home/subaru/projects/revision_app
git add apps/frontend/lib apps/frontend/store apps/frontend/components/RevisionBadge.tsx apps/frontend/components/TopicResultRow.tsx apps/frontend/components/cards/TopicCard.tsx "apps/frontend/app/topic/[id]/page.tsx" apps/frontend/app/calendar/CalendarPage.test.tsx apps/frontend/app/insights/InsightsPage.test.tsx
git commit -m "feat(frontend): manual-first planning — plan-aware engine, store plan actions, load-boundary migration, Unplanned badge"
```

(Adjust the `git add` list to the files actually touched in Step 8 — explicit paths only.)

---

### Task 4: Plan-next dialog after marking revised

**Files:**
- Create: `apps/frontend/components/PlanNextDialog.tsx`
- Modify: `apps/frontend/app/topic/[id]/page.tsx`
- Modify: `apps/frontend/components/TodayQueue.tsx`
- Test: `apps/frontend/components/PlanNextDialog.test.tsx`

**Interfaces:**
- Consumes: `planTopic`, `clearPlan` (Task 3), `suggestedNextDate`, `startOfDay` from `@/lib/revision/engine`.
- Produces: `PlanNextDialog({ topicId, title, onClose }: { topicId: string; title?: string; onClose: () => void })` — modal that plans or skips; `title` defaults to `'Revised · Plan next'` (the schedule-anytime reuse passes `'Plan revision'`).

- [ ] **Step 1: Write the failing test**

```tsx
// components/PlanNextDialog.test.tsx — follow RevisionHistoryPanel.test.tsx's
// store-seeding pattern (create subject/chapter/topic via useStore actions).
import { render, screen, fireEvent } from '@testing-library/react';
import { useStore } from '@/store/useStore';
import { PlanNextDialog } from './PlanNextDialog';

it('planning +1d stamps tomorrow start-of-day and closes', () => {
  const onClose = vi.fn();
  render(<PlanNextDialog topicId={topicId} onClose={onClose} />);
  fireEvent.click(screen.getByRole('button', { name: '+1d' }));
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(0, 0, 0, 0);
  expect(useStore.getState().topics[topicId].plannedAt).toBe(tomorrow.getTime());
  expect(onClose).toHaveBeenCalled();
});

it('skip leaves the topic unplanned', () => {
  const onClose = vi.fn();
  render(<PlanNextDialog topicId={topicId} onClose={onClose} />);
  fireEvent.click(screen.getByRole('button', { name: /skip/i }));
  expect(useStore.getState().topics[topicId].plannedAt ?? null).toBeNull();
  expect(onClose).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to verify failure** — `npm test -- PlanNextDialog` → FAIL (module not found).

- [ ] **Step 3: Implement the dialog**

```tsx
'use client';
import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { startOfDay, suggestedNextDate } from '@/lib/revision/engine';

const DAY = 86_400_000;
const fmt = (ts: number) => new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export function PlanNextDialog({ topicId, title = 'Revised · Plan next', onClose }: {
  topicId: string; title?: string; onClose: () => void;
}) {
  const topic = useStore((s) => s.topics[topicId]);
  const planTopic = useStore((s) => s.planTopic);
  const [custom, setCustom] = useState('');
  if (!topic) return null;
  const today = startOfDay(Date.now());
  const suggested = suggestedNextDate(topic.revisionHistory);
  const chips: { label: string; ts: number; hot?: boolean }[] = [
    { label: '+1d', ts: today + DAY },
    { label: '+3d', ts: today + 3 * DAY },
    { label: '+7d', ts: today + 7 * DAY },
  ];
  if (suggested !== undefined) chips.push({ label: `Suggested · ${fmt(suggested)}`, ts: suggested, hot: true });
  const pick = (ts: number) => { planTopic(topic.id, ts); onClose(); };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="glass w-full max-w-sm rounded-xl p-4" onClick={(e) => e.stopPropagation()}>
        <div className="tblabel mb-1">{title}</div>
        <div className="mb-3 text-sm font-medium text-ink">{topic.title}</div>
        <div className="mb-3 flex flex-wrap gap-2">
          {chips.map((c) => (
            <button key={c.label} onClick={() => pick(c.ts)}
              className={`dim-chip transition hover:border-accent hover:text-accent ${c.hot ? 'border-accent/50 bg-accent/10 text-accent' : 'text-ink-dim'}`}>
              {c.label}
            </button>
          ))}
        </div>
        <div className="mb-3 flex items-center gap-2">
          <input type="date" aria-label="Custom date" value={custom} onChange={(e) => setCustom(e.target.value)}
            className="flex-1 rounded-lg border border-line bg-ground-deep px-2 py-1.5 text-sm text-ink outline-none focus:border-accent" />
          <button disabled={!custom} onClick={() => pick(new Date(`${custom}T00:00:00`).getTime())}
            className="dim-chip text-ink-dim transition enabled:hover:border-accent enabled:hover:text-accent disabled:opacity-40">
            Plan
          </button>
        </div>
        <button onClick={onClose} className="tblabel w-full text-center text-ink-faint transition hover:text-ink">
          Skip — leave unplanned
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire the topic page** (`app/topic/[id]/page.tsx`)

Import `useState` (extend the existing react import), `PlanNextDialog`, and the `clearPlan` action. Add state and swap the button block:

```tsx
const clearPlan = useStore((s) => s.clearPlan);
const [planFor, setPlanFor] = useState<null | 'after-revise' | 'schedule'>(null);
```

```tsx
<div className="flex items-center gap-2">
  {topic.plannedAt != null && (
    <span className="dim-chip flex items-center gap-1.5 text-ink-dim">
      Planned · {new Date(topic.plannedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
      <button aria-label="Clear plan" onClick={() => clearPlan(topic.id)} className="transition hover:text-alarm">×</button>
    </span>
  )}
  <button onClick={() => setPlanFor('schedule')}
    className="rounded-xl border border-line px-3 py-2 text-sm text-ink-dim transition hover:border-accent hover:text-accent">
    Schedule
  </button>
  <button onClick={() => { markTopicRevised(topic.id); setPlanFor('after-revise'); }}
    className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500/90 px-4 py-2 text-sm font-medium text-black transition hover:bg-emerald-400 sm:justify-start">
    <CheckCircle2 size={16} /> Mark as Revised
  </button>
</div>
{planFor && (
  <PlanNextDialog topicId={topic.id}
    title={planFor === 'schedule' ? 'Plan revision' : undefined}
    onClose={() => setPlanFor(null)} />
)}
```

- [ ] **Step 5: Wire TodayQueue** (`components/TodayQueue.tsx`)

In the `TodayQueue` component add `const [planFor, setPlanFor] = useState<string | null>(null);` (import `useState`), pass `onRevise={(id) => { markRevised(id); setPlanFor(id); }}` to both `QueueGroup`s, and render before the closing `</section>`:

```tsx
{planFor && <PlanNextDialog topicId={planFor} onClose={() => setPlanFor(null)} />}
```

- [ ] **Step 6: Run tests** — `cd apps/frontend && npx tsc --noEmit && npm test` → PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/components/PlanNextDialog.tsx apps/frontend/components/PlanNextDialog.test.tsx "apps/frontend/app/topic/[id]/page.tsx" apps/frontend/components/TodayQueue.tsx
git commit -m "feat(planning): plan-next dialog after mark-revised; schedule/clear plan on topic page"
```

---

### Task 5: Agenda surfaces unplanned topics

**Files:**
- Modify: `apps/frontend/lib/insights/agenda.ts`
- Modify: `apps/frontend/components/insights/Agenda.tsx`
- Modify: `apps/frontend/components/insights/WeekStrip.tsx`
- Test: `apps/frontend/lib/insights/agenda.test.ts`

**Interfaces:**
- Consumes: plan-aware `nextDueDate(t)` / `badgeState(t, now)`.
- Produces: `AgendaStatus` gains `'unplanned'`; `Agenda` interface gains `unplanned: AgendaTopic[]`.

- [ ] **Step 1: Write the failing tests** (append to `agenda.test.ts`, reusing its fixture helpers)

```ts
it('collects revised-but-unplanned topics into the unplanned bucket', () => {
  // fixture topic: revisionHistory non-empty, plannedAt: null
  const a = buildAgenda(dataWithUnplannedTopic, NOW, 14);
  expect(a.unplanned.map((t) => t.id)).toContain(unplannedTopicId);
  expect(a.days.flatMap((d) => d.topics.map((t) => t.id))).not.toContain(unplannedTopicId);
});

it('a planned never-revised topic appears on its planned day', () => {
  // fixture topic: revisionHistory [], plannedAt: startOfDay(NOW + 2 * DAY)
  const a = buildAgenda(dataWithPlannedNewTopic, NOW, 14);
  const day = a.days.find((d) => d.ts === startOfDay(NOW + 2 * DAY));
  expect(day?.topics.map((t) => t.id)).toContain(plannedNewTopicId);
});
```

- [ ] **Step 2: Run to verify failure** — `npm test -- agenda` → FAIL (`unplanned` missing).

- [ ] **Step 3: Implement in `agenda.ts`**

```ts
export type AgendaStatus = 'overdue' | 'due' | 'completed' | 'unplanned';
...
export interface Agenda {
  overdue: AgendaTopic[];
  unplanned: AgendaTopic[];
  days: AgendaDay[];
}

const RANK: Record<AgendaStatus, number> = { overdue: 0, due: 1, completed: 2, unplanned: 3 };
```

In `buildAgenda`, declare `const unplanned: AgendaTopic[] = [];` beside `overdue`, and replace the due lookup at the end of the loop:

```ts
    const due = nextDueDate(t);
    if (due === undefined) {
      if (t.revisionHistory.length > 0) unplanned.push({ ...base, status: 'unplanned' });
      continue;
    }
    const dueDay = startOfDay(due);
    if (dueDay >= today && dueDay <= horizonEnd) push(dueDay, { ...base, status: 'due' });
```

Return `{ overdue, unplanned, days }`. In `loadByDay`, delete the `if (last === undefined) continue;` guard and guard the completed-today check instead (`if (last !== undefined && startOfDay(last) === today)`) so planned never-revised topics land on the week strip.

- [ ] **Step 4: Render the section** (`Agenda.tsx`)

Extend the three records:

```ts
const TONE: Record<AgendaStatus, string> = {
  overdue: 'var(--alarm)', due: 'var(--annotation)', completed: 'var(--go)', unplanned: 'var(--ink-faint)',
};
// PILL: add   unplanned: 'border-line-strong bg-panel-2 text-ink-dim',
// PILL_LABEL: add   unplanned: 'Unplanned',
```

Where the component renders the Overdue `<Section …>` (below line 100 — mirror its exact props), add directly after it:

```tsx
{agenda.unplanned.length > 0 && (
  <Section id="unplanned" title="Unplanned" dateLabel="needs a date" tone="var(--ink-faint)"
    topics={agenda.unplanned} delay={80} />
)}
```

In `Section`, extend the counts-chip array literal `(['overdue', 'due', 'completed'] as const)` to include `'unplanned'`. In `WeekStrip.tsx`, add the required key to `BAR`: `unplanned: 'var(--ink-faint)',`.

- [ ] **Step 5: Run tests** — `npx tsc --noEmit && npm test` → PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/lib/insights/agenda.ts apps/frontend/lib/insights/agenda.test.ts apps/frontend/components/insights/Agenda.tsx apps/frontend/components/insights/WeekStrip.tsx
git commit -m "feat(agenda): unplanned bucket + planned never-revised topics on their day"
```

---

### Task 6: Plan from the calendar day rail

**Files:**
- Create: `apps/frontend/components/PlanTopicPicker.tsx`
- Modify: `apps/frontend/components/insights/MonthCalendar.tsx`
- Test: `apps/frontend/app/calendar/CalendarPage.test.tsx`

**Interfaces:**
- Consumes: `planTopic` (Task 3), `activeTopics` from `@/lib/insights/topics`.
- Produces: `PlanTopicPicker({ day, onClose }: { day: number; onClose: () => void })`.

- [ ] **Step 1: Write the failing test** (append to `CalendarPage.test.tsx`; switch the page to Month view first via the existing FilterChips interaction pattern)

```tsx
it('plans a topic onto a future day from the day rail', () => {
  render(<CalendarPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Month' }));
  // select tomorrow's cell (aria-current marks today; tomorrow = today's date + 1 label)
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(0, 0, 0, 0);
  fireEvent.click(screen.getByRole('button', { name: String(tomorrow.getDate()) }));
  fireEvent.click(screen.getByRole('button', { name: /\+ plan/i }));
  fireEvent.click(screen.getByText(topicTitle)); // row in the picker
  expect(useStore.getState().topics[topicId].plannedAt).toBe(tomorrow.getTime());
});
```

(If day-cell buttons have no accessible name from the digit alone, give the cell `aria-label={new Date(c.day).toDateString()}` in Step 3 and select by that — pick whichever the existing test file's querying style supports; keep the assertion identical. Note: cells render only the day number as text, so `getByRole('button', { name: String(date) })` may match two cells at month edges — scope with `getAllByRole` + `inMonth` styling or the aria-label variant.)

- [ ] **Step 2: Run to verify failure** — `npm test -- CalendarPage` → FAIL.

- [ ] **Step 3: Implement the picker**

```tsx
'use client';
import { useMemo, useState } from 'react';
import { useStore } from '@/store/useStore';
import { activeTopics } from '@/lib/insights/topics';

export function PlanTopicPicker({ day, onClose }: { day: number; onClose: () => void }) {
  const data = useStore();
  const planTopic = useStore((s) => s.planTopic);
  const [q, setQ] = useState('');
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return activeTopics(data)
      .filter((t) => {
        if (!needle) return true;
        const chapter = data.chapters[t.chapterId];
        const subject = chapter ? data.subjects[chapter.subjectId] : undefined;
        return `${t.title} ${chapter?.name ?? ''} ${subject?.name ?? ''}`.toLowerCase().includes(needle);
      })
      .slice(0, 30);
  }, [data, q]);
  const label = new Date(day).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={`Plan revision on ${label}`} onClick={onClose}>
      <div className="glass flex max-h-[70vh] w-full max-w-md flex-col rounded-xl p-4" onClick={(e) => e.stopPropagation()}>
        <div className="tblabel mb-2">Plan revision · {label}</div>
        <input autoFocus type="text" aria-label="Search topics" placeholder="Search topics…" value={q} onChange={(e) => setQ(e.target.value)}
          className="mb-3 rounded-lg border border-line bg-ground-deep px-2.5 py-1.5 text-sm text-ink outline-none focus:border-accent" />
        <div className="grid gap-1 overflow-y-auto">
          {matches.map((t) => {
            const chapter = data.chapters[t.chapterId];
            const subject = chapter ? data.subjects[chapter.subjectId] : undefined;
            return (
              <button key={t.id} onClick={() => { planTopic(t.id, day); onClose(); }}
                className="rounded-lg px-2.5 py-2 text-left transition hover:bg-accent-soft">
                <span className="block truncate text-sm font-medium text-ink">{t.title}</span>
                <span className="block truncate text-xs text-ink-faint">
                  {subject?.name ?? '—'}{chapter ? ` · ${chapter.name}` : ''}
                  {t.plannedAt != null && ` · planned ${new Date(t.plannedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`}
                </span>
              </button>
            );
          })}
          {matches.length === 0 && <p className="px-2.5 py-2 text-sm text-ink-faint">No matching topics.</p>}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire the day rail** (`MonthCalendar.tsx`)

Add `const [planOpen, setPlanOpen] = useState(false);` and import `PlanTopicPicker`. In the selected-day header (next to the `Today` button):

```tsx
{selected >= todayStart && (
  <button onClick={() => setPlanOpen(true)} className="dim-chip text-ink-dim transition hover:border-accent hover:text-accent">
    + Plan
  </button>
)}
```

and after `{selectedCell && <SelectedDayTopics …/>}`:

```tsx
{planOpen && <PlanTopicPicker day={selected} onClose={() => setPlanOpen(false)} />}
```

- [ ] **Step 5: Run tests** — `npx tsc --noEmit && npm test` → PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/components/PlanTopicPicker.tsx apps/frontend/components/insights/MonthCalendar.tsx apps/frontend/app/calendar/CalendarPage.test.tsx
git commit -m "feat(calendar): + Plan on the day rail — search-and-pick a topic onto a date"
```

---

### Task 7: Subject-level bulk planning

**Files:**
- Create: `apps/frontend/components/PlanSubjectDialog.tsx`
- Modify: `apps/frontend/app/subject/[id]/page.tsx`
- Test: `apps/frontend/components/PlanSubjectDialog.test.tsx`

**Interfaces:**
- Consumes: `planTopics` (Task 3), `badgeState(t, now)`.
- Produces: `PlanSubjectDialog({ subjectId, onClose }: { subjectId: string; onClose: () => void })`.

- [ ] **Step 1: Write the failing test**

```tsx
// Seed a subject with two topics: one never revised, one already planned.
it('defaults unplanned/never-revised topics checked and plans them on confirm', () => {
  render(<PlanSubjectDialog subjectId={subjectId} onClose={vi.fn()} />);
  expect(screen.getByRole('checkbox', { name: newTopicTitle })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: plannedTopicTitle })).not.toBeChecked();
  const date = new Date(); date.setDate(date.getDate() + 2);
  fireEvent.change(screen.getByLabelText('Revision date'), { target: { value: date.toISOString().slice(0, 10) } });
  fireEvent.click(screen.getByRole('button', { name: /plan \d+ topic/i }));
  date.setHours(0, 0, 0, 0);
  expect(useStore.getState().topics[newTopicId].plannedAt).toBe(date.getTime());
});
```

- [ ] **Step 2: Run to verify failure** — `npm test -- PlanSubjectDialog` → FAIL.

- [ ] **Step 3: Implement the dialog**

```tsx
'use client';
import { useMemo, useState } from 'react';
import { useStore } from '@/store/useStore';
import { badgeState } from '@/lib/revision/engine';

function tomorrowISO(): string {
  const d = new Date(); d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function PlanSubjectDialog({ subjectId, onClose }: { subjectId: string; onClose: () => void }) {
  const subjects = useStore((s) => s.subjects);
  const chapters = useStore((s) => s.chapters);
  const topics = useStore((s) => s.topics);
  const planTopics = useStore((s) => s.planTopics);
  const [date, setDate] = useState(tomorrowISO());

  const rows = useMemo(() => {
    const subject = subjects[subjectId];
    if (!subject) return [];
    const now = Date.now();
    return subject.chapterIds
      .map((cid) => chapters[cid])
      .filter((c) => c && !c.archivedAt)
      .flatMap((c) => c.topicIds
        .map((tid) => topics[tid])
        .filter((t) => t && !t.archivedAt)
        .map((t) => {
          const state = badgeState(t, now);
          return { topic: t, chapter: c, defaultChecked: state === 'Unplanned' || state === 'NeverRevised' };
        }));
  }, [subjects, chapters, topics, subjectId]);

  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(rows.filter((r) => r.defaultChecked).map((r) => r.topic.id)),
  );
  const toggle = (id: string) => setChecked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const confirm = () => {
    planTopics([...checked], new Date(`${date}T00:00:00`).getTime());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Plan subject revision" onClick={onClose}>
      <div className="glass flex max-h-[70vh] w-full max-w-md flex-col rounded-xl p-4" onClick={(e) => e.stopPropagation()}>
        <div className="tblabel mb-2">Plan revision · {subjects[subjectId]?.name}</div>
        <label className="mb-3 flex items-center gap-2 text-sm text-ink-dim">
          <span className="tblabel">Revision date</span>
          <input type="date" aria-label="Revision date" value={date} onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-line bg-ground-deep px-2 py-1.5 text-sm text-ink outline-none focus:border-accent" />
        </label>
        <div className="grid gap-1 overflow-y-auto">
          {rows.map(({ topic, chapter }) => (
            <label key={topic.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition hover:bg-accent-soft">
              <input type="checkbox" aria-label={topic.title} checked={checked.has(topic.id)} onChange={() => toggle(topic.id)}
                className="accent-[var(--accent)]" />
              <span className="min-w-0">
                <span className="block truncate text-sm text-ink">{topic.title}</span>
                <span className="block truncate text-xs text-ink-faint">{chapter.name}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="mt-3 flex justify-end gap-2 border-t border-line pt-3">
          <button onClick={onClose} className="dim-chip text-ink-dim transition hover:text-ink">Cancel</button>
          <button disabled={checked.size === 0} onClick={confirm}
            className="dim-chip border-accent/50 bg-accent/10 text-accent transition enabled:hover:border-accent disabled:opacity-40">
            Plan {checked.size} topic{checked.size === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire the subject page** (`app/subject/[id]/page.tsx`)

Add `const [planOpen, setPlanOpen] = useState(false);`, import `PlanSubjectDialog`, and in the header row next to `<AddButton …>`:

```tsx
<div className="flex items-center gap-2">
  <button onClick={() => setPlanOpen(true)}
    className="rounded-xl border border-line px-3 py-2 text-sm text-ink-dim transition hover:border-accent hover:text-accent">
    Plan revision
  </button>
  <AddButton label="Chapter" onAdd={(name) => setJustAddedId(addChapter(id, name))} />
</div>
{planOpen && <PlanSubjectDialog subjectId={id} onClose={() => setPlanOpen(false)} />}
```

- [ ] **Step 5: Run tests** — `npx tsc --noEmit && npm test` → PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/components/PlanSubjectDialog.tsx apps/frontend/components/PlanSubjectDialog.test.tsx "apps/frontend/app/subject/[id]/page.tsx"
git commit -m "feat(subject): bulk Plan revision — date + topic multi-select"
```

---

### Task 8: Full verification, docs, ship

- [ ] **Step 1: Full monorepo verification** (all must pass — evidence before claims)

```bash
cd /home/subaru/projects/revision_app/packages/shared && npm test
cd /home/subaru/projects/revision_app/services/content-service && npx tsc --noEmit && npm test
cd /home/subaru/projects/revision_app/apps/frontend && npx tsc --noEmit && npm test && npm run build
```

- [ ] **Step 2: Manual smoke via the running app** (rebuild + drive): `docker compose build app && docker compose up -d` from the repo root, then verify against `http://127.0.0.1:<app port from docker ps>` — log in as the demo user; confirm (a) existing topics still show due dates (migration), (b) Mark as Revised opens the plan-next dialog and Skip yields an UNPLANNED badge, (c) calendar "+ Plan" places a topic on a future day, (d) subject "Plan revision" bulk-stamps topics.

- [ ] **Step 3: Update `docs/future-improvements.md`** — item 2 status line becomes `**Status:** implemented 2026-07-29 (see docs/superpowers/plans/2026-07-29-manual-first-planning.md)`.

- [ ] **Step 4: Final commit**

```bash
git add docs/future-improvements.md docs/superpowers/plans/2026-07-29-manual-first-planning.md
git commit -m "docs: manual-first planning plan + mark future-improvement item implemented"
```
