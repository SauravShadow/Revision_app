# Phase 2: Editing Power & Premium Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Phase 1 walking skeleton into a fluid editing tool — inline rename, drag-and-drop reorder + cross-hierarchy move, soft-archive with a restore view, session-only undo/redo, and a premium visual pass — without changing the persistence contract.

**Architecture:** All new correctness-critical logic (archive, reorder, move, undo/redo) lives in the pure/store layer with real unit tests; the `@dnd-kit` layer is a thin translation from drop events to those tested store actions. Undo/redo is an in-memory `History<AppData>` (pure helpers in `store/history.ts`) wrapping the store's mutations, split into `commitHistory` (structural) vs `commitSilent` (notes / mark-revised / hydrate). One additive schema field, `archivedAt?: number`, powers archive.

**Tech Stack:** Next.js 15 (App Router) + React 19 + TypeScript, TailwindCSS v4, Zustand, `@dnd-kit/core` + `@dnd-kit/sortable`, framer-motion, lucide-react, Vitest + Testing Library.

## Global Constraints

- **Node:** 18.19 in this environment. Pinned toolchain from Phase 1 stays: Next 15 / React 19, Vitest 3, jsdom 26, `@tailwindcss/oxide-linux-x64-gnu` present. Do not upgrade to Next 16 / Vitest 4 (they need Node 20+).
- **Package manager:** npm.
- **All persistence via `RevisionRepository`** — store talks only to the injected repo (`ApiRepository` → `/api/data` → file store). No component touches storage.
- **Revision math stays pure** in `lib/revision/` — no React/store imports; `now: number` passed in.
- **IDs** via `makeId()` (`lib/domain/id.ts`).
- **Undo/redo history is session-only** — never persisted; lives in store state, reset on `hydrate`. Depth cap `MAX_HISTORY = 100`.
- **Archive is soft** — `archivedAt?: number` (undefined = active). Archived entities are excluded from main lists and from progress selectors. The existing hard-delete actions (`deleteSubject/deleteChapter/deleteTopic`) are **kept unchanged**; in the UI they are only reachable from the archive view as "Delete permanently", while row menus archive instead. No store action is renamed (keeps every intermediate build green).
- **Cross-move via drag = append** to the target parent's end; precise ordering is a separate within-list reorder.
- **Draggable/droppable id namespacing:** draggables `"<type>:<id>"` (e.g. `topic:abc`); tree drop nodes `"<type>-node:<id>"` (e.g. `chapter-node:xyz`). The `onDragEnd` handler parses these.

---

### Task 1: Dependencies + `archivedAt` schema field

**Files:**
- Modify: `package.json` (add dnd-kit)
- Modify: `lib/domain/types.ts`
- Create: `lib/util/array.ts`
- Test: `lib/util/array.test.ts`

**Interfaces:**
- Produces: `Subject|Chapter|Topic` each gain `archivedAt?: number`; `arrayMove<T>(list: T[], from: number, to: number): T[]`.

- [ ] **Step 1: Install dnd-kit**

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/modifiers
```

If npm prints a React 19 peer-dependency warning, it is safe to ignore (dnd-kit runs fine on React 19); do **not** pass `--force`. Verify install:

```bash
npm ls @dnd-kit/core @dnd-kit/sortable
```

Expected: both resolve to a version (no "missing").

- [ ] **Step 2: Add `archivedAt` to the three entities**

In `lib/domain/types.ts`, add `archivedAt?: number;` as the last field of each interface. Full replacement of the three interfaces:

```ts
export interface Subject {
  id: string;
  name: string;
  color: string;
  icon: string;
  order: number;
  chapterIds: string[];
  archivedAt?: number;
}

export interface Chapter {
  id: string;
  subjectId: string;
  name: string;
  order: number;
  difficulty: Difficulty;
  priority: Priority;
  topicIds: string[];
  archivedAt?: number;
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
  archivedAt?: number;
}
```

- [ ] **Step 3: Write the failing arrayMove test**

Create `lib/util/array.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { arrayMove } from './array';

