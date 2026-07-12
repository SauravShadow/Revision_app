# Phase 1: CE ESE Revision Manager — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the walking-skeleton revision manager: navigate Subjects → Chapters → Topics, write markdown notes, and track a timestamped revision history with fixed-interval due badges — all persisted in LocalStorage.

**Architecture:** Next.js App Router SPA. A pure, framework-free revision engine (`lib/revision/`) holds all correctness-critical math and is fully unit-tested. All persistence goes through a `RevisionRepository` interface (Phase 1: `LocalStorageRepository`, snapshot load/save) so a future Supabase backend is a drop-in. A single Zustand store holds normalized in-memory state and is the only caller of the repository.

**Tech Stack:** Next.js (App Router) + TypeScript, TailwindCSS, shadcn/ui, Framer Motion, lucide-react, Zustand, react-markdown, Vitest + @testing-library/react.

## Global Constraints

- **Node:** 18.18+ (Next.js 15 floor).
- **Next.js 15 / React 19:** route `params` are a `Promise` and are unwrapped with React's `use()` inside client page components — every `app/**/page.tsx` follows this pattern.
- **Package manager:** npm.
- **All persistence via `RevisionRepository`** — no component or store touches `localStorage` directly except `LocalStorageRepository`.
- **Revision math lives only in `lib/revision/`** — pure functions, no React/store imports. All time inputs passed in as `now: number` (epoch ms); never call `Date.now()` inside pure functions (keeps them deterministic/testable).
- **IDs** via `makeId()` (`lib/domain/id.ts`), never inline `crypto.randomUUID()`.
- **Ladder (days):** `[1, 3, 7, 16, 35, 60, 90]`, clamped to last element.
- **Store simplification (Phase 1):** one cohesive `store/useStore.ts` instead of separate slices; split into slices in Phase 2 when undo/redo + filters land.
- **Repository simplification (Phase 1):** snapshot `load()`/`save(AppData)` rather than granular methods; granular methods arrive with the Supabase backend. The store-never-touches-storage-directly property still holds.

---

### Task 1: Project scaffold + test harness

**Files:**
- Create: project via `create-next-app` at repo root (already contains `README.md`, `docs/`).
- Create: `vitest.config.ts`, `vitest.setup.ts`
- Modify: `package.json` (scripts, deps)

**Interfaces:**
- Produces: a runnable Next.js app (`npm run dev`) and a working test command (`npm test`).

- [ ] **Step 1: Scaffold Next.js into the current directory**

The repo root already holds `README.md` and `docs/`. Scaffold in place (keep `README.md` and `docs/`):

```bash
npx create-next-app@latest . --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*"
```

Notes for any interactive prompts: if asked about Turbopack, choose **No**; if asked about a non-empty directory, **proceed** (it will not delete `docs/`; if it offers to overwrite `README.md`, decline). This pulls Next.js 15 + React 19 + Tailwind v4. The plan avoids depending on a `tailwind.config` file or the typography plugin, so Tailwind v4's CSS-first setup needs no extra changes.

- [ ] **Step 2: Install runtime + test dependencies**

```bash
npm install zustand framer-motion lucide-react react-markdown remark-gfm
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 3: Add Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
});
```

Create `vitest.setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 4: Add test script**

In `package.json`, add to `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Smoke test the harness**

Create `lib/__smoke__.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
describe('harness', () => {
  it('runs', () => { expect(1 + 1).toBe(2); });
});
```

Run: `npm test`
Expected: PASS (1 test). Then delete `lib/__smoke__.test.ts`.

- [ ] **Step 6: Verify dev server boots**

Run: `npm run build`
Expected: build completes with no type errors.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "chore: scaffold Next.js app with Vitest harness"
```

---

### Task 2: Domain types + id helper

**Files:**
- Create: `lib/domain/types.ts`
- Create: `lib/domain/id.ts`
- Test: `lib/domain/id.test.ts`

**Interfaces:**
- Produces:
  - `type Difficulty = 'Easy' | 'Medium' | 'Hard'`
  - `type Priority = 'Low' | 'Medium' | 'High'`
  - `interface Revision { id: string; timestamp: number }`
  - `interface Subject { id: string; name: string; color: string; icon: string; order: number; chapterIds: string[] }`
  - `interface Chapter { id: string; subjectId: string; name: string; order: number; difficulty: Difficulty; priority: Priority; topicIds: string[] }`
  - `interface Topic { id: string; chapterId: string; title: string; notes: string; order: number; difficulty: Difficulty; priority: Priority; revisionHistory: Revision[]; createdAt: number; updatedAt: number }`
  - `interface AppData { subjects: Record<string, Subject>; chapters: Record<string, Chapter>; topics: Record<string, Topic>; subjectOrder: string[] }`
  - `makeId(): string`

- [ ] **Step 1: Write the failing test**

Create `lib/domain/id.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { makeId } from './id';