describe('arrayMove', () => {
  it('moves an item forward', () => {
    expect(arrayMove(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  });
  it('moves an item backward', () => {
    expect(arrayMove(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });
  it('is a no-op when from === to', () => {
    expect(arrayMove(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'b', 'c']);
  });
  it('does not mutate the input', () => {
    const input = ['a', 'b', 'c'];
    arrayMove(input, 0, 2);
    expect(input).toEqual(['a', 'b', 'c']);
  });
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `npx vitest run lib/util/array.test.ts`
Expected: FAIL (cannot find module './array').

- [ ] **Step 5: Implement arrayMove**

Create `lib/util/array.ts`:

```ts
export function arrayMove<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
```

- [ ] **Step 6: Run to verify it passes + full suite still green**

Run: `npx vitest run lib/util/array.test.ts && npx vitest run`
Expected: array tests PASS; all prior tests still PASS (adding an optional field breaks nothing).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json lib/domain/types.ts lib/util
git commit -m "chore: add dnd-kit, archivedAt field, and arrayMove helper"
```

---

### Task 2: Archive / restore actions + archived-aware selectors

**Files:**
- Modify: `store/useStore.ts`
- Modify: `lib/revision/progress.ts`
- Test: `lib/revision/progress.test.ts` (extend)
- Test: `store/useStore.test.ts` (extend)

**Interfaces:**
- Consumes: store `commit` path, `AppData`.
- Produces (store actions, **added** — nothing renamed): `archiveSubject(id)`, `restoreSubject(id)`, `archiveChapter(id)`, `restoreChapter(id)`, `archiveTopic(id)`, `restoreTopic(id)`. The existing `deleteSubject/deleteChapter/deleteTopic` stay exactly as they are (the archive view will call them as "Delete permanently" in Task 7). Selectors `chapterProgress`, `subjectProgress`, `subjectStats` now ignore archived entities.

- [ ] **Step 1: Write failing selector tests for archived filtering**

Add to `lib/revision/progress.test.ts` (append inside the file, after the existing `describe('progress', …)`):

```ts
describe('progress ignores archived entities', () => {
  it('excludes an archived topic from chapter progress', () => {
    const data = fixture();
    // t2 (never revised) is archived -> only t1 counts, which is in good standing -> 100%
    data.topics.t2.archivedAt = 1;
    expect(chapterProgress(data, 'c1', now)).toBe(100);
  });
  it('excludes an archived chapter from subject progress', () => {
    const data = fixture();
    data.chapters.c1.archivedAt = 1;
    // the subject has no non-archived chapters -> 0
    expect(subjectProgress(data, 's1', now)).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run lib/revision/progress.test.ts`
Expected: FAIL (archived items still counted).

- [ ] **Step 3: Make selectors archived-aware**

Replace the three functions in `lib/revision/progress.ts` with:

```ts
import type { AppData } from '@/lib/domain/types';
import { inGoodStanding, lastRevisedAt } from './engine';

export function chapterProgress(data: AppData, chapterId: string, now: number): number {
  const chapter = data.chapters[chapterId];
  if (!chapter) return 0;
  const topics = chapter.topicIds
    .map((tid) => data.topics[tid])
    .filter((t) => t && !t.archivedAt);
  if (topics.length === 0) return 0;
  const good = topics.filter((t) => inGoodStanding(t.revisionHistory, now)).length;
  return Math.round((good / topics.length) * 100);
}

export function subjectProgress(data: AppData, subjectId: string, now: number): number {
  const subject = data.subjects[subjectId];
  if (!subject) return 0;
  const chapters = subject.chapterIds
    .map((cid) => data.chapters[cid])
    .filter((c) => c && !c.archivedAt);
  if (chapters.length === 0) return 0;
  const total = chapters.reduce((sum, c) => sum + chapterProgress(data, c.id, now), 0);
  return Math.round(total / chapters.length);
}

export function subjectStats(
  data: AppData, subjectId: string, now: number,
): { chapterCount: number; pending: number; lastRevised: number | undefined } {
  const subject = data.subjects[subjectId];
  if (!subject) return { chapterCount: 0, pending: 0, lastRevised: undefined };
  let pending = 0;
  let lastRevised: number | undefined;
  let chapterCount = 0;
  for (const cid of subject.chapterIds) {
    const chapter = data.chapters[cid];
    if (!chapter || chapter.archivedAt) continue;
    chapterCount += 1;
    for (const tid of chapter.topicIds) {
      const t = data.topics[tid];
      if (!t || t.archivedAt) continue;
      if (!inGoodStanding(t.revisionHistory, now)) pending += 1;
      const lr = lastRevisedAt(t.revisionHistory);
      if (lr !== undefined && (lastRevised === undefined || lr > lastRevised)) lastRevised = lr;
    }
  }
  return { chapterCount, pending, lastRevised };
}
```

- [ ] **Step 4: Run to verify selector tests pass**

Run: `npx vitest run lib/revision/progress.test.ts`
Expected: PASS (original 3 + new 2).

- [ ] **Step 5: Write failing store tests for archive/restore**

Add to `store/useStore.test.ts` (append inside `describe('useStore', …)`):

```ts
  it('archiveTopic sets archivedAt and restoreTopic clears it', () => {
    const s = useStore.getState().addSubject('S');
    const c = useStore.getState().addChapter(s, 'C');
    const t = useStore.getState().addTopic(c, 'T');
    useStore.getState().archiveTopic(t);
    expect(useStore.getState().topics[t].archivedAt).toBeTypeOf('number');
    useStore.getState().restoreTopic(t);
    expect(useStore.getState().topics[t].archivedAt).toBeUndefined();
  });

  it('archiveChapter then restoreChapter round-trips archivedAt', () => {
    const s = useStore.getState().addSubject('S');
    const c = useStore.getState().addChapter(s, 'C');
    useStore.getState().archiveChapter(c);
    expect(useStore.getState().chapters[c].archivedAt).toBeTypeOf('number');
    useStore.getState().restoreChapter(c);
    expect(useStore.getState().chapters[c].archivedAt).toBeUndefined();
  });
```

Leave the existing `deleteChapter`/`deleteSubject`/`deleteTopic` tests untouched — those actions are unchanged.

- [ ] **Step 6: Run to verify they fail**

Run: `npx vitest run store/useStore.test.ts`
Expected: FAIL (archiveTopic/archiveChapter not defined).

- [ ] **Step 7: Add archive/restore actions in the store**

In `store/useStore.ts`:

1. In the `StoreState` interface, **add** these signatures (do not remove or rename anything — the `delete*` signatures stay):

```ts
  archiveSubject: (id: string) => void;
  restoreSubject: (id: string) => void;
  archiveChapter: (id: string) => void;
  restoreChapter: (id: string) => void;
  archiveTopic: (id: string) => void;
  restoreTopic: (id: string) => void;
```

2. Add the archive/restore action implementations (place them after the existing `delete*` actions). Each sets/clears `archivedAt` via `commit`:

```ts
    archiveSubject: (id) => {
      const s = get();
      if (!s.subjects[id]) return;
      commit({ subjects: { ...s.subjects, [id]: { ...s.subjects[id], archivedAt: Date.now() } } });
    },
    restoreSubject: (id) => {
      const s = get();
      if (!s.subjects[id]) return;
      const { archivedAt: _drop, ...rest } = s.subjects[id];
      void _drop;
      commit({ subjects: { ...s.subjects, [id]: rest } });
    },
    archiveChapter: (id) => {
      const s = get();
      if (!s.chapters[id]) return;
      commit({ chapters: { ...s.chapters, [id]: { ...s.chapters[id], archivedAt: Date.now() } } });
    },
    restoreChapter: (id) => {
      const s = get();
      if (!s.chapters[id]) return;
      const { archivedAt: _drop, ...rest } = s.chapters[id];
      void _drop;
      commit({ chapters: { ...s.chapters, [id]: rest } });
    },
    archiveTopic: (id) => {
      const s = get();
      if (!s.topics[id]) return;
      commit({ topics: { ...s.topics, [id]: { ...s.topics[id], archivedAt: Date.now() } } });
    },
    restoreTopic: (id) => {
      const s = get();
      if (!s.topics[id]) return;
      const { archivedAt: _drop, ...rest } = s.topics[id];
      void _drop;
      commit({ topics: { ...s.topics, [id]: rest } });
    },
```

- [ ] **Step 8: Run to verify all store tests pass**

Run: `npx vitest run store/useStore.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add store/useStore.ts lib/revision/progress.ts store/useStore.test.ts lib/revision/progress.test.ts
git commit -m "feat: soft-archive (archive/restore) with archived-aware selectors"
```

---

### Task 3: Reorder + cross-hierarchy move actions

**Files:**
- Modify: `store/useStore.ts`
- Test: `store/useStore.test.ts` (extend)

**Interfaces:**
- Consumes: `arrayMove` from `@/lib/util/array`, store `commit`.
- Produces (store actions):
  - `reorderSubjects(activeId: string, overId: string): void`
  - `reorderChapters(activeId: string, overId: string): void` (both chapters in the same subject)
  - `reorderTopics(activeId: string, overId: string): void` (both topics in the same chapter)
  - `moveChapter(chapterId: string, toSubjectId: string): void` (append to target; no-op if already there or ids missing)
  - `moveTopic(topicId: string, toChapterId: string): void` (append to target; no-op if already there or ids missing)

- [ ] **Step 1: Write failing reorder + move tests**

Add to `store/useStore.test.ts` (append inside `describe('useStore', …)`):

```ts
  it('reorderTopics moves a topic within its chapter', () => {
    const s = useStore.getState().addSubject('S');
    const c = useStore.getState().addChapter(s, 'C');
    const t1 = useStore.getState().addTopic(c, 'A');
    const t2 = useStore.getState().addTopic(c, 'B');
    const t3 = useStore.getState().addTopic(c, 'C');
    useStore.getState().reorderTopics(t1, t3); // move A to C's slot
    expect(useStore.getState().chapters[c].topicIds).toEqual([t2, t3, t1]);
  });

  it('moveTopic reparents a topic to another chapter (appended)', () => {
    const s = useStore.getState().addSubject('S');
    const c1 = useStore.getState().addChapter(s, 'C1');
    const c2 = useStore.getState().addChapter(s, 'C2');
    const t = useStore.getState().addTopic(c1, 'T');
    useStore.getState().moveTopic(t, c2);
    const state = useStore.getState();
    expect(state.chapters[c1].topicIds).not.toContain(t);
    expect(state.chapters[c2].topicIds).toContain(t);
    expect(state.topics[t].chapterId).toBe(c2);
  });

  it('moveChapter reparents a chapter to another subject (appended)', () => {
    const s1 = useStore.getState().addSubject('S1');
    const s2 = useStore.getState().addSubject('S2');
    const c = useStore.getState().addChapter(s1, 'C');
    useStore.getState().moveChapter(c, s2);
    const state = useStore.getState();
    expect(state.subjects[s1].chapterIds).not.toContain(c);
    expect(state.subjects[s2].chapterIds).toContain(c);
    expect(state.chapters[c].subjectId).toBe(s2);
  });

  it('moveTopic to the same chapter is a no-op (no duplicate)', () => {
    const s = useStore.getState().addSubject('S');
    const c = useStore.getState().addChapter(s, 'C');
    const t = useStore.getState().addTopic(c, 'T');
    useStore.getState().moveTopic(t, c);
    expect(useStore.getState().chapters[c].topicIds).toEqual([t]);
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run store/useStore.test.ts`
Expected: FAIL (reorderTopics/moveTopic/moveChapter not defined).

- [ ] **Step 3: Add the reorder + move actions**

In `store/useStore.ts`, add `import { arrayMove } from '@/lib/util/array';` near the other imports. Add the five signatures to `StoreState`:

```ts
  reorderSubjects: (activeId: string, overId: string) => void;
  reorderChapters: (activeId: string, overId: string) => void;
  reorderTopics: (activeId: string, overId: string) => void;
  moveChapter: (chapterId: string, toSubjectId: string) => void;
  moveTopic: (topicId: string, toChapterId: string) => void;
```

Add the implementations (place after the add/rename actions):

```ts
    reorderSubjects: (activeId, overId) => {
      const s = get();
      const from = s.subjectOrder.indexOf(activeId);
      const to = s.subjectOrder.indexOf(overId);
      if (from < 0 || to < 0 || from === to) return;
      commit({ subjectOrder: arrayMove(s.subjectOrder, from, to) });
    },

    reorderChapters: (activeId, overId) => {
      const s = get();
      const chapter = s.chapters[activeId];
      if (!chapter) return;
      const subject = s.subjects[chapter.subjectId];
      if (!subject) return;
      const from = subject.chapterIds.indexOf(activeId);
      const to = subject.chapterIds.indexOf(overId);
      if (from < 0 || to < 0 || from === to) return;
      commit({ subjects: { ...s.subjects, [subject.id]: { ...subject, chapterIds: arrayMove(subject.chapterIds, from, to) } } });
    },

    reorderTopics: (activeId, overId) => {
      const s = get();
      const topic = s.topics[activeId];
      if (!topic) return;
      const chapter = s.chapters[topic.chapterId];
      if (!chapter) return;
      const from = chapter.topicIds.indexOf(activeId);
      const to = chapter.topicIds.indexOf(overId);
      if (from < 0 || to < 0 || from === to) return;
      commit({ chapters: { ...s.chapters, [chapter.id]: { ...chapter, topicIds: arrayMove(chapter.topicIds, from, to) } } });
    },

    moveChapter: (chapterId, toSubjectId) => {
      const s = get();
      const chapter = s.chapters[chapterId];
      const target = s.subjects[toSubjectId];
      if (!chapter || !target || chapter.subjectId === toSubjectId) return;
      const source = s.subjects[chapter.subjectId];
      const subjects = { ...s.subjects };
      if (source) subjects[source.id] = { ...source, chapterIds: source.chapterIds.filter((x) => x !== chapterId) };
      subjects[target.id] = { ...target, chapterIds: [...target.chapterIds, chapterId] };
      commit({ subjects, chapters: { ...s.chapters, [chapterId]: { ...chapter, subjectId: toSubjectId } } });
    },

    moveTopic: (topicId, toChapterId) => {
      const s = get();
      const topic = s.topics[topicId];
      const target = s.chapters[toChapterId];
      if (!topic || !target || topic.chapterId === toChapterId) return;
      const source = s.chapters[topic.chapterId];
      const chapters = { ...s.chapters };
      if (source) chapters[source.id] = { ...source, topicIds: source.topicIds.filter((x) => x !== topicId) };
      chapters[target.id] = { ...target, topicIds: [...target.topicIds, topicId] };
      commit({ chapters, topics: { ...s.topics, [topicId]: { ...topic, chapterId: toChapterId } } });
    },
```

- [ ] **Step 4: Run to verify all store tests pass**

Run: `npx vitest run store/useStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add store/useStore.ts store/useStore.test.ts
git commit -m "feat: add reorder and cross-hierarchy move store actions"
```

---

### Task 4: Undo/redo history + save-state

**Files:**
- Create: `store/history.ts`
- Test: `store/history.test.ts`
- Modify: `store/useStore.ts`
- Test: `store/useStore.test.ts` (extend)

**Interfaces:**
- Produces (pure, `store/history.ts`):
  - `interface History<T> { past: T[]; future: T[] }`
  - `MAX_HISTORY = 100`
  - `emptyHistory<T>(): History<T>`
  - `record<T>(h: History<T>, prev: T): History<T>`
  - `undo<T>(h: History<T>, present: T): { history: History<T>; present: T } | null`
  - `redo<T>(h: History<T>, present: T): { history: History<T>; present: T } | null`
- Produces (store): state gains `history: History<AppData>` and `saveState: 'idle' | 'saving' | 'saved'`; actions `undo()`, `redo()`. Structural mutations record history; `updateTopicNotes` / `markTopicRevised` / `hydrate` do not.

- [ ] **Step 1: Write the failing history test**

Create `store/history.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { emptyHistory, record, undo, redo, MAX_HISTORY } from './history';

describe('history', () => {
  it('record pushes prev onto past and clears future', () => {
    const h = { past: [1], future: [9] };
    expect(record(h, 2)).toEqual({ past: [1, 2], future: [] });
  });

  it('undo returns null on empty past', () => {
    expect(undo(emptyHistory<number>(), 5)).toBeNull();
  });

  it('undo moves present to future and pops past', () => {
    const h = { past: [1, 2], future: [] as number[] };
    const res = undo(h, 3);
    expect(res).toEqual({ history: { past: [1], future: [3] }, present: 2 });
  });

  it('redo is the mirror of undo', () => {
    const h = { past: [1], future: [3] };
    const res = redo(h, 2);
    expect(res).toEqual({ history: { past: [1, 2], future: [] }, present: 3 });
  });

  it('record caps depth at MAX_HISTORY', () => {
    let h = emptyHistory<number>();
    for (let i = 0; i < MAX_HISTORY + 10; i++) h = record(h, i);
    expect(h.past).toHaveLength(MAX_HISTORY);
    expect(h.past[0]).toBe(10); // oldest 10 dropped
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run store/history.test.ts`
Expected: FAIL (cannot find module './history').

- [ ] **Step 3: Implement history helpers**

Create `store/history.ts`:

```ts
export const MAX_HISTORY = 100;

export interface History<T> {
  past: T[];
  future: T[];
}

export function emptyHistory<T>(): History<T> {
  return { past: [], future: [] };
}

export function record<T>(h: History<T>, prev: T): History<T> {
  const past = [...h.past, prev].slice(-MAX_HISTORY);
  return { past, future: [] };
}

export function undo<T>(h: History<T>, present: T): { history: History<T>; present: T } | null {
  if (h.past.length === 0) return null;
  const prev = h.past[h.past.length - 1];
  return { history: { past: h.past.slice(0, -1), future: [present, ...h.future] }, present: prev };
}

export function redo<T>(h: History<T>, present: T): { history: History<T>; present: T } | null {
  if (h.future.length === 0) return null;
  const next = h.future[0];
  return { history: { past: [...h.past, present], future: h.future.slice(1) }, present: next };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run store/history.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Write failing store tests for undo/redo + save-state**

Add to `store/useStore.test.ts` (append inside `describe('useStore', …)`):

```ts
  it('undo reverts a structural change; redo re-applies it', () => {
    const s = useStore.getState().addSubject('S');
    const c1 = useStore.getState().addChapter(s, 'C1');
    useStore.getState().addChapter(s, 'C2');
    expect(useStore.getState().subjects[s].chapterIds).toHaveLength(2);
    useStore.getState().undo();
    expect(useStore.getState().subjects[s].chapterIds).toHaveLength(1);
    expect(useStore.getState().subjects[s].chapterIds).toContain(c1);
    useStore.getState().redo();
    expect(useStore.getState().subjects[s].chapterIds).toHaveLength(2);
  });

  it('editing notes does not create an undo entry', () => {
    const s = useStore.getState().addSubject('S');
    const c = useStore.getState().addChapter(s, 'C');
    const t = useStore.getState().addTopic(c, 'T');
    const before = useStore.getState().history.past.length;
    useStore.getState().updateTopicNotes(t, 'hello');
    expect(useStore.getState().history.past.length).toBe(before);
  });

  it('marking a mutation sets saveState to saving', () => {
    useStore.getState().addSubject('S');
    expect(useStore.getState().saveState).toBe('saving');
  });
```

- [ ] **Step 6: Run to verify they fail**

Run: `npx vitest run store/useStore.test.ts`
Expected: FAIL (undo/history/saveState not defined).

- [ ] **Step 7: Wire history + saveState into the store**

In `store/useStore.ts`:

1. Add imports:

```ts
import { emptyHistory, record, undo as undoHistory, redo as redoHistory, type History } from './history';
```

2. Extend `StoreState` with:

```ts
  history: History<AppData>;
  saveState: 'idle' | 'saving' | 'saved';
  undo: () => void;
  redo: () => void;
```

3. Replace the store factory's persist/commit preamble and initial state. Change the top of the `create<StoreState>((set, get) => { … })` body from the Phase 1 version to:

```ts
  const persist = () => {
    set({ saveState: 'saving' } as never);
    void repo.save(snapshot(get())).then(() => set({ saveState: 'saved' } as never));
  };
  // Structural edits: capture an undo snapshot, then apply + persist.
  const commit = (patch: Partial<AppData>) => {
    const prev = snapshot(get());
    set({ ...patch, history: record(get().history, prev) } as never);
    persist();
  };
  // Non-structural edits (notes, mark-revised): apply + persist, no history.
  const commitSilent = (patch: Partial<AppData>) => { set(patch as never); persist(); };

  return {
    subjects: {}, chapters: {}, topics: {}, subjectOrder: [],
    history: emptyHistory<AppData>(),
    saveState: 'idle',
```

4. In `hydrate`, reset history and do not create an undo entry. Replace the `hydrate` body with:

```ts
    hydrate: async () => {
      const loaded = await repo.load();
      if (loaded) { set({ ...loaded, history: emptyHistory<AppData>() } as never); return; }
      const seeded = seedData();
      set({ ...seeded, history: emptyHistory<AppData>() } as never);
      await repo.save(seeded);
    },
```

5. Change `updateTopicNotes` and `markTopicRevised` to call `commitSilent` instead of `commit` (only these two — every other action keeps `commit`).

6. Add the `undo` / `redo` actions (place near the end of the returned object):

```ts
    undo: () => {
      const res = undoHistory(get().history, snapshot(get()));
      if (!res) return;
      set({ ...res.present, history: res.history } as never);
      persist();
    },
    redo: () => {
      const res = redoHistory(get().history, snapshot(get()));
      if (!res) return;
      set({ ...res.present, history: res.history } as never);
      persist();
    },
```

> Reminder: `snapshot(s)` already returns only the four `AppData` keys, so `history` and `saveState` are never persisted and never enter an undo snapshot.

- [ ] **Step 8: Run to verify all store tests pass**

Run: `npx vitest run store/useStore.test.ts store/history.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add store/history.ts store/history.test.ts store/useStore.ts store/useStore.test.ts
git commit -m "feat: add session-only undo/redo history and save-state to the store"
```

---

### Task 5: InlineEditable component

**Files:**
- Create: `components/InlineEditable.tsx`
- Test: `components/InlineEditable.test.tsx`

**Interfaces:**
- Produces: `<InlineEditable value editing onEditingChange onCommit className inputClassName />` where `editing: boolean` and `onEditingChange: (v: boolean) => void` control edit mode; `onCommit: (next: string) => void` fires on a trimmed non-empty Enter/blur.

- [ ] **Step 1: Write the failing component test**

Create `components/InlineEditable.test.tsx`:

```tsx
import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InlineEditable } from './InlineEditable';

it('commits a trimmed value on Enter', async () => {
  const onCommit = vi.fn();
  const onEditingChange = vi.fn();
  render(<InlineEditable value="Old" editing onEditingChange={onEditingChange} onCommit={onCommit} />);
  const input = screen.getByRole('textbox');
  await userEvent.clear(input);
  await userEvent.type(input, '  New Name  {Enter}');
  expect(onCommit).toHaveBeenCalledWith('New Name');
  expect(onEditingChange).toHaveBeenCalledWith(false);
});

it('cancels on Escape without committing', async () => {
  const onCommit = vi.fn();
  const onEditingChange = vi.fn();
  render(<InlineEditable value="Old" editing onEditingChange={onEditingChange} onCommit={onCommit} />);
  await userEvent.type(screen.getByRole('textbox'), 'x{Escape}');
  expect(onCommit).not.toHaveBeenCalled();
  expect(onEditingChange).toHaveBeenCalledWith(false);
});

it('does not commit an empty value', async () => {
  const onCommit = vi.fn();
  render(<InlineEditable value="Old" editing onEditingChange={() => {}} onCommit={onCommit} />);
  const input = screen.getByRole('textbox');
  await userEvent.clear(input);
  await userEvent.type(input, '{Enter}');
  expect(onCommit).not.toHaveBeenCalled();
});

it('renders plain text when not editing', () => {
  render(<InlineEditable value="Shown" editing={false} onEditingChange={() => {}} onCommit={() => {}} />);
  expect(screen.getByText('Shown')).toBeInTheDocument();
  expect(screen.queryByRole('textbox')).toBeNull();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/InlineEditable.test.tsx`
Expected: FAIL (cannot find module './InlineEditable').

- [ ] **Step 3: Implement InlineEditable**

Create `components/InlineEditable.tsx`:

```tsx
'use client';
import { useEffect, useRef, useState } from 'react';

export function InlineEditable({
  value, editing, onEditingChange, onCommit, className, inputClassName,
}: {
  value: string;
  editing: boolean;
  onEditingChange: (v: boolean) => void;
  onCommit: (next: string) => void;
  className?: string;
  inputClassName?: string;
}) {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(value); }, [value, editing]);
  useEffect(() => {
    if (editing) { ref.current?.focus(); ref.current?.select(); }
  }, [editing]);

  const commit = () => {
    const t = draft.trim();
    if (t) onCommit(t);
    onEditingChange(false);
  };
  const cancel = () => { setDraft(value); onEditingChange(false); };

  if (editing) {
    return (
      <input
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        }}
        // Prevent a parent <Link> from navigating while editing.
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
        className={inputClassName ?? 'w-full rounded bg-white/10 px-1 outline-none'}
      />
    );
  }
  return <span className={className}>{value}</span>;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run components/InlineEditable.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add components/InlineEditable.tsx components/InlineEditable.test.tsx
git commit -m "feat: add InlineEditable inline-rename component"
```

---

### Task 6: Wire inline rename + new-item edit mode into cards & pages

**Files:**
- Modify: `components/cards/SubjectCard.tsx`, `components/cards/ChapterCard.tsx`, `components/cards/TopicCard.tsx`
- Modify: `app/page.tsx`, `app/subject/[id]/page.tsx`, `app/chapter/[id]/page.tsx`
- Modify: `components/AddButton.tsx` (no signature change; documented for context)

**Interfaces:**
- Consumes: `InlineEditable`, store rename actions, and the `add*` actions that return the new id.
- Produces: cards accept an optional `autoEdit?: boolean` prop; when true they mount in edit mode. List pages track a `justAddedId` and pass `autoEdit` to the matching card.

- [ ] **Step 1: Update SubjectCard to use InlineEditable**

Replace `components/cards/SubjectCard.tsx` with (adds `editing` state, `autoEdit` prop, InlineEditable title; RowActions rename now toggles edit mode; delete now archives):

```tsx
'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { Subject } from '@/lib/domain/types';
import { useStore } from '@/store/useStore';
import { subjectProgress, subjectStats } from '@/lib/revision/progress';
import { relativeLabel } from '@/lib/revision/engine';
import { RowActions } from '@/components/RowActions';
import { InlineEditable } from '@/components/InlineEditable';

export function SubjectCard({ subject, autoEdit = false }: { subject: Subject; autoEdit?: boolean }) {
  const data = useStore();
  const { renameSubject, archiveSubject } = useStore.getState();
  const [editing, setEditing] = useState(autoEdit);
  useEffect(() => { if (autoEdit) setEditing(true); }, [autoEdit]);
  const now = Date.now();
  const progress = subjectProgress(data, subject.id, now);
  const stats = subjectStats(data, subject.id, now);
  const remove = () => { if (window.confirm(`Archive "${subject.name}"? You can restore it later.`)) archiveSubject(subject.id); };
  return (
    <motion.div whileHover={{ y: -4 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}>
      <Link href={`/subject/${subject.id}`}
        className="group glass block rounded-2xl p-5"
        style={{ boxShadow: `inset 0 0 0 1px ${subject.color}22` }}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold" onDoubleClick={(e) => { e.preventDefault(); setEditing(true); }}>
            <InlineEditable value={subject.name} editing={editing} onEditingChange={setEditing}
              onCommit={(n) => renameSubject(subject.id, n)} />
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-sm opacity-60">{progress}%</span>
            <RowActions onRename={() => setEditing(true)} onDelete={remove} />
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

- [ ] **Step 2: Update ChapterCard**

Replace `components/cards/ChapterCard.tsx` with:

```tsx
'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Chapter } from '@/lib/domain/types';
import { useStore } from '@/store/useStore';
import { chapterProgress } from '@/lib/revision/progress';
import { RowActions } from '@/components/RowActions';
import { InlineEditable } from '@/components/InlineEditable';

export function ChapterCard({ chapter, autoEdit = false }: { chapter: Chapter; autoEdit?: boolean }) {
  const data = useStore();
  const { renameChapter, archiveChapter, duplicateChapter } = useStore.getState();
  const [editing, setEditing] = useState(autoEdit);
  useEffect(() => { if (autoEdit) setEditing(true); }, [autoEdit]);
  const progress = chapterProgress(data, chapter.id, Date.now());
  const remove = () => { if (window.confirm(`Archive "${chapter.name}"? You can restore it later.`)) archiveChapter(chapter.id); };
  const activeTopics = chapter.topicIds.filter((tid) => data.topics[tid] && !data.topics[tid].archivedAt).length;
  return (
    <Link href={`/chapter/${chapter.id}`} className="group glass flex items-center justify-between rounded-xl p-4">
      <div onDoubleClick={(e) => { e.preventDefault(); setEditing(true); }}>
        <div className="font-medium">
          <InlineEditable value={chapter.name} editing={editing} onEditingChange={setEditing}
            onCommit={(n) => renameChapter(chapter.id, n)} />
        </div>
        <div className="mt-1 text-xs opacity-60">{activeTopics} topic{activeTopics === 1 ? '' : 's'} · {progress}% · {chapter.difficulty} · {chapter.priority}</div>
      </div>
      <RowActions onRename={() => setEditing(true)} onDelete={remove} onDuplicate={() => duplicateChapter(chapter.id)} />
    </Link>
  );
}
```

- [ ] **Step 3: Update TopicCard**

Replace `components/cards/TopicCard.tsx` with:

```tsx
'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Topic } from '@/lib/domain/types';
import { useStore } from '@/store/useStore';
import { badgeState, totalRevisions, lastRevisedAt, relativeLabel } from '@/lib/revision/engine';
import { RevisionBadge } from '@/components/RevisionBadge';
import { RowActions } from '@/components/RowActions';
import { InlineEditable } from '@/components/InlineEditable';

export function TopicCard({ topic, autoEdit = false }: { topic: Topic; autoEdit?: boolean }) {
  const { renameTopic, archiveTopic } = useStore.getState();
  const [editing, setEditing] = useState(autoEdit);
  useEffect(() => { if (autoEdit) setEditing(true); }, [autoEdit]);
  const now = Date.now();
  const last = lastRevisedAt(topic.revisionHistory);
  const remove = () => { if (window.confirm(`Archive "${topic.title}"? You can restore it later.`)) archiveTopic(topic.id); };
  return (
    <Link href={`/topic/${topic.id}`} className="group glass flex items-center justify-between rounded-xl p-4">
      <div onDoubleClick={(e) => { e.preventDefault(); setEditing(true); }}>
        <div className="font-medium">
          <InlineEditable value={topic.title} editing={editing} onEditingChange={setEditing}
            onCommit={(n) => renameTopic(topic.id, n)} />
        </div>
        <div className="mt-1 text-xs opacity-60">
          {totalRevisions(topic.revisionHistory)} revisions · {last ? relativeLabel(last, now) : 'not revised yet'}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <RevisionBadge state={badgeState(topic.revisionHistory, now)} />
        <RowActions onRename={() => setEditing(true)} onDelete={remove} />
      </div>
    </Link>
  );
}
```

- [ ] **Step 4: Track just-added items in the dashboard page**

Replace `app/page.tsx` with (adds `justAddedId`, passes `autoEdit`):

```tsx
'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '@/store/useStore';
import { SubjectCard } from '@/components/cards/SubjectCard';
import { AddButton } from '@/components/AddButton';

export default function DashboardPage() {
  const subjectOrder = useStore((s) => s.subjectOrder);
  const subjects = useStore((s) => s.subjects);
  const addSubject = useStore((s) => s.addSubject);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Subjects</h1>
        <AddButton label="Subject" onAdd={(name) => setJustAddedId(addSubject(name))} />
      </div>
      <motion.div layout className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {subjectOrder.map((id) => subjects[id] && !subjects[id].archivedAt && (
          <SubjectCard key={id} subject={subjects[id]} autoEdit={id === justAddedId} />
        ))}
      </motion.div>
    </div>
  );
}
```

> Note: `AddButton` still prompts for a name (Task unchanged). New-item edit mode means the created card also opens inline so the name can be refined; the two coexist. `AddButton`'s `onAdd` now receives the returned id via `addSubject(name)`.

- [ ] **Step 5: Filter archived + track just-added in the subject page**

Replace `app/subject/[id]/page.tsx` with:

```tsx
'use client';
import { use, useState } from 'react';
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
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  if (!subject) return notFound();
  return (
    <div>
      <Breadcrumb items={[{ label: 'Subjects', href: '/' }, { label: subject.name }]} />
      <div className="mb-6 mt-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{subject.name}</h1>
        <AddButton label="Chapter" onAdd={(name) => setJustAddedId(addChapter(id, name))} />
      </div>
      <div className="grid gap-3">
        {subject.chapterIds.map((cid) => chapters[cid] && !chapters[cid].archivedAt && (
          <ChapterCard key={cid} chapter={chapters[cid]} autoEdit={cid === justAddedId} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Filter archived + track just-added in the chapter page**

Replace `app/chapter/[id]/page.tsx` with:

```tsx
'use client';
import { use, useState } from 'react';
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
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
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
        <AddButton label="Topic" onAdd={(title) => setJustAddedId(addTopic(id, title))} />
      </div>
      <div className="grid gap-3">
        {chapter.topicIds.map((tid) => topics[tid] && !topics[tid].archivedAt && (
          <TopicCard key={tid} topic={topics[tid]} autoEdit={tid === justAddedId} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Verify tests + build**

Run: `npx vitest run && npm run build`
Expected: all tests PASS; build succeeds.

- [ ] **Step 8: Commit**

```bash
git add app components
git commit -m "feat: inline rename across cards/pages, archive from row menu, filter archived lists"
```

---

### Task 7: Archive view page

**Files:**
- Create: `app/archive/page.tsx`
- Modify: `components/layout/AppShell.tsx` (add an Archive link)
- Test: `app/archive/ArchivePage.test.tsx`

**Interfaces:**
- Consumes: `useStore` (archived entities + `restore*` / `purge*`).
- Produces: `/archive` route listing archived subjects, chapters, and topics with Restore and Delete-permanently actions.

- [ ] **Step 1: Write a failing archive-view test**

Create `app/archive/ArchivePage.test.tsx`:

```tsx
import { it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ArchivePage from './page';
import { useStore } from '@/store/useStore';

beforeEach(() => useStore.setState({ subjects: {}, chapters: {}, topics: {}, subjectOrder: [] }));

it('lists archived items and shows an empty state otherwise', () => {
  const s = useStore.getState().addSubject('Archived Subject');
  useStore.getState().archiveSubject(s);
  render(<ArchivePage />);
  expect(screen.getByText('Archived Subject')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /restore/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run app/archive/ArchivePage.test.tsx`
Expected: FAIL (cannot find module './page').

- [ ] **Step 3: Implement the archive page**

Create `app/archive/page.tsx`:

```tsx
'use client';
import { useStore } from '@/store/useStore';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { RotateCcw, Trash2 } from 'lucide-react';

export default function ArchivePage() {
  const data = useStore();
  const store = useStore.getState();

  const subjects = Object.values(data.subjects).filter((s) => s.archivedAt);
  const chapters = Object.values(data.chapters).filter((c) => c.archivedAt);
  const topics = Object.values(data.topics).filter((t) => t.archivedAt);
  const empty = subjects.length + chapters.length + topics.length === 0;

  const Row = ({ label, kind, onRestore, onPurge }: {
    label: string; kind: string; onRestore: () => void; onPurge: () => void;
  }) => (
    <div className="glass flex items-center justify-between rounded-xl p-4">
      <div>
        <div className="font-medium">{label}</div>
        <div className="mt-1 text-xs opacity-50">{kind}</div>
      </div>
      <div className="flex items-center gap-1">
        <button aria-label="Restore" onClick={onRestore} className="flex items-center gap-1 rounded p-1.5 text-sm hover:bg-white/10"><RotateCcw size={15} /> Restore</button>
        <button aria-label="Delete permanently" onClick={onPurge} className="rounded p-1.5 hover:bg-white/10"><Trash2 size={15} /></button>
      </div>
    </div>
  );

  return (
    <div>
      <Breadcrumb items={[{ label: 'Subjects', href: '/' }, { label: 'Archive' }]} />
      <h1 className="mb-6 mt-4 text-2xl font-bold">Archive</h1>
      {empty ? (
        <p className="text-sm opacity-50">Nothing archived. Items you archive appear here to restore or delete permanently.</p>
      ) : (
        <div className="grid gap-3">
          {subjects.map((s) => (
            <Row key={s.id} label={s.name} kind="Subject"
              onRestore={() => store.restoreSubject(s.id)}
              onPurge={() => { if (window.confirm(`Permanently delete "${s.name}" and everything in it?`)) store.deleteSubject(s.id); }} />
          ))}
          {chapters.map((c) => (
            <Row key={c.id} label={c.name} kind="Chapter"
              onRestore={() => store.restoreChapter(c.id)}
              onPurge={() => { if (window.confirm(`Permanently delete "${c.name}" and its topics?`)) store.deleteChapter(c.id); }} />
          ))}
          {topics.map((t) => (
            <Row key={t.id} label={t.title} kind="Topic"
              onRestore={() => store.restoreTopic(t.id)}
              onPurge={() => { if (window.confirm(`Permanently delete "${t.title}"?`)) store.deleteTopic(t.id); }} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add an Archive link to the shell header**

In `components/layout/AppShell.tsx`, add an archive link between the title and the theme toggle. Replace the `<header>` block with:

```tsx
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-black/20 px-6 py-4 backdrop-blur">
        <Link href="/" className="text-lg font-semibold tracking-tight">CE Revision</Link>
        <div className="flex items-center gap-3">
          <Link href="/archive" className="text-sm opacity-70 transition hover:opacity-100">Archive</Link>
          <ThemeToggle />
        </div>
      </header>
```

- [ ] **Step 5: Run test + build**

Run: `npx vitest run app/archive/ArchivePage.test.tsx && npm run build`
Expected: test PASS; build succeeds (new `/archive` route appears).

- [ ] **Step 6: Commit**

```bash
git add app components
git commit -m "feat: add archive view with restore and permanent-delete"
```

---

### Task 8: Drag-and-drop provider + within-list reorder

**Files:**
- Create: `components/dnd/DndProvider.tsx`
- Create: `components/dnd/ids.ts`
- Create: `components/dnd/SortableRow.tsx`
- Test: `components/dnd/ids.test.ts`
- Modify: `app/layout.tsx` (wrap with `DndProvider`)
- Modify: `app/page.tsx`, `app/subject/[id]/page.tsx`, `app/chapter/[id]/page.tsx` (wrap lists in `SortableContext`)

**Interfaces:**
- Produces:
  - `ids.ts`: `dragId(type: 'subject'|'chapter'|'topic', id: string): string`; `nodeId(type: 'subject'|'chapter', id: string): string`; `parseId(raw: string): { kind: string; id: string }`.
  - `<DndProvider>`: shell-level `DndContext` whose `onDragEnd` routes to store reorder/move actions.
  - `<SortableRow id>`: wraps a list item, providing a drag handle (grip) and sortable transforms.

- [ ] **Step 1: Write the failing id-helpers test**

Create `components/dnd/ids.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { dragId, nodeId, parseId } from './ids';

describe('dnd ids', () => {
  it('round-trips a draggable id', () => {
    expect(parseId(dragId('topic', 'abc'))).toEqual({ kind: 'topic', id: 'abc' });
  });
  it('round-trips a tree node id', () => {
    expect(parseId(nodeId('chapter', 'xyz'))).toEqual({ kind: 'chapter-node', id: 'xyz' });
  });
  it('keeps ids containing colons intact', () => {
    expect(parseId(dragId('subject', 'a:b:c'))).toEqual({ kind: 'subject', id: 'a:b:c' });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/dnd/ids.test.ts`
Expected: FAIL (cannot find module './ids').

- [ ] **Step 3: Implement id helpers**

Create `components/dnd/ids.ts`:

```ts
type DragType = 'subject' | 'chapter' | 'topic';
type NodeType = 'subject' | 'chapter';

export function dragId(type: DragType, id: string): string {
  return `${type}:${id}`;
}
export function nodeId(type: NodeType, id: string): string {
  return `${type}-node:${id}`;
}
export function parseId(raw: string): { kind: string; id: string } {
  const i = raw.indexOf(':');
  return { kind: raw.slice(0, i), id: raw.slice(i + 1) };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run components/dnd/ids.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Implement the SortableRow wrapper**

Create `components/dnd/SortableRow.tsx`:

```tsx
'use client';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

export function SortableRow({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="flex items-stretch gap-2">
      <button
        aria-label="Drag to reorder"
        className="flex cursor-grab touch-none items-center px-1 opacity-30 transition hover:opacity-70 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} />
      </button>
      <div className="flex-1">{children}</div>
    </div>
  );
}
```

> `@dnd-kit/utilities` ships as a dependency of `@dnd-kit/sortable`; no extra install is needed.

- [ ] **Step 6: Implement DndProvider**

Create `components/dnd/DndProvider.tsx`:

```tsx
'use client';
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { useStore } from '@/store/useStore';
import { parseId } from './ids';

export function DndProvider({ children }: { children: React.ReactNode }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const a = parseId(String(active.id));
    const o = parseId(String(over.id));
    const s = useStore.getState();

    // Cross-move onto a sidebar tree node.
    if (o.kind === 'chapter-node' && a.kind === 'topic') { s.moveTopic(a.id, o.id); return; }
    if (o.kind === 'subject-node' && a.kind === 'chapter') { s.moveChapter(a.id, o.id); return; }

    // Within-list reorder: active and over are the same entity type.
    if (a.kind === o.kind) {
      if (a.kind === 'subject') s.reorderSubjects(a.id, o.id);
      else if (a.kind === 'chapter') s.reorderChapters(a.id, o.id);
      else if (a.kind === 'topic') s.reorderTopics(a.id, o.id);
    }
  }

  return <DndContext sensors={sensors} onDragEnd={onDragEnd}>{children}</DndContext>;
}
```

- [ ] **Step 7: Wrap the app in DndProvider**

In `app/layout.tsx`, import and nest `DndProvider` inside `StoreHydrator`, around `AppShell`. Replace the body JSX:

```tsx
import { DndProvider } from '@/components/dnd/DndProvider';
// …
        <StoreHydrator>
          <DndProvider>
            <AppShell>{children}</AppShell>
          </DndProvider>
        </StoreHydrator>
```

- [ ] **Step 8: Make the three lists sortable**

In each list page, wrap the mapped cards in a `SortableContext` and wrap each card in `SortableRow`.

`app/page.tsx` — replace the `motion.div` grid with:

```tsx
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import { SortableRow } from '@/components/dnd/SortableRow';
import { dragId } from '@/components/dnd/ids';
// … inside the component return, replace the grid:
      <SortableContext items={subjectOrder.filter((id) => subjects[id] && !subjects[id].archivedAt).map((id) => dragId('subject', id))} strategy={rectSortingStrategy}>
        <motion.div layout className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {subjectOrder.map((id) => subjects[id] && !subjects[id].archivedAt && (
            <SortableRow key={id} id={dragId('subject', id)}>
              <SubjectCard subject={subjects[id]} autoEdit={id === justAddedId} />
            </SortableRow>
          ))}
        </motion.div>
      </SortableContext>
```

`app/subject/[id]/page.tsx` — replace the chapter grid with:

```tsx
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableRow } from '@/components/dnd/SortableRow';
import { dragId } from '@/components/dnd/ids';
// … replace the grid:
      <SortableContext items={subject.chapterIds.filter((cid) => chapters[cid] && !chapters[cid].archivedAt).map((cid) => dragId('chapter', cid))} strategy={verticalListSortingStrategy}>
        <div className="grid gap-3">
          {subject.chapterIds.map((cid) => chapters[cid] && !chapters[cid].archivedAt && (
            <SortableRow key={cid} id={dragId('chapter', cid)}>
              <ChapterCard chapter={chapters[cid]} autoEdit={cid === justAddedId} />
            </SortableRow>
          ))}
        </div>
      </SortableContext>
```

`app/chapter/[id]/page.tsx` — replace the topic grid with:

```tsx
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableRow } from '@/components/dnd/SortableRow';
import { dragId } from '@/components/dnd/ids';
// … replace the grid:
      <SortableContext items={chapter.topicIds.filter((tid) => topics[tid] && !topics[tid].archivedAt).map((tid) => dragId('topic', tid))} strategy={verticalListSortingStrategy}>
        <div className="grid gap-3">
          {chapter.topicIds.map((tid) => topics[tid] && !topics[tid].archivedAt && (
            <SortableRow key={tid} id={dragId('topic', tid)}>
              <TopicCard topic={topics[tid]} autoEdit={tid === justAddedId} />
            </SortableRow>
          ))}
        </div>
      </SortableContext>
```

- [ ] **Step 9: Verify tests + build + manual reorder**

Run: `npx vitest run && npm run build`
Expected: all tests PASS; build succeeds.
Then `npm run dev`, open a chapter with ≥2 topics, and drag by the grip handle to reorder; confirm the order persists across reload.

- [ ] **Step 10: Commit**

```bash
git add app components
git commit -m "feat: drag-and-drop reorder within subject/chapter/topic lists"
```

---

### Task 9: Sidebar tree + cross-hierarchy move

**Files:**
- Create: `components/layout/SidebarTree.tsx`
- Create: `components/dnd/DroppableNode.tsx`
- Modify: `components/layout/AppShell.tsx` (mount the sidebar)

**Interfaces:**
- Consumes: `useStore`, `nodeId` from `@/components/dnd/ids`, the `DndContext` from Task 8.
- Produces: a persistent, collapsible left sidebar whose Subject/Chapter nodes are droppable targets for cross-moves; `<DroppableNode id>` marks an element as a drop target that highlights on hover.

- [ ] **Step 1: Implement DroppableNode**

Create `components/dnd/DroppableNode.tsx`:

```tsx
'use client';
import { useDroppable } from '@dnd-kit/core';

export function DroppableNode({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={isOver ? 'rounded bg-sky-500/20 ring-1 ring-sky-400/50' : 'rounded'}>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Implement SidebarTree**

Create `components/layout/SidebarTree.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, ChevronDown, PanelLeftClose, PanelLeft } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { DroppableNode } from '@/components/dnd/DroppableNode';
import { nodeId } from '@/components/dnd/ids';

export function SidebarTree() {
  const data = useStore();
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => { setCollapsed(localStorage.getItem('ce-sidebar') === 'closed'); }, []);
  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('ce-sidebar', next ? 'closed' : 'open');
  };
  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }));

  if (collapsed) {
    return (
      <button onClick={toggleCollapsed} aria-label="Open sidebar"
        className="sticky top-[65px] h-fit rounded-lg border border-white/10 p-2 opacity-70 hover:opacity-100">
        <PanelLeft size={16} />
      </button>
    );
  }

  const subjects = data.subjectOrder.map((id) => data.subjects[id]).filter((s) => s && !s.archivedAt);

  return (
    <aside className="sticky top-[65px] hidden h-[calc(100vh-65px)] w-64 shrink-0 overflow-y-auto border-r border-white/10 p-3 text-sm md:block">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide opacity-40">Navigator</span>
        <button onClick={toggleCollapsed} aria-label="Collapse sidebar" className="opacity-50 hover:opacity-100"><PanelLeftClose size={15} /></button>
      </div>
      <ul className="space-y-0.5">
        {subjects.map((subject) => {
          const chapters = subject.chapterIds.map((cid) => data.chapters[cid]).filter((c) => c && !c.archivedAt);
          return (
            <li key={subject.id}>
              <DroppableNode id={nodeId('subject', subject.id)}>
                <div className="flex items-center gap-1 rounded px-1 py-1 hover:bg-white/5">
                  <button onClick={() => toggle(subject.id)} className="opacity-60" aria-label="Toggle">
                    {open[subject.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  <Link href={`/subject/${subject.id}`} className="truncate">{subject.name}</Link>
                </div>
              </DroppableNode>
              {open[subject.id] && (
                <ul className="ml-4 space-y-0.5 border-l border-white/10 pl-2">
                  {chapters.map((chapter) => {
                    const topics = chapter.topicIds.map((tid) => data.topics[tid]).filter((t) => t && !t.archivedAt);
                    return (
                      <li key={chapter.id}>
                        <DroppableNode id={nodeId('chapter', chapter.id)}>
                          <div className="flex items-center gap-1 rounded px-1 py-1 hover:bg-white/5">
                            <button onClick={() => toggle(chapter.id)} className="opacity-60" aria-label="Toggle">
                              {open[chapter.id] ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                            </button>
                            <Link href={`/chapter/${chapter.id}`} className="truncate">{chapter.name}</Link>
                          </div>
                        </DroppableNode>
                        {open[chapter.id] && (
                          <ul className="ml-4 space-y-0.5 border-l border-white/10 pl-2">
                            {topics.map((topic) => (
                              <li key={topic.id} className="truncate rounded px-1 py-0.5 hover:bg-white/5">
                                <Link href={`/topic/${topic.id}`}>{topic.title}</Link>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
```

- [ ] **Step 3: Mount the sidebar in the shell layout**

Replace `components/layout/AppShell.tsx` with (adds a two-column body: sidebar + main):

```tsx
import Link from 'next/link';
import { ThemeToggle } from './ThemeToggle';
import { SidebarTree } from './SidebarTree';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-black/20 px-6 py-4 backdrop-blur">
        <Link href="/" className="text-lg font-semibold tracking-tight">CE Revision</Link>
        <div className="flex items-center gap-3">
          <Link href="/archive" className="text-sm opacity-70 transition hover:opacity-100">Archive</Link>
          <ThemeToggle />
        </div>
      </header>
      <div className="mx-auto flex max-w-7xl gap-4 px-4">
        <SidebarTree />
        <main className="min-w-0 flex-1 px-2 py-8">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify tests + build + manual cross-move**

Run: `npx vitest run && npm run build`
Expected: all tests PASS; build succeeds.
Then `npm run dev`: expand a subject in the sidebar; from a chapter page, drag a topic by its grip onto a different chapter node in the sidebar; confirm it reparents (leaves the old list, appears under the new chapter) and persists on reload.

- [ ] **Step 5: Commit**

```bash
git add app components
git commit -m "feat: sidebar navigator tree with drag-to-reparent cross-moves"
```

---

### Task 10: Undo/redo header controls + keyboard shortcuts + save pill

**Files:**
- Create: `components/layout/HeaderControls.tsx`
- Create: `components/hooks/useUndoRedoShortcuts.ts`
- Modify: `components/layout/AppShell.tsx` (mount controls + shortcuts)

**Interfaces:**
- Consumes: `useStore` (`undo`, `redo`, `history`, `saveState`).
- Produces: header Undo/Redo buttons (disabled when their stack is empty) + a "Saving…/Saved" pill; a keyboard hook binding Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z (and Ctrl+Y), ignored while typing in a field.

- [ ] **Step 1: Implement the keyboard hook**

Create `components/hooks/useUndoRedoShortcuts.ts`:

```ts
'use client';
import { useEffect } from 'react';
import { useStore } from '@/store/useStore';

function isTypingTarget(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null;
  if (!node) return false;
  const tag = node.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || node.isContentEditable;
}

export function useUndoRedoShortcuts() {
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (isTypingTarget(e.target)) return; // let native text undo win in fields
      if (key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((key === 'z' && e.shiftKey) || key === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);
}
```

- [ ] **Step 2: Implement HeaderControls**

Create `components/layout/HeaderControls.tsx`:

```tsx
'use client';
import { Undo2, Redo2, Check, Loader2 } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { useUndoRedoShortcuts } from '@/components/hooks/useUndoRedoShortcuts';

export function HeaderControls() {
  useUndoRedoShortcuts();
  const canUndo = useStore((s) => s.history.past.length > 0);
  const canRedo = useStore((s) => s.history.future.length > 0);
  const saveState = useStore((s) => s.saveState);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  return (
    <div className="flex items-center gap-2">
      {saveState !== 'idle' && (
        <span className="flex items-center gap-1 text-xs opacity-60">
          {saveState === 'saving' ? <><Loader2 size={13} className="animate-spin" /> Saving…</> : <><Check size={13} /> Saved</>}
        </span>
      )}
      <button aria-label="Undo" disabled={!canUndo} onClick={undo}
        className="rounded-lg border border-white/10 p-2 transition hover:bg-white/5 disabled:opacity-30"><Undo2 size={16} /></button>
      <button aria-label="Redo" disabled={!canRedo} onClick={redo}
        className="rounded-lg border border-white/10 p-2 transition hover:bg-white/5 disabled:opacity-30"><Redo2 size={16} /></button>
    </div>
  );
}
```

- [ ] **Step 3: Mount controls in the header**

In `components/layout/AppShell.tsx`, import `HeaderControls` and place it in the header's right-hand group, before the Archive link:

```tsx
import { HeaderControls } from './HeaderControls';
// … in the header's right-side div:
        <div className="flex items-center gap-3">
          <HeaderControls />
          <Link href="/archive" className="text-sm opacity-70 transition hover:opacity-100">Archive</Link>
          <ThemeToggle />
        </div>
```

- [ ] **Step 4: Verify tests + build + manual undo**

Run: `npx vitest run && npm run build`
Expected: all tests PASS; build succeeds.
Then `npm run dev`: add a chapter, press Ctrl/Cmd+Z → it disappears; Shift+Ctrl/Cmd+Z → it returns. While typing in the notes textarea, Cmd+Z edits text (does not undo a structural change).

- [ ] **Step 5: Commit**

```bash
git add components
git commit -m "feat: undo/redo header controls, keyboard shortcuts, and save pill"
```

---

### Task 11: Premium visual pass + final verification

**Files:**
- Create: `app/template.tsx`
- Modify: `app/globals.css` (gradient-border + tokens)
- Modify: `components/cards/SubjectCard.tsx` (apply gradient border)

**Interfaces:**
- Consumes: framer-motion.
- Produces: route transitions via `template.tsx`; a `.gradient-border` utility; subtle entrance/hover polish.

- [ ] **Step 1: Add route transitions**

Create `app/template.tsx` (App Router re-mounts `template` on navigation, so it animates route changes):

```tsx
'use client';
import { motion } from 'framer-motion';

export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}
```

- [ ] **Step 2: Add gradient-border + token styles**

Append to `app/globals.css`:

```css
/* Gradient border via double background (padding-box + border-box). */
.gradient-border {
  border: 1px solid transparent;
  background:
    linear-gradient(var(--card-bg, rgba(20,20,22,0.6)), var(--card-bg, rgba(20,20,22,0.6))) padding-box,
    linear-gradient(135deg, rgba(255,255,255,0.18), rgba(255,255,255,0.02)) border-box;
}
@media (prefers-color-scheme: light) {
  .gradient-border { --card-bg: rgba(255,255,255,0.7); }
}
```

- [ ] **Step 3: Apply the gradient border to Subject cards**

In `components/cards/SubjectCard.tsx`, add the `gradient-border` class to the `<Link>`'s className (change `"group glass block rounded-2xl p-5"` to `"group glass gradient-border block rounded-2xl p-5"`).

- [ ] **Step 4: Verify build + full suite**

Run: `npx vitest run && npm run build`
Expected: all tests PASS (unchanged count from Task 10); build succeeds.

- [ ] **Step 5: Manual end-to-end acceptance (Phase 2)**

Run `npm run dev` and confirm the full Phase 2 path:
1. Add a subject → its card opens in inline edit; type a name, Enter.
2. Drill in, add two chapters; drag by the grip to reorder them; reload → order persists.
3. Expand the subject in the sidebar; drag a chapter onto another subject node → it reparents; reload → persists.
4. Add a topic, write notes; in the notes textarea Cmd/Ctrl+Z edits text (no structural undo).
5. Archive a topic from its row menu → it leaves the list and appears under `/archive`; Restore → it returns; Delete-permanently → gone.
6. Press the header Undo/Redo buttons and Ctrl/Cmd+Z / Shift+Ctrl/Cmd+Z across a few structural edits; the save pill flashes "Saving… / Saved".
7. Toggle the sidebar collapse and the theme; both persist across reload.

- [ ] **Step 6: Commit**

```bash
git add app components
git commit -m "feat: premium visual pass — route transitions and gradient-border cards"
```

---

## Phase 2 Complete

All spec tracks are delivered: inline rename everywhere (new items open in edit mode), drag-and-drop reorder within lists plus drag-to-reparent via the sidebar tree, soft-archive with a restore/purge view, session-only undo/redo with keyboard shortcuts and header controls, an autosave status pill, and a premium visual pass. Correctness-critical logic (archive, reorder, move, undo/redo, archived-aware selectors) is unit-tested; dnd wiring is verified by build and the manual acceptance path.

**Deferred to later phases (per the design spec):** rich topic editor (LaTeX/images/tables/attachments), built-in and custom filters, global search, statistics/heatmap/streaks, calendar, notifications, authentication, cloud sync, AI/SM-2.