describe('makeId', () => {
  it('returns a non-empty string', () => {
    expect(typeof makeId()).toBe('string');
    expect(makeId().length).toBeGreaterThan(0);
  });
  it('returns unique values', () => {
    expect(makeId()).not.toBe(makeId());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/domain/id.test.ts`
Expected: FAIL (cannot find module './id').

- [ ] **Step 3: Write the types and id helper**

Create `lib/domain/id.ts`:

```ts
export function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
```

Create `lib/domain/types.ts`:

```ts
export type Difficulty = 'Easy' | 'Medium' | 'Hard';
export type Priority = 'Low' | 'Medium' | 'High';

export interface Revision {
  id: string;
  timestamp: number; // epoch ms
}

export interface Subject {
  id: string;
  name: string;
  color: string;
  icon: string;
  order: number;
  chapterIds: string[];
}

export interface Chapter {
  id: string;
  subjectId: string;
  name: string;
  order: number;
  difficulty: Difficulty;
  priority: Priority;
  topicIds: string[];
}

export interface Topic {
  id: string;
  chapterId: string;
  title: string;
  notes: string; // markdown
  order: number;
  difficulty: Difficulty;
  priority: Priority;
  revisionHistory: Revision[];
  createdAt: number;
  updatedAt: number;
}

export interface AppData {
  subjects: Record<string, Subject>;
  chapters: Record<string, Chapter>;
  topics: Record<string, Topic>;
  subjectOrder: string[];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/domain/id.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/domain && git commit -m "feat: add domain types and id helper"
```

---

### Task 3: Revision engine (pure functions)

**Files:**
- Create: `lib/revision/ladder.ts`
- Create: `lib/revision/engine.ts`
- Test: `lib/revision/ladder.test.ts`, `lib/revision/engine.test.ts`

**Interfaces:**
- Consumes: `Revision`, `Topic` from `@/lib/domain/types`; `makeId` from `@/lib/domain/id`.
- Produces:
  - `LADDER: readonly number[]`, `nextInterval(revisionCount: number): number`
  - `totalRevisions(h: Revision[]): number`
  - `lastRevisedAt(h: Revision[]): number | undefined`
  - `nextDueDate(h: Revision[]): number | undefined`
  - `daysSince(h: Revision[], now: number): number | undefined`
  - `type BadgeState = 'NeverRevised' | 'Overdue' | 'DueToday' | 'DueTomorrow' | 'RecentlyRevised' | 'Upcoming'`
  - `badgeState(h: Revision[], now: number): BadgeState`
  - `relativeLabel(ts: number, now: number): string`
  - `inGoodStanding(h: Revision[], now: number): boolean`
  - `markRevised(topic: Topic, now: number): Topic`

- [ ] **Step 1: Write the failing ladder test**

Create `lib/revision/ladder.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { LADDER, nextInterval } from './ladder';

describe('nextInterval', () => {
  it('returns first step for a never-revised topic', () => {
    expect(nextInterval(0)).toBe(1);
  });
  it('walks the ladder by revision count', () => {
    expect(nextInterval(1)).toBe(1);
    expect(nextInterval(2)).toBe(3);
    expect(nextInterval(3)).toBe(7);
  });
  it('clamps to the last ladder step', () => {
    expect(nextInterval(999)).toBe(LADDER[LADDER.length - 1]);
    expect(nextInterval(999)).toBe(90);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/revision/ladder.test.ts`
Expected: FAIL (cannot find module './ladder').

- [ ] **Step 3: Implement the ladder**

Create `lib/revision/ladder.ts`:

```ts
export const LADDER: readonly number[] = [1, 3, 7, 16, 35, 60, 90];

export function nextInterval(revisionCount: number): number {
  if (revisionCount <= 0) return LADDER[0];
  const idx = Math.min(revisionCount - 1, LADDER.length - 1);
  return LADDER[idx];
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/revision/ladder.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing engine test**

Create `lib/revision/engine.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  totalRevisions, lastRevisedAt, nextDueDate, daysSince,
  badgeState, relativeLabel, inGoodStanding, markRevised,
} from './engine';
import type { Topic, Revision } from '@/lib/domain/types';

const DAY = 24 * 60 * 60 * 1000;
const at = (isoDay: string) => new Date(isoDay + 'T12:00:00Z').getTime();
const rev = (ts: number): Revision => ({ id: 'r', timestamp: ts });

const baseTopic = (history: Revision[]): Topic => ({
  id: 't', chapterId: 'c', title: 'X', notes: '', order: 0,
  difficulty: 'Medium', priority: 'Medium',
  revisionHistory: history, createdAt: 0, updatedAt: 0,
});

describe('engine counts', () => {
  it('totalRevisions and lastRevisedAt', () => {
    expect(totalRevisions([])).toBe(0);
    expect(lastRevisedAt([])).toBeUndefined();
    const h = [rev(100), rev(200)];
    expect(totalRevisions(h)).toBe(2);
    expect(lastRevisedAt(h)).toBe(200);
  });
});

describe('nextDueDate', () => {
  it('is undefined when never revised', () => {
    expect(nextDueDate([])).toBeUndefined();
  });
  it('adds the ladder interval after the last revision', () => {
    const now = at('2026-07-01');
    expect(nextDueDate([rev(now)])).toBe(now + 1 * DAY); // 1 revision -> 1 day
    expect(nextDueDate([rev(now), rev(now)])).toBe(now + 3 * DAY); // 2 -> 3 days
  });
});

describe('daysSince', () => {
  it('is undefined when never revised', () => {
    expect(daysSince([], at('2026-07-05'))).toBeUndefined();
  });
  it('counts whole days since last revision', () => {
    const last = at('2026-07-01');
    expect(daysSince([rev(last)], last + 3 * DAY)).toBe(3);
  });
});

describe('badgeState', () => {
  it('NeverRevised for empty history', () => {
    expect(badgeState([], at('2026-07-05'))).toBe('NeverRevised');
  });
  it('RecentlyRevised right after revising', () => {
    const now = at('2026-07-05');
    expect(badgeState([rev(now)], now)).toBe('RecentlyRevised');
  });
  it('DueToday when the due date is today', () => {
    const last = at('2026-07-01');           // 1 revision -> due +1 day
    expect(badgeState([rev(last)], at('2026-07-02'))).toBe('DueToday');
  });
  it('Overdue when past the due date', () => {
    const last = at('2026-07-01');
    expect(badgeState([rev(last)], at('2026-07-10'))).toBe('Overdue');
  });
  it('DueTomorrow one day before due', () => {
    const last = at('2026-07-01');           // 2 revisions -> due +3 days = Jul 4
    expect(badgeState([rev(last), rev(last)], at('2026-07-03'))).toBe('DueTomorrow');
  });
});

describe('relativeLabel', () => {
  it('Today / Yesterday / N days ago', () => {
    const now = at('2026-07-10');
    expect(relativeLabel(now, now)).toBe('Today');
    expect(relativeLabel(now - 1 * DAY, now)).toBe('Yesterday');
    expect(relativeLabel(now - 3 * DAY, now)).toBe('3 days ago');
    expect(relativeLabel(now - 8 * DAY, now)).toBe('1 week ago');
  });
});

describe('inGoodStanding', () => {
  it('false when overdue, due today, or never revised', () => {
    const last = at('2026-07-01');
    expect(inGoodStanding([], at('2026-07-05'))).toBe(false);
    expect(inGoodStanding([rev(last)], at('2026-07-10'))).toBe(false);
    expect(inGoodStanding([rev(last)], at('2026-07-01'))).toBe(true);
  });
});

describe('markRevised', () => {
  it('appends a revision and bumps updatedAt without mutating input', () => {
    const now = at('2026-07-05');
    const t = baseTopic([]);
    const next = markRevised(t, now);
    expect(t.revisionHistory).toHaveLength(0);      // input untouched
    expect(next.revisionHistory).toHaveLength(1);
    expect(next.revisionHistory[0].timestamp).toBe(now);
    expect(next.updatedAt).toBe(now);
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run lib/revision/engine.test.ts`
Expected: FAIL (cannot find module './engine').

- [ ] **Step 7: Implement the engine**

Create `lib/revision/engine.ts`:

```ts
import type { Revision, Topic } from '@/lib/domain/types';
import { makeId } from '@/lib/domain/id';
import { nextInterval } from './ladder';

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function totalRevisions(h: Revision[]): number {
  return h.length;
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

export function relativeLabel(ts: number, now: number): string {
  const days = Math.floor((startOfDay(now) - startOfDay(ts)) / DAY_MS);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return '1 week ago';
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 60) return '1 month ago';
  return `${Math.floor(days / 30)} months ago`;
}

export function inGoodStanding(h: Revision[], now: number): boolean {
  const s = badgeState(h, now);
  return s !== 'Overdue' && s !== 'DueToday' && s !== 'NeverRevised';
}

export function markRevised(topic: Topic, now: number): Topic {
  const revision: Revision = { id: makeId(), timestamp: now };
  return {
    ...topic,
    revisionHistory: [...topic.revisionHistory, revision],
    updatedAt: now,
  };
}
```

Note on ordering: `RecentlyRevised` is checked before `DueTomorrow` so a topic revised today whose next due is tomorrow reads as "recently revised" rather than "due tomorrow."

- [ ] **Step 8: Run to verify all pass**

Run: `npx vitest run lib/revision`
Expected: PASS (all ladder + engine tests).

- [ ] **Step 9: Commit**

```bash
git add lib/revision && git commit -m "feat: add pure spaced-repetition revision engine"
```

---

### Task 4: Repository + seed data

**Files:**
- Create: `lib/repository/RevisionRepository.ts`
- Create: `lib/repository/seed.ts`
- Create: `lib/repository/LocalStorageRepository.ts`
- Test: `lib/repository/LocalStorageRepository.test.ts`, `lib/repository/seed.test.ts`

**Interfaces:**
- Consumes: `AppData`, `Subject` from `@/lib/domain/types`; `makeId`.
- Produces:
  - `interface RevisionRepository { load(): Promise<AppData | null>; save(data: AppData): Promise<void> }`
  - `seedData(): AppData` (13 subjects, empty chapters/topics)
  - `class LocalStorageRepository implements RevisionRepository`
  - `STORAGE_KEY = 'ce-revision:v1'`

- [ ] **Step 1: Write the failing seed test**

Create `lib/repository/seed.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { seedData } from './seed';

describe('seedData', () => {
  it('creates 13 subjects with matching subjectOrder', () => {
    const data = seedData();
    expect(data.subjectOrder).toHaveLength(13);
    expect(Object.keys(data.subjects)).toHaveLength(13);
    for (const id of data.subjectOrder) {
      expect(data.subjects[id]).toBeDefined();
    }
  });
  it('starts with no chapters or topics', () => {
    const data = seedData();
    expect(Object.keys(data.chapters)).toHaveLength(0);
    expect(Object.keys(data.topics)).toHaveLength(0);
  });
  it('includes Fluid Mechanics', () => {
    const data = seedData();
    const names = Object.values(data.subjects).map((s) => s.name);
    expect(names).toContain('Fluid Mechanics');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/repository/seed.test.ts`
Expected: FAIL (cannot find module './seed').

- [ ] **Step 3: Implement seed**

Create `lib/repository/seed.ts`:

```ts
import type { AppData, Subject } from '@/lib/domain/types';
import { makeId } from '@/lib/domain/id';

const SUBJECTS: { name: string; color: string; icon: string }[] = [
  { name: 'Engineering Mathematics', color: '#6366f1', icon: 'Sigma' },
  { name: 'Strength of Materials', color: '#ef4444', icon: 'Dumbbell' },
  { name: 'Structural Analysis', color: '#f97316', icon: 'Building2' },
  { name: 'RCC', color: '#eab308', icon: 'Boxes' },
  { name: 'Steel Structures', color: '#64748b', icon: 'Frame' },
  { name: 'Fluid Mechanics', color: '#06b6d4', icon: 'Droplets' },
  { name: 'Hydrology', color: '#0ea5e9', icon: 'CloudRain' },
  { name: 'Hydraulics', color: '#3b82f6', icon: 'Waves' },
  { name: 'Transportation', color: '#22c55e', icon: 'TrafficCone' },
  { name: 'Geotechnical', color: '#a16207', icon: 'Mountain' },
  { name: 'Environmental', color: '#10b981', icon: 'Leaf' },
  { name: 'Construction Management', color: '#8b5cf6', icon: 'HardHat' },
  { name: 'Current Affairs', color: '#ec4899', icon: 'Newspaper' },
];

export function seedData(): AppData {
  const subjects: Record<string, Subject> = {};
  const subjectOrder: string[] = [];
  SUBJECTS.forEach((s, i) => {
    const id = makeId();
    subjects[id] = { id, name: s.name, color: s.color, icon: s.icon, order: i, chapterIds: [] };
    subjectOrder.push(id);
  });
  return { subjects, chapters: {}, topics: {}, subjectOrder };
}
```

- [ ] **Step 4: Run to verify seed passes**

Run: `npx vitest run lib/repository/seed.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing repository test**

Create `lib/repository/LocalStorageRepository.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { LocalStorageRepository, STORAGE_KEY } from './LocalStorageRepository';
import { seedData } from './seed';

describe('LocalStorageRepository', () => {
  beforeEach(() => window.localStorage.clear());

  it('returns null before anything is saved', async () => {
    const repo = new LocalStorageRepository();
    expect(await repo.load()).toBeNull();
  });

  it('round-trips saved data', async () => {
    const repo = new LocalStorageRepository();
    const data = seedData();
    await repo.save(data);
    const loaded = await repo.load();
    expect(loaded).toEqual(data);
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it('preserves subjectOrder exactly', async () => {
    const repo = new LocalStorageRepository();
    const data = seedData();
    await repo.save(data);
    const loaded = await repo.load();
    expect(loaded!.subjectOrder).toEqual(data.subjectOrder);
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run lib/repository/LocalStorageRepository.test.ts`
Expected: FAIL (cannot find module './LocalStorageRepository').

- [ ] **Step 7: Implement the repository**

Create `lib/repository/RevisionRepository.ts`:

```ts
import type { AppData } from '@/lib/domain/types';

export interface RevisionRepository {
  load(): Promise<AppData | null>;
  save(data: AppData): Promise<void>;
}
```

Create `lib/repository/LocalStorageRepository.ts`:

```ts
import type { AppData } from '@/lib/domain/types';
import type { RevisionRepository } from './RevisionRepository';

export const STORAGE_KEY = 'ce-revision:v1';

export class LocalStorageRepository implements RevisionRepository {
  async load(): Promise<AppData | null> {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AppData;
    } catch {
      return null;
    }
  }

  async save(data: AppData): Promise<void> {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }
}
```

- [ ] **Step 8: Run to verify all repository tests pass**

Run: `npx vitest run lib/repository`
Expected: PASS (seed + repository tests).

- [ ] **Step 9: Commit**

```bash
git add lib/repository && git commit -m "feat: add revision repository, localStorage impl, and seed data"
```

---

### Task 5: Zustand store + progress selectors

**Files:**
- Create: `store/useStore.ts`
- Create: `lib/revision/progress.ts`
- Test: `store/useStore.test.ts`, `lib/revision/progress.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–4; `badgeState`, `inGoodStanding`, `markRevised` from engine.
- Produces (store hook `useStore` with state `AppData` plus actions):
  - `hydrate(): Promise<void>` — load from repo, else seed + save.
  - `addSubject(name: string): string`
  - `renameSubject(id, name)`, `deleteSubject(id)`
  - `addChapter(subjectId, name): string`, `renameChapter(id, name)`, `deleteChapter(id)`, `duplicateChapter(id): string`
  - `addTopic(chapterId, title): string`, `renameTopic(id, title)`, `deleteTopic(id)`, `updateTopicNotes(id, notes)`
  - `markTopicRevised(id)`
- Produces (progress, pure): `chapterProgress(data, chapterId, now): number` (0–100), `subjectProgress(data, subjectId, now): number`, `subjectStats(data, subjectId, now): { chapterCount; pending; lastRevised: number | undefined }`.

- [ ] **Step 1: Write the failing progress test**

Create `lib/revision/progress.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { chapterProgress, subjectProgress } from './progress';
import type { AppData } from '@/lib/domain/types';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-07-10T12:00:00Z').getTime();

function fixture(): AppData {
  return {
    subjectOrder: ['s1'],
    subjects: { s1: { id: 's1', name: 'S', color: '#000', icon: 'X', order: 0, chapterIds: ['c1'] } },
    chapters: { c1: { id: 'c1', subjectId: 's1', name: 'C', order: 0, difficulty: 'Medium', priority: 'Medium', topicIds: ['t1', 't2'] } },
    topics: {
      t1: { id: 't1', chapterId: 'c1', title: 'A', notes: '', order: 0, difficulty: 'Medium', priority: 'Medium', revisionHistory: [{ id: 'r', timestamp: now }], createdAt: 0, updatedAt: now },
      t2: { id: 't2', chapterId: 'c1', title: 'B', notes: '', order: 1, difficulty: 'Medium', priority: 'Medium', revisionHistory: [], createdAt: 0, updatedAt: 0 },
    },
  };
}

describe('progress', () => {
  it('chapterProgress = % of topics in good standing', () => {
    // t1 revised now (good), t2 never revised (not good) -> 50%
    expect(chapterProgress(fixture(), 'c1', now)).toBe(50);
  });
  it('empty chapter is 0%', () => {
    const data = fixture();
    data.chapters.c1.topicIds = [];
    expect(chapterProgress(data, 'c1', now)).toBe(0);
  });
  it('subjectProgress averages its chapters', () => {
    expect(subjectProgress(fixture(), 's1', now)).toBe(50);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/revision/progress.test.ts`
Expected: FAIL (cannot find module './progress').

- [ ] **Step 3: Implement progress selectors**

Create `lib/revision/progress.ts`:

```ts
import type { AppData } from '@/lib/domain/types';
import { inGoodStanding, lastRevisedAt } from './engine';

export function chapterProgress(data: AppData, chapterId: string, now: number): number {
  const chapter = data.chapters[chapterId];
  if (!chapter || chapter.topicIds.length === 0) return 0;
  const good = chapter.topicIds.filter((tid) => {
    const t = data.topics[tid];
    return t && inGoodStanding(t.revisionHistory, now);
  }).length;
  return Math.round((good / chapter.topicIds.length) * 100);
}

export function subjectProgress(data: AppData, subjectId: string, now: number): number {
  const subject = data.subjects[subjectId];
  if (!subject || subject.chapterIds.length === 0) return 0;
  const total = subject.chapterIds.reduce((sum, cid) => sum + chapterProgress(data, cid, now), 0);
  return Math.round(total / subject.chapterIds.length);
}

export function subjectStats(
  data: AppData, subjectId: string, now: number,
): { chapterCount: number; pending: number; lastRevised: number | undefined } {
  const subject = data.subjects[subjectId];
  if (!subject) return { chapterCount: 0, pending: 0, lastRevised: undefined };
  let pending = 0;
  let lastRevised: number | undefined;
  for (const cid of subject.chapterIds) {
    const chapter = data.chapters[cid];
    if (!chapter) continue;
    for (const tid of chapter.topicIds) {
      const t = data.topics[tid];
      if (!t) continue;
      if (!inGoodStanding(t.revisionHistory, now)) pending += 1;
      const lr = lastRevisedAt(t.revisionHistory);
      if (lr !== undefined && (lastRevised === undefined || lr > lastRevised)) lastRevised = lr;
    }
  }
  return { chapterCount: subject.chapterIds.length, pending, lastRevised };
}
```

- [ ] **Step 4: Run to verify progress passes**

Run: `npx vitest run lib/revision/progress.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing store test**

Create `store/useStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from './useStore';

function reset() {
  window.localStorage.clear();
  useStore.setState({ subjects: {}, chapters: {}, topics: {}, subjectOrder: [] });
}

describe('useStore', () => {
  beforeEach(reset);

  it('hydrate seeds 13 subjects on first run', async () => {
    await useStore.getState().hydrate();
    expect(useStore.getState().subjectOrder).toHaveLength(13);
  });

  it('adds a chapter under a subject', async () => {
    await useStore.getState().hydrate();
    const subjectId = useStore.getState().subjectOrder[0];
    const chapterId = useStore.getState().addChapter(subjectId, 'Flow through Pipes');
    const state = useStore.getState();
    expect(state.chapters[chapterId].name).toBe('Flow through Pipes');
    expect(state.subjects[subjectId].chapterIds).toContain(chapterId);
  });

  it('adds a topic and marks it revised', () => {
    const subjectId = useStore.getState().addSubject('S');
    const chapterId = useStore.getState().addChapter(subjectId, 'C');
    const topicId = useStore.getState().addTopic(chapterId, 'Bernoulli');
    useStore.getState().markTopicRevised(topicId);
    expect(useStore.getState().topics[topicId].revisionHistory).toHaveLength(1);
  });

  it('deleteChapter removes its topics and detaches from subject', () => {
    const subjectId = useStore.getState().addSubject('S');
    const chapterId = useStore.getState().addChapter(subjectId, 'C');
    const topicId = useStore.getState().addTopic(chapterId, 'T');
    useStore.getState().deleteChapter(chapterId);
    const state = useStore.getState();
    expect(state.chapters[chapterId]).toBeUndefined();
    expect(state.topics[topicId]).toBeUndefined();
    expect(state.subjects[subjectId].chapterIds).not.toContain(chapterId);
  });

  it('duplicateChapter copies chapter and its topics with fresh ids', () => {
    const subjectId = useStore.getState().addSubject('S');
    const chapterId = useStore.getState().addChapter(subjectId, 'C');
    useStore.getState().addTopic(chapterId, 'T');
    const copyId = useStore.getState().duplicateChapter(chapterId);
    const state = useStore.getState();
    expect(copyId).not.toBe(chapterId);
    expect(state.chapters[copyId].topicIds).toHaveLength(1);
    expect(state.chapters[copyId].topicIds[0]).not.toBe(state.chapters[chapterId].topicIds[0]);
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run store/useStore.test.ts`
Expected: FAIL (cannot find module './useStore').

- [ ] **Step 7: Implement the store**

Create `store/useStore.ts`:

```ts
import { create } from 'zustand';
import type { AppData, Chapter, Subject, Topic } from '@/lib/domain/types';
import { makeId } from '@/lib/domain/id';
import { markRevised } from '@/lib/revision/engine';
import { LocalStorageRepository } from '@/lib/repository/LocalStorageRepository';
import { seedData } from '@/lib/repository/seed';

const repo = new LocalStorageRepository();

interface StoreState extends AppData {
  hydrate: () => Promise<void>;
  addSubject: (name: string) => string;
  renameSubject: (id: string, name: string) => void;
  deleteSubject: (id: string) => void;
  addChapter: (subjectId: string, name: string) => string;
  renameChapter: (id: string, name: string) => void;
  deleteChapter: (id: string) => void;
  duplicateChapter: (id: string) => string;
  addTopic: (chapterId: string, title: string) => string;
  renameTopic: (id: string, title: string) => void;
  deleteTopic: (id: string) => void;
  updateTopicNotes: (id: string, notes: string) => void;
  markTopicRevised: (id: string) => void;
}

function snapshot(s: StoreState): AppData {
  return { subjects: s.subjects, chapters: s.chapters, topics: s.topics, subjectOrder: s.subjectOrder };
}

export const useStore = create<StoreState>((set, get) => {
  // persist after every mutation
  const persist = () => { void repo.save(snapshot(get())); };
  const commit = (patch: Partial<AppData>) => { set(patch as never); persist(); };

  return {
    subjects: {}, chapters: {}, topics: {}, subjectOrder: [],

    hydrate: async () => {
      const loaded = await repo.load();
      if (loaded) { set(loaded as never); return; }
      const seeded = seedData();
      set(seeded as never);
      await repo.save(seeded);
    },

    addSubject: (name) => {
      const id = makeId();
      const s = get();
      const subject: Subject = { id, name, color: '#6366f1', icon: 'BookOpen', order: s.subjectOrder.length, chapterIds: [] };
      commit({ subjects: { ...s.subjects, [id]: subject }, subjectOrder: [...s.subjectOrder, id] });
      return id;
    },

    renameSubject: (id, name) => {
      const s = get();
      if (!s.subjects[id]) return;
      commit({ subjects: { ...s.subjects, [id]: { ...s.subjects[id], name } } });
    },

    deleteSubject: (id) => {
      const s = get();
      const subject = s.subjects[id];
      if (!subject) return;
      const subjects = { ...s.subjects }; delete subjects[id];
      const chapters = { ...s.chapters };
      const topics = { ...s.topics };
      for (const cid of subject.chapterIds) {
        const chapter = chapters[cid];
        if (chapter) chapter.topicIds.forEach((tid) => delete topics[tid]);
        delete chapters[cid];
      }
      commit({ subjects, chapters, topics, subjectOrder: s.subjectOrder.filter((x) => x !== id) });
    },

    addChapter: (subjectId, name) => {
      const id = makeId();
      const s = get();
      const subject = s.subjects[subjectId];
      if (!subject) return id;
      const chapter: Chapter = { id, subjectId, name, order: subject.chapterIds.length, difficulty: 'Medium', priority: 'Medium', topicIds: [] };
      commit({
        chapters: { ...s.chapters, [id]: chapter },
        subjects: { ...s.subjects, [subjectId]: { ...subject, chapterIds: [...subject.chapterIds, id] } },
      });
      return id;
    },

    renameChapter: (id, name) => {
      const s = get();
      if (!s.chapters[id]) return;
      commit({ chapters: { ...s.chapters, [id]: { ...s.chapters[id], name } } });
    },

    deleteChapter: (id) => {
      const s = get();
      const chapter = s.chapters[id];
      if (!chapter) return;
      const chapters = { ...s.chapters }; delete chapters[id];
      const topics = { ...s.topics };
      chapter.topicIds.forEach((tid) => delete topics[tid]);
      const subject = s.subjects[chapter.subjectId];
      const subjects = subject
        ? { ...s.subjects, [subject.id]: { ...subject, chapterIds: subject.chapterIds.filter((x) => x !== id) } }
        : s.subjects;
      commit({ chapters, topics, subjects });
    },

    duplicateChapter: (id) => {
      const s = get();
      const chapter = s.chapters[id];
      if (!chapter) return id;
      const newId = makeId();
      const topics = { ...s.topics };
      const newTopicIds: string[] = [];
      chapter.topicIds.forEach((tid) => {
        const t = s.topics[tid];
        if (!t) return;
        const ntid = makeId();
        topics[ntid] = { ...t, id: ntid, chapterId: newId, revisionHistory: [] };
        newTopicIds.push(ntid);
      });
      const copy: Chapter = { ...chapter, id: newId, name: `${chapter.name} (copy)`, topicIds: newTopicIds };
      const subject = s.subjects[chapter.subjectId];
      const subjects = subject
        ? { ...s.subjects, [subject.id]: { ...subject, chapterIds: [...subject.chapterIds, newId] } }
        : s.subjects;
      commit({ chapters: { ...s.chapters, [newId]: copy }, topics, subjects });
      return newId;
    },

    addTopic: (chapterId, title) => {
      const id = makeId();
      const s = get();
      const chapter = s.chapters[chapterId];
      if (!chapter) return id;
      const now = Date.now();
      const topic: Topic = { id, chapterId, title, notes: '', order: chapter.topicIds.length, difficulty: 'Medium', priority: 'Medium', revisionHistory: [], createdAt: now, updatedAt: now };
      commit({
        topics: { ...s.topics, [id]: topic },
        chapters: { ...s.chapters, [chapterId]: { ...chapter, topicIds: [...chapter.topicIds, id] } },
      });
      return id;
    },

    renameTopic: (id, title) => {
      const s = get();
      if (!s.topics[id]) return;
      commit({ topics: { ...s.topics, [id]: { ...s.topics[id], title, updatedAt: Date.now() } } });
    },

    deleteTopic: (id) => {
      const s = get();
      const topic = s.topics[id];
      if (!topic) return;
      const topics = { ...s.topics }; delete topics[id];
      const chapter = s.chapters[topic.chapterId];
      const chapters = chapter
        ? { ...s.chapters, [chapter.id]: { ...chapter, topicIds: chapter.topicIds.filter((x) => x !== id) } }
        : s.chapters;
      commit({ topics, chapters });
    },

    updateTopicNotes: (id, notes) => {
      const s = get();
      if (!s.topics[id]) return;
      commit({ topics: { ...s.topics, [id]: { ...s.topics[id], notes, updatedAt: Date.now() } } });
    },

    markTopicRevised: (id) => {
      const s = get();
      const topic = s.topics[id];
      if (!topic) return;
      commit({ topics: { ...s.topics, [id]: markRevised(topic, Date.now()) } });
    },
  };
});
```

- [ ] **Step 8: Run to verify all store tests pass**

Run: `npx vitest run store lib/revision/progress.test.ts`
Expected: PASS (all store + progress tests).

- [ ] **Step 9: Commit**

```bash
git add store lib/revision/progress.ts lib/revision/progress.test.ts && git commit -m "feat: add zustand store and progress selectors"
```

---

### Task 6: App shell, theme, and hydration gate

**Files:**
- Create: `components/layout/AppShell.tsx`
- Create: `components/layout/ThemeToggle.tsx`
- Create: `components/layout/Breadcrumb.tsx`
- Create: `components/StoreHydrator.tsx`
- Modify: `app/layout.tsx`, `app/globals.css`

**Interfaces:**
- Consumes: `useStore` (`hydrate`).
- Produces: `<AppShell>` wrapper used by all pages; a client `<StoreHydrator>` that calls `hydrate()` once on mount and renders children only after hydration.

- [ ] **Step 1: Add the hydrator (client component)**

Create `components/StoreHydrator.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useStore } from '@/store/useStore';

export function StoreHydrator({ children }: { children: React.ReactNode }) {
  const hydrate = useStore((s) => s.hydrate);
  const [ready, setReady] = useState(false);
  useEffect(() => { void hydrate().then(() => setReady(true)); }, [hydrate]);
  if (!ready) {
    return <div className="grid min-h-screen place-items-center text-sm opacity-60">Loading…</div>;
  }
  return <>{children}</>;
}
```

- [ ] **Step 2: Add theme toggle**

Create `components/layout/ThemeToggle.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export function ThemeToggle() {
  const [dark, setDark] = useState(true);
  useEffect(() => {
    const stored = localStorage.getItem('ce-theme');
    const isDark = stored ? stored === 'dark' : true;
    setDark(isDark);
    document.documentElement.classList.toggle('dark', isDark);
  }, []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('ce-theme', next ? 'dark' : 'light');
  };
  return (
    <button onClick={toggle} aria-label="Toggle theme"
      className="rounded-lg border border-white/10 p-2 transition hover:bg-white/5">
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
```

- [ ] **Step 3: Add breadcrumb + shell**

Create `components/layout/Breadcrumb.tsx`:

```tsx
import Link from 'next/link';

export function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="flex items-center gap-2 text-sm opacity-70">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-2">
          {it.href ? <Link href={it.href} className="hover:opacity-100">{it.label}</Link> : <span>{it.label}</span>}
          {i < items.length - 1 && <span className="opacity-40">/</span>}
        </span>
      ))}
    </nav>
  );
}
```

Create `components/layout/AppShell.tsx`:

```tsx
import Link from 'next/link';
import { ThemeToggle } from './ThemeToggle';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-black/20 px-6 py-4 backdrop-blur">
        <Link href="/" className="text-lg font-semibold tracking-tight">CE Revision</Link>
        <ThemeToggle />
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
```

- [ ] **Step 4: Wire layout + base styles**

Replace `app/layout.tsx` with:

```tsx
import type { Metadata } from 'next';
import './globals.css';
import { StoreHydrator } from '@/components/StoreHydrator';
import { AppShell } from '@/components/layout/AppShell';

export const metadata: Metadata = { title: 'CE ESE Revision Manager', description: 'Track your Civil Engineering revision.' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-neutral-950 text-neutral-100 antialiased">
        <StoreHydrator>
          <AppShell>{children}</AppShell>
        </StoreHydrator>
      </body>
    </html>
  );
}
```

Append to `app/globals.css`:

```css
:root { color-scheme: dark; }
.glass { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); backdrop-filter: blur(12px); }
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add app components && git commit -m "feat: add app shell, theme toggle, and store hydration gate"
```

---

### Task 7: Dashboard + SubjectCard

**Files:**
- Create: `components/cards/SubjectCard.tsx`
- Create: `components/AddButton.tsx`
- Create: `components/RowActions.tsx`
- Modify: `app/page.tsx`
- Test: `components/cards/SubjectCard.test.tsx`

**Interfaces:**
- Consumes: `useStore`, `subjectProgress`, `subjectStats`, `relativeLabel`.
- Produces: `<SubjectCard subject={Subject} />`; `<AddButton label onAdd={(name)=>void} />` (prompts for a name and calls `onAdd`); `<RowActions onRename onDelete onDuplicate? />` (hover-revealed icon buttons; `onDuplicate` optional — reused by chapters/topics in later tasks).

- [ ] **Step 1: Write a failing render test**

Create `components/cards/SubjectCard.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SubjectCard } from './SubjectCard';
import { useStore } from '@/store/useStore';

beforeEach(() => {
  useStore.setState({ subjects: {}, chapters: {}, topics: {}, subjectOrder: [] });
});

it('renders the subject name and a progress value', () => {
  const id = useStore.getState().addSubject('Fluid Mechanics');
  render(<SubjectCard subject={useStore.getState().subjects[id]} />);
  expect(screen.getByText('Fluid Mechanics')).toBeInTheDocument();
  expect(screen.getByText(/%/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/cards/SubjectCard.test.tsx`
Expected: FAIL (cannot find module './SubjectCard').

- [ ] **Step 3: Implement AddButton**

Create `components/AddButton.tsx`:

```tsx
'use client';
import { Plus } from 'lucide-react';

export function AddButton({ label, onAdd }: { label: string; onAdd: (name: string) => void }) {
  const click = () => {
    const name = window.prompt(`Name for new ${label}?`);
    if (name && name.trim()) onAdd(name.trim());
  };
  return (
    <button onClick={click}
      className="flex items-center gap-2 rounded-xl border border-dashed border-white/15 px-4 py-3 text-sm opacity-80 transition hover:border-white/30 hover:opacity-100">
      <Plus size={16} /> Add {label}
    </button>
  );
}
```

- [ ] **Step 3b: Implement RowActions (shared hover menu)**

Create `components/RowActions.tsx`:

```tsx
'use client';
import { Pencil, Trash2, Copy } from 'lucide-react';

export function RowActions({ onRename, onDelete, onDuplicate }: {
  onRename: () => void; onDelete: () => void; onDuplicate?: () => void;
}) {
  return (
    <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
      <button aria-label="Rename" onClick={(e) => { e.preventDefault(); onRename(); }} className="rounded p-1.5 hover:bg-white/10"><Pencil size={15} /></button>
      {onDuplicate && <button aria-label="Duplicate" onClick={(e) => { e.preventDefault(); onDuplicate(); }} className="rounded p-1.5 hover:bg-white/10"><Copy size={15} /></button>}
      <button aria-label="Delete" onClick={(e) => { e.preventDefault(); onDelete(); }} className="rounded p-1.5 hover:bg-white/10"><Trash2 size={15} /></button>
    </div>
  );
}
```

- [ ] **Step 4: Implement SubjectCard**

Create `components/cards/SubjectCard.tsx`:

```tsx
'use client';
import Link from 'next/link';
import { motion } from 'framer-motion';
import type { Subject } from '@/lib/domain/types';
import { useStore } from '@/store/useStore';
import { subjectProgress, subjectStats } from '@/lib/revision/progress';
import { relativeLabel } from '@/lib/revision/engine';
import { RowActions } from '@/components/RowActions';

export function SubjectCard({ subject }: { subject: Subject }) {
  const data = useStore();
  const { renameSubject, deleteSubject } = useStore.getState();
  const now = Date.now();
  const progress = subjectProgress(data, subject.id, now);
  const stats = subjectStats(data, subject.id, now);
  const rename = () => { const n = window.prompt('Rename subject', subject.name); if (n && n.trim()) renameSubject(subject.id, n.trim()); };
  const remove = () => { if (window.confirm(`Delete "${subject.name}" and all its chapters/topics?`)) deleteSubject(subject.id); };
  return (
    <motion.div whileHover={{ y: -4 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}>
      <Link href={`/subject/${subject.id}`}
        className="group glass block rounded-2xl p-5"
        style={{ boxShadow: `inset 0 0 0 1px ${subject.color}22` }}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{subject.name}</h3>
          <div className="flex items-center gap-2">
            <span className="text-sm opacity-60">{progress}%</span>
            <RowActions onRename={rename} onDelete={remove} />
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full" style={{ width: `${progress}%`, background: subject.color }} />
        </div>
        <div className="mt-4 flex justify-between text-xs opacity-60">
          <span>{stats.chapterCount} chapters</span>
          <span>{stats.pending} pending</span>
          <span>{stats.lastRevised ? relativeLabel(stats.lastRevised, now) : 'Never'}</span>
        </div>
      </Link>
    </motion.div>
  );
}
```

- [ ] **Step 5: Implement the dashboard page**

Replace `app/page.tsx` with:

```tsx
'use client';
import { motion } from 'framer-motion';
import { useStore } from '@/store/useStore';
import { SubjectCard } from '@/components/cards/SubjectCard';
import { AddButton } from '@/components/AddButton';

export default function DashboardPage() {
  const subjectOrder = useStore((s) => s.subjectOrder);
  const subjects = useStore((s) => s.subjects);
  const addSubject = useStore((s) => s.addSubject);
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Subjects</h1>
        <AddButton label="Subject" onAdd={(name) => addSubject(name)} />
      </div>
      <motion.div layout className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {subjectOrder.map((id) => subjects[id] && <SubjectCard key={id} subject={subjects[id]} />)}
      </motion.div>
    </div>
  );
}
```

- [ ] **Step 6: Run to verify test passes**

Run: `npx vitest run components/cards/SubjectCard.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 7: Commit**

```bash
git add app components && git commit -m "feat: add dashboard with subject cards"
```

---

### Task 8: Subject page + ChapterCard (CRUD)

**Files:**
- Create: `components/cards/ChapterCard.tsx`
- Create: `app/subject/[id]/page.tsx`
- Test: `components/cards/ChapterCard.test.tsx`

**Interfaces:**
- Consumes: `useStore` (chapter actions), `chapterProgress`, `RowActions` (created in Task 7).
- Produces: `<ChapterCard chapter={Chapter} />`.

- [ ] **Step 1: Write a failing render test**

Create `components/cards/ChapterCard.test.tsx`:

```tsx
import { it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChapterCard } from './ChapterCard';
import { useStore } from '@/store/useStore';

beforeEach(() => useStore.setState({ subjects: {}, chapters: {}, topics: {}, subjectOrder: [] }));

it('renders chapter name and topic count', () => {
  const s = useStore.getState().addSubject('S');
  const c = useStore.getState().addChapter(s, 'Flow through Pipes');
  useStore.getState().addTopic(c, 'Bernoulli');
  render(<ChapterCard chapter={useStore.getState().chapters[c]} />);
  expect(screen.getByText('Flow through Pipes')).toBeInTheDocument();
  expect(screen.getByText(/1 topic/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/cards/ChapterCard.test.tsx`
Expected: FAIL (cannot find module './ChapterCard').

- [ ] **Step 3: Implement ChapterCard**

Create `components/cards/ChapterCard.tsx`:

```tsx
'use client';
import Link from 'next/link';
import type { Chapter } from '@/lib/domain/types';
import { useStore } from '@/store/useStore';
import { chapterProgress } from '@/lib/revision/progress';
import { RowActions } from '@/components/RowActions';

export function ChapterCard({ chapter }: { chapter: Chapter }) {
  const data = useStore();
  const { renameChapter, deleteChapter, duplicateChapter } = useStore.getState();
  const progress = chapterProgress(data, chapter.id, Date.now());
  const rename = () => { const n = window.prompt('Rename chapter', chapter.name); if (n && n.trim()) renameChapter(chapter.id, n.trim()); };
  const remove = () => { if (window.confirm(`Delete "${chapter.name}" and its topics?`)) deleteChapter(chapter.id); };
  return (
    <Link href={`/chapter/${chapter.id}`} className="group glass flex items-center justify-between rounded-xl p-4">
      <div>
        <div className="font-medium">{chapter.name}</div>
        <div className="mt-1 text-xs opacity-60">{chapter.topicIds.length} topic{chapter.topicIds.length === 1 ? '' : 's'} · {progress}% · {chapter.difficulty} · {chapter.priority}</div>
      </div>
      <RowActions onRename={rename} onDelete={remove} onDuplicate={() => duplicateChapter(chapter.id)} />
    </Link>
  );
}
```

- [ ] **Step 4: Implement the subject page**

Create `app/subject/[id]/page.tsx`:

```tsx
'use client';
import { use } from 'react';
import { notFound } from 'next/navigation';
import { useStore } from '@/store/useStore';
import { ChapterCard } from '@/components/cards/ChapterCard';
import { AddButton } from '@/components/AddButton';
import { Breadcrumb } from '@/components/layout/Breadcrumb';

export default function SubjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const subject = useStore((s) => s.subjects[id]);
  const chapters = useStore((s) => s.chapters);
  const addChapter = useStore((s) => s.addChapter);
  if (!subject) return notFound();
  return (
    <div>
      <Breadcrumb items={[{ label: 'Subjects', href: '/' }, { label: subject.name }]} />
      <div className="mb-6 mt-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{subject.name}</h1>
        <AddButton label="Chapter" onAdd={(name) => addChapter(id, name)} />
      </div>
      <div className="grid gap-3">
        {subject.chapterIds.map((cid) => chapters[cid] && <ChapterCard key={cid} chapter={chapters[cid]} />)}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run test + build**

Run: `npx vitest run components/cards/ChapterCard.test.tsx && npm run build`
Expected: test PASS; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add app components && git commit -m "feat: add subject page with chapter CRUD"
```

---

### Task 9: Chapter page + TopicCard with badge

**Files:**
- Create: `components/cards/TopicCard.tsx`
- Create: `components/RevisionBadge.tsx`
- Create: `app/chapter/[id]/page.tsx`
- Test: `components/RevisionBadge.test.tsx`

**Interfaces:**
- Consumes: `useStore`, `badgeState`, `BadgeState`, `totalRevisions`, `lastRevisedAt`, `relativeLabel`.
- Produces: `<RevisionBadge state={BadgeState} />`; `<TopicCard topic={Topic} />`.

- [ ] **Step 1: Write a failing badge test**

Create `components/RevisionBadge.test.tsx`:

```tsx
import { it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RevisionBadge } from './RevisionBadge';

it('renders human-readable labels for each state', () => {
  render(<RevisionBadge state="Overdue" />);
  expect(screen.getByText('Overdue')).toBeInTheDocument();
  render(<RevisionBadge state="DueToday" />);
  expect(screen.getByText('Due Today')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/RevisionBadge.test.tsx`
Expected: FAIL (cannot find module './RevisionBadge').

- [ ] **Step 3: Implement RevisionBadge**

Create `components/RevisionBadge.tsx`:

```tsx
import type { BadgeState } from '@/lib/revision/engine';

const LABELS: Record<BadgeState, string> = {
  NeverRevised: 'Never Revised', Overdue: 'Overdue', DueToday: 'Due Today',
  DueTomorrow: 'Due Tomorrow', RecentlyRevised: 'Recently Revised', Upcoming: 'Upcoming',
};
const COLORS: Record<BadgeState, string> = {
  NeverRevised: 'bg-white/10 text-white/70', Overdue: 'bg-red-500/20 text-red-300',
  DueToday: 'bg-amber-500/20 text-amber-300', DueTomorrow: 'bg-sky-500/20 text-sky-300',
  RecentlyRevised: 'bg-emerald-500/20 text-emerald-300', Upcoming: 'bg-white/10 text-white/60',
};

export function RevisionBadge({ state }: { state: BadgeState }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${COLORS[state]}`}>{LABELS[state]}</span>;
}
```

- [ ] **Step 4: Implement TopicCard**

Create `components/cards/TopicCard.tsx`:

```tsx
'use client';
import Link from 'next/link';
import type { Topic } from '@/lib/domain/types';
import { useStore } from '@/store/useStore';
import { badgeState, totalRevisions, lastRevisedAt, relativeLabel } from '@/lib/revision/engine';
import { RevisionBadge } from '@/components/RevisionBadge';
import { RowActions } from '@/components/RowActions';

export function TopicCard({ topic }: { topic: Topic }) {
  const { renameTopic, deleteTopic } = useStore.getState();
  const now = Date.now();
  const last = lastRevisedAt(topic.revisionHistory);
  const rename = () => { const n = window.prompt('Rename topic', topic.title); if (n && n.trim()) renameTopic(topic.id, n.trim()); };
  const remove = () => { if (window.confirm(`Delete "${topic.title}"?`)) deleteTopic(topic.id); };
  return (
    <Link href={`/topic/${topic.id}`} className="group glass flex items-center justify-between rounded-xl p-4">
      <div>
        <div className="font-medium">{topic.title}</div>
        <div className="mt-1 text-xs opacity-60">
          {totalRevisions(topic.revisionHistory)} revisions · {last ? relativeLabel(last, now) : 'not revised yet'}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <RevisionBadge state={badgeState(topic.revisionHistory, now)} />
        <RowActions onRename={rename} onDelete={remove} />
      </div>
    </Link>
  );
}
```

- [ ] **Step 5: Implement the chapter page**

Create `app/chapter/[id]/page.tsx`:

```tsx
'use client';
import { use } from 'react';
import { notFound } from 'next/navigation';
import { useStore } from '@/store/useStore';
import { TopicCard } from '@/components/cards/TopicCard';
import { AddButton } from '@/components/AddButton';
import { Breadcrumb } from '@/components/layout/Breadcrumb';

export default function ChapterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const chapter = useStore((s) => s.chapters[id]);
  const topics = useStore((s) => s.topics);
  const subjects = useStore((s) => s.subjects);
  const addTopic = useStore((s) => s.addTopic);
  if (!chapter) return notFound();
  const subject = subjects[chapter.subjectId];
  return (
    <div>
      <Breadcrumb items={[
        { label: 'Subjects', href: '/' },
        ...(subject ? [{ label: subject.name, href: `/subject/${subject.id}` }] : []),
        { label: chapter.name },
      ]} />
      <div className="mb-6 mt-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{chapter.name}</h1>
        <AddButton label="Topic" onAdd={(title) => addTopic(id, title)} />
      </div>
      <div className="grid gap-3">
        {chapter.topicIds.map((tid) => topics[tid] && <TopicCard key={tid} topic={topics[tid]} />)}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run test + build**

Run: `npx vitest run components/RevisionBadge.test.tsx && npm run build`
Expected: test PASS; build succeeds.

- [ ] **Step 7: Commit**

```bash
git add app components && git commit -m "feat: add chapter page with topic cards and revision badges"
```

---

### Task 10: Topic page — markdown editor, history, Mark as Revised

**Files:**
- Create: `components/editor/MarkdownEditor.tsx`
- Create: `components/RevisionHistoryPanel.tsx`
- Create: `app/topic/[id]/page.tsx`
- Test: `components/RevisionHistoryPanel.test.tsx`

**Interfaces:**
- Consumes: `useStore` (`updateTopicNotes`, `markTopicRevised`), engine helpers, `react-markdown`, `remark-gfm`.
- Produces: `<MarkdownEditor value onChange />` (edit/preview toggle); `<RevisionHistoryPanel topic />`.

- [ ] **Step 1: Write a failing history-panel test**

Create `components/RevisionHistoryPanel.test.tsx`:

```tsx
import { it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RevisionHistoryPanel } from './RevisionHistoryPanel';
import { useStore } from '@/store/useStore';

beforeEach(() => useStore.setState({ subjects: {}, chapters: {}, topics: {}, subjectOrder: [] }));

it('shows total revisions and one row per revision', () => {
  const s = useStore.getState().addSubject('S');
  const c = useStore.getState().addChapter(s, 'C');
  const t = useStore.getState().addTopic(c, 'T');
  useStore.getState().markTopicRevised(t);
  useStore.getState().markTopicRevised(t);
  render(<RevisionHistoryPanel topic={useStore.getState().topics[t]} />);
  expect(screen.getByText(/Total Revisions:\s*2/)).toBeInTheDocument();
  expect(screen.getByText('Revision 1')).toBeInTheDocument();
  expect(screen.getByText('Revision 2')).toBeInTheDocument();
});
```

These assertions target the total and each row label precisely, avoiding collisions with the "Revision History" heading or dates.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/RevisionHistoryPanel.test.tsx`
Expected: FAIL (cannot find module './RevisionHistoryPanel').

- [ ] **Step 3: Implement RevisionHistoryPanel**

Create `components/RevisionHistoryPanel.tsx`:

```tsx
import type { Topic } from '@/lib/domain/types';
import { totalRevisions, relativeLabel } from '@/lib/revision/engine';

export function RevisionHistoryPanel({ topic }: { topic: Topic }) {
  const now = Date.now();
  const history = [...topic.revisionHistory].reverse();
  return (
    <div className="glass rounded-xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">Revision History</h3>
        <span className="text-sm opacity-70">Total Revisions: {totalRevisions(topic.revisionHistory)}</span>
      </div>
      {history.length === 0 ? (
        <p className="text-sm opacity-50">Not revised yet.</p>
      ) : (
        <ul className="space-y-2">
          {history.map((r, i) => {
            const d = new Date(r.timestamp);
            return (
              <li key={r.id} className="flex justify-between text-sm">
                <span>Revision {history.length - i}</span>
                <span className="opacity-70">{d.toLocaleDateString()} {d.toLocaleTimeString()} · {relativeLabel(r.timestamp, now)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Implement MarkdownEditor**

Create `components/editor/MarkdownEditor.tsx`:

```tsx
'use client';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function MarkdownEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [preview, setPreview] = useState(false);
  return (
    <div className="glass rounded-xl p-4">
      <div className="mb-3 flex gap-2 text-sm">
        <button onClick={() => setPreview(false)} className={`rounded px-3 py-1 ${!preview ? 'bg-white/15' : 'opacity-60'}`}>Edit</button>
        <button onClick={() => setPreview(true)} className={`rounded px-3 py-1 ${preview ? 'bg-white/15' : 'opacity-60'}`}>Preview</button>
      </div>
      {preview ? (
        <div className="space-y-2 text-sm leading-relaxed [&_a]:underline [&_code]:rounded [&_code]:bg-white/10 [&_code]:px-1 [&_h1]:text-xl [&_h1]:font-bold [&_h2]:text-lg [&_h2]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{value || '_Nothing yet._'}</ReactMarkdown>
        </div>
      ) : (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={16}
          placeholder="Write markdown notes…"
          className="w-full resize-y bg-transparent text-sm outline-none" />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Implement the topic page**

Create `app/topic/[id]/page.tsx`:

```tsx
'use client';
import { use } from 'react';
import { notFound } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { MarkdownEditor } from '@/components/editor/MarkdownEditor';
import { RevisionHistoryPanel } from '@/components/RevisionHistoryPanel';
import { RevisionBadge } from '@/components/RevisionBadge';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { badgeState } from '@/lib/revision/engine';

export default function TopicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const topic = useStore((s) => s.topics[id]);
  const chapters = useStore((s) => s.chapters);
  const subjects = useStore((s) => s.subjects);
  const updateTopicNotes = useStore((s) => s.updateTopicNotes);
  const markTopicRevised = useStore((s) => s.markTopicRevised);
  if (!topic) return notFound();
  const chapter = chapters[topic.chapterId];
  const subject = chapter ? subjects[chapter.subjectId] : undefined;
  return (
    <div>
      <Breadcrumb items={[
        { label: 'Subjects', href: '/' },
        ...(subject ? [{ label: subject.name, href: `/subject/${subject.id}` }] : []),
        ...(chapter ? [{ label: chapter.name, href: `/chapter/${chapter.id}` }] : []),
        { label: topic.title },
      ]} />
      <div className="mb-6 mt-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{topic.title}</h1>
          <RevisionBadge state={badgeState(topic.revisionHistory, Date.now())} />
        </div>
        <button onClick={() => markTopicRevised(topic.id)}
          className="flex items-center gap-2 rounded-xl bg-emerald-500/90 px-4 py-2 text-sm font-medium text-black transition hover:bg-emerald-400">
          <CheckCircle2 size={16} /> Mark as Revised
        </button>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <MarkdownEditor value={topic.notes} onChange={(v) => updateTopicNotes(topic.id, v)} />
        <RevisionHistoryPanel topic={topic} />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run test + full suite + build**

Run: `npx vitest run && npm run build`
Expected: all tests PASS; build succeeds.

- [ ] **Step 7: Manual end-to-end check**

Run: `npm run dev`, open the app, and confirm the Phase 1 acceptance path:
open app → see 13 seeded subjects → drill into a chapter → add a topic → write markdown notes → press **Mark as Revised** twice → history shows 2 entries and total count → badge updates → reload the page and confirm everything persists.

- [ ] **Step 8: Commit**

```bash
git add app components && git commit -m "feat: add topic page with markdown editor, history, and mark-as-revised"
```

---

## Phase 1 Complete

All acceptance criteria from the spec are met: navigable hierarchy with full CRUD, markdown notes, timestamped revision history with relative dates and counts, fixed-interval due badges, and LocalStorage persistence via the repository — with the pure revision engine and repository fully unit-tested.

**Deferred to later phases (per the design spec):** drag-and-drop, inline rename (Phase 1 renames via a prompt dialog), undo/redo, rich editor (LaTeX/images/tables/attachments), filters, search, statistics, calendar, notifications.

**Scope note on "duplicate at every level":** Phase 1 ships add/rename/delete at all three levels (subject, chapter, topic) plus **duplicate for chapters** (the level where duplication is most useful, e.g. reusing a chapter template). Subject and topic duplication are deferred to Phase 2 alongside the drag-and-drop/inline-edit pass; the `RowActions` component already supports an optional `onDuplicate`, so wiring them later is trivial.
