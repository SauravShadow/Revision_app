# Phase 4: Filters & Search — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the library navigable — tags (with built-ins), a filter bar (status + tag chips) on subject/chapter pages plus a global `/filtered` view, and a Cmd/Ctrl+K command palette searching everything — without new dependencies.

**Architecture:** Tags are persisted domain data on `AppData` (undoable via `commit`); the active filter selection is ephemeral state in a separate non-persisted `useFilters` store. All matching/search logic is pure and unit-tested; the UI is thin over it. Built-in tags are seeded fresh and backfilled onto existing snapshots on hydrate.

**Tech Stack:** Next.js 15 + React 19 + TypeScript, Zustand, Vitest + Testing Library. No new runtime deps.

## Global Constraints

- **Node:** 18.19; pinned toolchain from Phase 1 stays. No new dependencies.
- **`tags` / `tagOrder` are OPTIONAL on `AppData`** (`tags?`, `tagOrder?`) — keeps existing AppData literals/fixtures and old snapshots valid. The store's runtime state always holds concrete `{}` / `[]`; readers guard with `?? {}` / `?? []`.
- **Tags persist & are undoable** (via `commit`). **Filter selection does NOT persist** (separate `useFilters` store; never in the snapshot or undo history).
- **AND filter semantics** — a topic matches when it satisfies every active status and contains every active tag id. Archived topics never match.
- **`/filtered` pre-activation via the store**, not URL params — the palette/tag chips call `useFilters` then navigate (avoids `useSearchParams`/Suspense).
- **IDs** via `makeId()`. All new mutations via the store's `commit`.
- **Built-in tags:** Formula, PYQ, Weak, Important, Revise Again.

---

### Task 1: Tag model + built-ins + seed/backfill

**Files:**
- Modify: `lib/domain/types.ts`
- Create: `lib/domain/builtinTags.ts`
- Test: `lib/domain/builtinTags.test.ts`
- Modify: `lib/repository/seed.ts`
- Modify: `lib/repository/seed.test.ts`
- Modify: `store/useStore.ts` (snapshot + hydrate + initial state)

**Interfaces:**
- Produces: `Tag`; `AppData.tags?`, `AppData.tagOrder?`; `Topic.tagIds?`; `BUILTIN_TAGS`, `makeBuiltinTags()`, `withBuiltinTagsIfMissing(data)`. `seedData()` now includes built-in tags. The store initialises and persists `tags`/`tagOrder`.

- [ ] **Step 1: Add the Tag type + AppData/Topic fields**

In `lib/domain/types.ts`, add the `Tag` interface (near `Subject`) and the optional fields:

```ts
export interface Tag {
  id: string;
  name: string;
  color: string;
  icon: string;
  description?: string;
  order: number;
}
```

Add to `AppData` (optional):

```ts
  tags?: Record<string, Tag>;
  tagOrder?: string[];
```

Add to `Topic` (after `bookmarkedAt?`):

```ts
  tagIds?: string[];
```

- [ ] **Step 2: Write the failing built-ins test**

Create `lib/domain/builtinTags.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { BUILTIN_TAGS, makeBuiltinTags, withBuiltinTagsIfMissing } from './builtinTags';
import type { AppData } from './types';

const emptyData = (): AppData => ({ subjects: {}, chapters: {}, topics: {}, subjectOrder: [] });

describe('builtin tags', () => {
  it('makeBuiltinTags returns one tag per builtin with matching order', () => {
    const { tags, tagOrder } = makeBuiltinTags();
    expect(tagOrder).toHaveLength(BUILTIN_TAGS.length);
    expect(Object.keys(tags)).toHaveLength(BUILTIN_TAGS.length);
    expect(tagOrder.map((id) => tags[id].name)).toEqual(BUILTIN_TAGS.map((t) => t.name));
  });
  it('backfills built-ins only when tagOrder is absent', () => {
    const old = emptyData(); // no tagOrder field
    expect(withBuiltinTagsIfMissing(old).tagOrder).toHaveLength(BUILTIN_TAGS.length);
    const emptied: AppData = { ...emptyData(), tags: {}, tagOrder: [] };
    expect(withBuiltinTagsIfMissing(emptied).tagOrder).toEqual([]); // user emptied — untouched
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run lib/domain/builtinTags.test.ts`
Expected: FAIL (cannot find module './builtinTags').

- [ ] **Step 4: Implement built-ins**

Create `lib/domain/builtinTags.ts`:

```ts
import type { AppData, Tag } from './types';
import { makeId } from './id';

export const BUILTIN_TAGS: { name: string; color: string; icon: string }[] = [
  { name: 'Formula', color: '#f59e0b', icon: 'Sigma' },
  { name: 'PYQ', color: '#8b5cf6', icon: 'FileQuestion' },
  { name: 'Weak', color: '#ef4444', icon: 'TriangleAlert' },
  { name: 'Important', color: '#10b981', icon: 'Star' },
  { name: 'Revise Again', color: '#0ea5e9', icon: 'RotateCcw' },
];

export function makeBuiltinTags(): { tags: Record<string, Tag>; tagOrder: string[] } {
  const tags: Record<string, Tag> = {};
  const tagOrder: string[] = [];
  BUILTIN_TAGS.forEach((t, i) => {
    const id = makeId();
    tags[id] = { id, name: t.name, color: t.color, icon: t.icon, order: i };
    tagOrder.push(id);
  });
  return { tags, tagOrder };
}

// Backfill built-in tags for snapshots saved before tags existed
// (tagOrder absent). A user who deliberately emptied their tags keeps [].
export function withBuiltinTagsIfMissing(data: AppData): AppData {
  if (data.tagOrder === undefined) return { ...data, ...makeBuiltinTags() };
  return data;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run lib/domain/builtinTags.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Seed built-in tags for fresh installs**

In `lib/repository/seed.ts`, import and include the built-ins. Add the import:

```ts
import { makeBuiltinTags } from '@/lib/domain/builtinTags';
```

Change the final `return` of `seedData()` from:

```ts
  return { subjects, chapters, topics, subjectOrder };
```

to:

```ts
  const { tags, tagOrder } = makeBuiltinTags();
  return { subjects, chapters, topics, subjectOrder, tags, tagOrder };
```

- [ ] **Step 7: Extend the seed test**

Add to `lib/repository/seed.test.ts` (inside `describe('seedData', …)`):

```ts
  it('seeds the built-in tags', () => {
    const data = seedData();
    expect(data.tagOrder?.length).toBeGreaterThan(0);
    const names = Object.values(data.tags ?? {}).map((t) => t.name);
    expect(names).toContain('Formula');
    expect(names).toContain('PYQ');
  });
```

- [ ] **Step 8: Wire tags into the store (state, snapshot, hydrate)**

In `store/useStore.ts`:

1. Extend the type import: add `Tag` —
   `import type { AppData, Attachment, Chapter, Flashcard, Subject, Tag, Topic } from '@/lib/domain/types';`
   and add `import { withBuiltinTagsIfMissing } from '@/lib/domain/builtinTags';`
2. Add to `StoreState` (after the AppData shape is implied by `extends AppData`, tags are already part of AppData; no interface line needed since they're optional on AppData — but add them explicitly so the store always has concrete values):

   In the `StoreState` interface add nothing new for shape (AppData covers it). Ensure the returned initial state includes concrete values.
3. Update `snapshot`:

```ts
function snapshot(s: StoreState): AppData {
  return { subjects: s.subjects, chapters: s.chapters, topics: s.topics, subjectOrder: s.subjectOrder, tags: s.tags ?? {}, tagOrder: s.tagOrder ?? [] };
}
```

4. Update the initial returned state to include `tags: {}, tagOrder: []` (next to `subjects: {}, …`):

```ts
    subjects: {}, chapters: {}, topics: {}, subjectOrder: [],
    tags: {}, tagOrder: [],
    history: emptyHistory<AppData>(),
    saveState: 'idle',
```

5. Update `hydrate` to normalize + backfill:

```ts
    hydrate: async () => {
      const loaded = await repo.load();
      if (loaded) { set({ ...withBuiltinTagsIfMissing(loaded), history: emptyHistory<AppData>() } as never); return; }
      const seeded = seedData();
      set({ ...seeded, history: emptyHistory<AppData>() } as never);
      await repo.save(seeded);
    },
```

- [ ] **Step 9: Run the full suite**

Run: `npx vitest run`
Expected: all tests PASS (existing + new built-ins/seed tests).

- [ ] **Step 10: Commit**

```bash
git add lib/domain store/useStore.ts lib/repository/seed.ts lib/repository/seed.test.ts
git commit -m "feat: Tag model, built-in tags, and seed/hydrate backfill"
```

---

### Task 2: Tag store actions

**Files:**
- Modify: `store/useStore.ts`
- Test: `store/useStore.test.ts` (extend)

**Interfaces:**
- Produces (via `commit`): `addTag(name, color, icon, description?): string`; `updateTag(id, patch)`; `deleteTag(id)` (also strips the id from every topic's `tagIds`); `toggleTopicTag(topicId, tagId)`.

- [ ] **Step 1: Write failing store tests**

Add to `store/useStore.test.ts` (inside `describe('useStore', …)`):

```ts
  it('addTag adds a tag; toggleTopicTag adds then removes it on a topic', () => {
    const s = useStore.getState().addSubject('S');
    const c = useStore.getState().addChapter(s, 'C');
    const t = useStore.getState().addTopic(c, 'T');
    const tagId = useStore.getState().addTag('Formula', '#f00', 'Sigma');
    expect(useStore.getState().tags![tagId].name).toBe('Formula');
    useStore.getState().toggleTopicTag(t, tagId);
    expect(useStore.getState().topics[t].tagIds).toContain(tagId);
    useStore.getState().toggleTopicTag(t, tagId);
    expect(useStore.getState().topics[t].tagIds).not.toContain(tagId);
  });

  it('deleteTag removes it and strips it from all topics', () => {
    const s = useStore.getState().addSubject('S');
    const c = useStore.getState().addChapter(s, 'C');
    const t = useStore.getState().addTopic(c, 'T');
    const tagId = useStore.getState().addTag('Weak', '#f00', 'TriangleAlert');
    useStore.getState().toggleTopicTag(t, tagId);
    useStore.getState().deleteTag(tagId);
    expect(useStore.getState().tags![tagId]).toBeUndefined();
    expect(useStore.getState().tagOrder).not.toContain(tagId);
    expect(useStore.getState().topics[t].tagIds ?? []).not.toContain(tagId);
  });

  it('updateTag patches fields', () => {
    const tagId = useStore.getState().addTag('Old', '#f00', 'Star');
    useStore.getState().updateTag(tagId, { name: 'New', color: '#0f0' });
    expect(useStore.getState().tags![tagId]).toMatchObject({ name: 'New', color: '#0f0' });
  });
```

Also add `tags: {}, tagOrder: []` to the `reset()` helper's `setState` call so tag state is cleared between tests:

```ts
function reset() {
  window.localStorage.clear();
  useStore.setState({ subjects: {}, chapters: {}, topics: {}, subjectOrder: [], tags: {}, tagOrder: [] });
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run store/useStore.test.ts`
Expected: FAIL (addTag/toggleTopicTag/deleteTag/updateTag not defined).

- [ ] **Step 3: Add signatures**

In the `StoreState` interface (after `toggleBookmark`):

```ts
  addTag: (name: string, color: string, icon: string, description?: string) => string;
  updateTag: (id: string, patch: Partial<Pick<Tag, 'name' | 'color' | 'icon' | 'description'>>) => void;
  deleteTag: (id: string) => void;
  toggleTopicTag: (topicId: string, tagId: string) => void;
```

- [ ] **Step 4: Add implementations**

Insert before `undo:` in the returned object:

```ts
    addTag: (name, color, icon, description) => {
      const id = makeId();
      const s = get();
      const order = (s.tagOrder ?? []).length;
      const tag: Tag = { id, name, color, icon, description, order };
      commit({ tags: { ...(s.tags ?? {}), [id]: tag }, tagOrder: [...(s.tagOrder ?? []), id] });
      return id;
    },
    updateTag: (id, patch) => {
      const s = get();
      const tag = (s.tags ?? {})[id];
      if (!tag) return;
      commit({ tags: { ...(s.tags ?? {}), [id]: { ...tag, ...patch } } });
    },
    deleteTag: (id) => {
      const s = get();
      if (!(s.tags ?? {})[id]) return;
      const tags = { ...(s.tags ?? {}) }; delete tags[id];
      const topics = { ...s.topics };
      for (const tid of Object.keys(topics)) {
        const tp = topics[tid];
        if (tp.tagIds?.includes(id)) topics[tid] = { ...tp, tagIds: tp.tagIds.filter((x) => x !== id) };
      }
      commit({ tags, tagOrder: (s.tagOrder ?? []).filter((x) => x !== id), topics });
    },
    toggleTopicTag: (topicId, tagId) => {
      const s = get();
      const t = s.topics[topicId];
      if (!t) return;
      const current = t.tagIds ?? [];
      const tagIds = current.includes(tagId) ? current.filter((x) => x !== tagId) : [...current, tagId];
      commit({ topics: { ...s.topics, [topicId]: { ...t, tagIds, updatedAt: Date.now() } } });
    },
```

- [ ] **Step 5: Run to verify all store tests pass**

Run: `npx vitest run store/useStore.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add store/useStore.ts store/useStore.test.ts
git commit -m "feat: tag CRUD and topic tagging store actions"
```

---

### Task 3: Filter predicates + matching selector

**Files:**
- Create: `lib/filters/predicates.ts`
- Test: `lib/filters/predicates.test.ts`

**Interfaces:**
- Consumes: `badgeState` from `@/lib/revision/engine`; `Topic`, `AppData`.
- Produces: `StatusFilter`, `ActiveFilters`, `topicMatchesStatus`, `topicMatchesFilters`, `hasActiveFilters`, `matchingTopics`.

- [ ] **Step 1: Write the failing test**

Create `lib/filters/predicates.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { topicMatchesFilters, hasActiveFilters, matchingTopics } from './predicates';
import type { AppData, Topic } from '@/lib/domain/types';

const now = new Date('2026-07-10T12:00:00Z').getTime();
const DAY = 24 * 60 * 60 * 1000;

const topic = (over: Partial<Topic>): Topic => ({
  id: 't', chapterId: 'c', title: 'T', notes: '', order: 0,
  difficulty: 'Medium', priority: 'Medium', revisionHistory: [], createdAt: 0, updatedAt: 0, ...over,
});

describe('filter predicates', () => {
  it('hasActiveFilters reflects any active chip', () => {
    expect(hasActiveFilters({ tagIds: [], statuses: [] })).toBe(false);
    expect(hasActiveFilters({ tagIds: ['x'], statuses: [] })).toBe(true);
  });

  it('never-revised status matches an unrevised topic', () => {
    expect(topicMatchesFilters(topic({}), { tagIds: [], statuses: ['never-revised'] }, now)).toBe(true);
    expect(topicMatchesFilters(topic({ revisionHistory: [{ id: 'r', timestamp: now }] }), { tagIds: [], statuses: ['never-revised'] }, now)).toBe(false);
  });

  it('AND semantics across a tag and a status', () => {
    const t = topic({ tagIds: ['formula'] });
    expect(topicMatchesFilters(t, { tagIds: ['formula'], statuses: ['never-revised'] }, now)).toBe(true);
    expect(topicMatchesFilters(t, { tagIds: ['other'], statuses: ['never-revised'] }, now)).toBe(false);
  });

  it('archived topics never match', () => {
    expect(topicMatchesFilters(topic({ archivedAt: 1 }), { tagIds: [], statuses: ['never-revised'] }, now)).toBe(false);
  });

  it('matchingTopics returns matches with context, scoped optionally', () => {
    const data: AppData = {
      subjectOrder: ['s1'],
      subjects: { s1: { id: 's1', name: 'S', color: '#000', icon: 'X', order: 0, chapterIds: ['c1'] } },
      chapters: { c1: { id: 'c1', subjectId: 's1', name: 'C', order: 0, difficulty: 'Medium', priority: 'Medium', topicIds: ['t1', 't2'] } },
      topics: {
        t1: topic({ id: 't1', chapterId: 'c1', bookmarkedAt: 5 }),
        t2: topic({ id: 't2', chapterId: 'c1' }),
      },
    };
    const res = matchingTopics(data, { tagIds: [], statuses: ['bookmarked'] }, now);
    expect(res).toHaveLength(1);
    expect(res[0].topic.id).toBe('t1');
    expect(res[0].subject?.id).toBe('s1');
    expect(matchingTopics(data, { tagIds: [], statuses: ['bookmarked'] }, now, { chapterId: 'cX' })).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/filters/predicates.test.ts`
Expected: FAIL (cannot find module './predicates').

- [ ] **Step 3: Implement the predicates**

Create `lib/filters/predicates.ts`:

```ts
import type { AppData, Chapter, Subject, Topic } from '@/lib/domain/types';
import { badgeState } from '@/lib/revision/engine';

export type StatusFilter =
  | 'needs-revision' | 'never-revised' | 'bookmarked'
  | 'has-flashcards' | 'has-attachments';

export interface ActiveFilters {
  tagIds: string[];
  statuses: StatusFilter[];
}

export function hasActiveFilters(f: ActiveFilters): boolean {
  return f.tagIds.length > 0 || f.statuses.length > 0;
}

export function topicMatchesStatus(topic: Topic, status: StatusFilter, now: number): boolean {
  switch (status) {
    case 'needs-revision': {
      const b = badgeState(topic.revisionHistory, now);
      return b === 'Overdue' || b === 'DueToday';
    }
    case 'never-revised': return topic.revisionHistory.length === 0;
    case 'bookmarked': return !!topic.bookmarkedAt;
    case 'has-flashcards': return (topic.flashcards?.length ?? 0) > 0;
    case 'has-attachments': return (topic.attachments?.length ?? 0) > 0;
  }
}

export function topicMatchesFilters(topic: Topic, f: ActiveFilters, now: number): boolean {
  if (topic.archivedAt) return false;
  if (!f.statuses.every((s) => topicMatchesStatus(topic, s, now))) return false;
  const tagIds = topic.tagIds ?? [];
  if (!f.tagIds.every((id) => tagIds.includes(id))) return false;
  return true;
}

export function matchingTopics(
  data: AppData, f: ActiveFilters, now: number,
  scope?: { subjectId?: string; chapterId?: string },
): { topic: Topic; chapter?: Chapter; subject?: Subject }[] {
  const out: { topic: Topic; chapter?: Chapter; subject?: Subject }[] = [];
  for (const topic of Object.values(data.topics)) {
    const chapter = data.chapters[topic.chapterId];
    if (scope?.chapterId && topic.chapterId !== scope.chapterId) continue;
    if (scope?.subjectId && chapter?.subjectId !== scope.subjectId) continue;
    if (chapter?.archivedAt) continue;
    const subject = chapter ? data.subjects[chapter.subjectId] : undefined;
    if (subject?.archivedAt) continue;
    if (topicMatchesFilters(topic, f, now)) out.push({ topic, chapter, subject });
  }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/filters/predicates.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/filters
git commit -m "feat: pure filter predicates and matching-topics selector"
```

---

### Task 4: Search

**Files:**
- Create: `lib/search/search.ts`
- Test: `lib/search/search.test.ts`

**Interfaces:**
- Produces: `SearchKind`, `SearchResult`, `search(query, data): SearchResult[]`.

- [ ] **Step 1: Write the failing test**

Create `lib/search/search.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { search } from './search';
import type { AppData } from '@/lib/domain/types';

function data(): AppData {
  return {
    subjectOrder: ['s1'],
    subjects: { s1: { id: 's1', name: 'Fluid Mechanics', color: '#000', icon: 'X', order: 0, chapterIds: ['c1'] } },
    chapters: { c1: { id: 'c1', subjectId: 's1', name: 'Pipe Flow', order: 0, difficulty: 'Medium', priority: 'Medium', topicIds: ['t1', 't2'] } },
    topics: {
      t1: { id: 't1', chapterId: 'c1', title: 'Bernoulli Equation', notes: 'energy conservation', order: 0, difficulty: 'Medium', priority: 'Medium', revisionHistory: [], createdAt: 0, updatedAt: 0 },
      t2: { id: 't2', chapterId: 'c1', title: 'Reynolds Number', notes: 'mentions bernoulli in passing', order: 1, difficulty: 'Medium', priority: 'Medium', revisionHistory: [], createdAt: 0, updatedAt: 0 },
    },
    tags: { g1: { id: 'g1', name: 'Formula', color: '#000', icon: 'Sigma', order: 0 } },
    tagOrder: ['g1'],
  };
}

describe('search', () => {
  it('returns nothing for an empty query', () => {
    expect(search('', data())).toEqual([]);
  });
  it('ranks a title match above a notes-only match', () => {
    const res = search('bernoulli', data());
    const ids = res.filter((r) => r.kind === 'topic').map((r) => r.id);
    expect(ids[0]).toBe('t1'); // title match beats t2's notes mention
    expect(ids).toContain('t2');
  });
  it('finds subjects, chapters, and tags', () => {
    expect(search('fluid', data()).some((r) => r.kind === 'subject')).toBe(true);
    expect(search('pipe', data()).some((r) => r.kind === 'chapter')).toBe(true);
    const tag = search('formula', data()).find((r) => r.kind === 'tag');
    expect(tag?.href).toBe('/filtered');
  });
  it('excludes archived entities', () => {
    const d = data();
    d.topics.t1.archivedAt = 1;
    expect(search('bernoulli', d).some((r) => r.id === 't1')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/search/search.test.ts`
Expected: FAIL (cannot find module './search').

- [ ] **Step 3: Implement search**

Create `lib/search/search.ts`:

```ts
import type { AppData } from '@/lib/domain/types';

export type SearchKind = 'subject' | 'chapter' | 'topic' | 'tag';
export interface SearchResult {
  kind: SearchKind;
  id: string;
  label: string;
  sublabel?: string;
  href: string;
  score: number;
}

// Higher is better. 0 means no match.
function score(haystack: string, needle: string): number {
  const h = haystack.toLowerCase();
  const i = h.indexOf(needle);
  if (i < 0) return 0;
  if (h === needle) return 100;
  if (i === 0) return 80;
  if (/\s/.test(h[i - 1] ?? ' ')) return 60; // word-boundary
  return 30;
}

export function search(query: string, data: AppData): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: SearchResult[] = [];

  for (const s of Object.values(data.subjects)) {
    if (s.archivedAt) continue;
    const sc = score(s.name, q);
    if (sc) out.push({ kind: 'subject', id: s.id, label: s.name, href: `/subject/${s.id}`, score: sc });
  }
  for (const c of Object.values(data.chapters)) {
    if (c.archivedAt || data.subjects[c.subjectId]?.archivedAt) continue;
    const sc = score(c.name, q);
    if (sc) out.push({ kind: 'chapter', id: c.id, label: c.name, sublabel: data.subjects[c.subjectId]?.name, href: `/chapter/${c.id}`, score: sc });
  }
  for (const t of Object.values(data.topics)) {
    if (t.archivedAt) continue;
    const chapter = data.chapters[t.chapterId];
    if (chapter?.archivedAt || (chapter && data.subjects[chapter.subjectId]?.archivedAt)) continue;
    const titleScore = score(t.title, q);
    const notesScore = t.notes ? Math.min(score(t.notes, q), 25) : 0; // notes rank below titles
    const sc = Math.max(titleScore, notesScore);
    if (sc) out.push({ kind: 'topic', id: t.id, label: t.title, sublabel: chapter?.name, href: `/topic/${t.id}`, score: sc });
  }
  for (const g of Object.values(data.tags ?? {})) {
    const sc = score(g.name, q);
    if (sc) out.push({ kind: 'tag', id: g.id, label: g.name, sublabel: 'tag', href: `/filtered`, score: sc });
  }

  return out.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label)).slice(0, 40);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/search/search.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/search
git commit -m "feat: pure global search over subjects, chapters, topics, and tags"
```

---

### Task 5: Filter store (`useFilters`)

**Files:**
- Create: `store/useFilters.ts`
- Test: `store/useFilters.test.ts`

**Interfaces:**
- Produces: `useFilters` — `{ tagIds: string[]; statuses: StatusFilter[]; query: string; toggleTag(id); toggleStatus(s); setQuery(q); clear() }`. Not persisted.

- [ ] **Step 1: Write the failing test**

Create `store/useFilters.test.ts`:

```ts
import { it, expect, beforeEach } from 'vitest';
import { useFilters } from './useFilters';

beforeEach(() => useFilters.getState().clear());

it('toggles tags and statuses and clears', () => {
  useFilters.getState().toggleTag('a');
  useFilters.getState().toggleStatus('bookmarked');
  expect(useFilters.getState().tagIds).toEqual(['a']);
  expect(useFilters.getState().statuses).toEqual(['bookmarked']);
  useFilters.getState().toggleTag('a'); // off
  expect(useFilters.getState().tagIds).toEqual([]);
  useFilters.getState().clear();
  expect(useFilters.getState().statuses).toEqual([]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run store/useFilters.test.ts`
Expected: FAIL (cannot find module './useFilters').

- [ ] **Step 3: Implement the store**

Create `store/useFilters.ts`:

```ts
import { create } from 'zustand';
import type { StatusFilter } from '@/lib/filters/predicates';

interface FilterState {
  tagIds: string[];
  statuses: StatusFilter[];
  query: string;
  toggleTag: (id: string) => void;
  toggleStatus: (s: StatusFilter) => void;
  setQuery: (q: string) => void;
  clear: () => void;
}

const toggle = <T>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export const useFilters = create<FilterState>((set) => ({
  tagIds: [],
  statuses: [],
  query: '',
  toggleTag: (id) => set((s) => ({ tagIds: toggle(s.tagIds, id) })),
  toggleStatus: (st) => set((s) => ({ statuses: toggle(s.statuses, st) })),
  setQuery: (q) => set({ query: q }),
  clear: () => set({ tagIds: [], statuses: [], query: '' }),
}));
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run store/useFilters.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add store/useFilters.ts store/useFilters.test.ts
git commit -m "feat: ephemeral useFilters store for active filter selection"
```

---

### Task 6: FilterBar + TopicResultRow + /filtered view

**Files:**
- Create: `components/FilterBar.tsx`
- Create: `components/TopicResultRow.tsx`
- Create: `app/filtered/page.tsx`
- Test: `app/filtered/FilteredPage.test.tsx`

**Interfaces:**
- Consumes: `useFilters`, `useStore`, `matchingTopics`, `StatusFilter`.
- Produces: `<FilterBar />`; `<TopicResultRow topic subject chapter />`; the `/filtered` route.

- [ ] **Step 1: Implement TopicResultRow**

Create `components/TopicResultRow.tsx`:

```tsx
'use client';
import Link from 'next/link';
import type { Chapter, Subject, Topic } from '@/lib/domain/types';
import { badgeState } from '@/lib/revision/engine';
import { RevisionBadge } from '@/components/RevisionBadge';

export function TopicResultRow({ topic, subject, chapter }: { topic: Topic; subject?: Subject; chapter?: Chapter }) {
  return (
    <Link href={`/topic/${topic.id}`} className="glass flex items-center justify-between gap-3 rounded-xl p-4 hover:bg-white/5">
      <div className="min-w-0">
        <div className="font-medium">{topic.title}</div>
        <div className="mt-0.5 truncate text-xs opacity-50">{subject?.name}{chapter ? ` · ${chapter.name}` : ''}</div>
      </div>
      <RevisionBadge state={badgeState(topic.revisionHistory, Date.now())} />
    </Link>
  );
}
```

- [ ] **Step 2: Implement FilterBar**

Create `components/FilterBar.tsx`:

```tsx
'use client';
import { X } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { useFilters } from '@/store/useFilters';
import { hasActiveFilters, type StatusFilter } from '@/lib/filters/predicates';

const STATUSES: { key: StatusFilter; label: string }[] = [
  { key: 'needs-revision', label: 'Needs Revision' },
  { key: 'never-revised', label: 'Never Revised' },
  { key: 'bookmarked', label: 'Bookmarked' },
  { key: 'has-flashcards', label: 'Has Flashcards' },
  { key: 'has-attachments', label: 'Has Attachments' },
];

export function FilterBar() {
  const tags = useStore((s) => s.tags);
  const tagOrder = useStore((s) => s.tagOrder);
  const { tagIds, statuses, toggleTag, toggleStatus, clear } = useFilters();
  const active = hasActiveFilters({ tagIds, statuses });
  return (
    <div className="mb-4 flex flex-wrap items-center gap-1.5">
      {STATUSES.map((s) => (
        <button key={s.key} onClick={() => toggleStatus(s.key)}
          className={`rounded-full px-2.5 py-1 text-xs transition ${statuses.includes(s.key) ? 'bg-white/20' : 'bg-white/5 opacity-70 hover:opacity-100'}`}>
          {s.label}
        </button>
      ))}
      {(tagOrder ?? []).map((id) => {
        const tag = (tags ?? {})[id];
        if (!tag) return null;
        const on = tagIds.includes(id);
        return (
          <button key={id} onClick={() => toggleTag(id)}
            className="rounded-full px-2.5 py-1 text-xs transition"
            style={{ background: on ? tag.color : `${tag.color}22`, color: on ? '#000' : undefined, opacity: on ? 1 : 0.85 }}>
            {tag.name}
          </button>
        );
      })}
      {active && (
        <button onClick={clear} className="flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-xs opacity-70 hover:opacity-100"><X size={12} /> Clear</button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Implement the /filtered page**

Create `app/filtered/page.tsx`:

```tsx
'use client';
import { useStore } from '@/store/useStore';
import { useFilters } from '@/store/useFilters';
import { matchingTopics, hasActiveFilters } from '@/lib/filters/predicates';
import { FilterBar } from '@/components/FilterBar';
import { TopicResultRow } from '@/components/TopicResultRow';
import { Breadcrumb } from '@/components/layout/Breadcrumb';

export default function FilteredPage() {
  const data = useStore();
  const { tagIds, statuses } = useFilters();
  const filters = { tagIds, statuses };
  const results = hasActiveFilters(filters) ? matchingTopics(data, filters, Date.now()) : [];
  return (
    <div>
      <Breadcrumb items={[{ label: 'Subjects', href: '/' }, { label: 'Filtered' }]} />
      <h1 className="mb-4 mt-4 text-2xl font-bold">Filtered Topics</h1>
      <FilterBar />
      {!hasActiveFilters(filters) ? (
        <p className="text-sm opacity-50">Pick a status or tag above to filter topics across all subjects.</p>
      ) : results.length === 0 ? (
        <p className="text-sm opacity-50">No topics match the selected filters.</p>
      ) : (
        <div className="grid gap-3">
          {results.map(({ topic, subject, chapter }) => (
            <TopicResultRow key={topic.id} topic={topic} subject={subject} chapter={chapter} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write a failing page test**

Create `app/filtered/FilteredPage.test.tsx`:

```tsx
import { it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import FilteredPage from './page';
import { useStore } from '@/store/useStore';
import { useFilters } from '@/store/useFilters';

beforeEach(() => {
  useStore.setState({ subjects: {}, chapters: {}, topics: {}, subjectOrder: [], tags: {}, tagOrder: [] });
  useFilters.getState().clear();
});

it('lists topics matching an active status filter', () => {
  const s = useStore.getState().addSubject('S');
  const c = useStore.getState().addChapter(s, 'C');
  const t = useStore.getState().addTopic(c, 'Bernoulli');
  useStore.getState().toggleBookmark(t);
  useFilters.getState().toggleStatus('bookmarked');
  render(<FilteredPage />);
  expect(screen.getByText('Bernoulli')).toBeInTheDocument();
});
```

- [ ] **Step 5: Run test + build**

Run: `npx vitest run app/filtered/FilteredPage.test.tsx && npm run build`
Expected: test PASS; build succeeds (`/filtered` route appears).

- [ ] **Step 6: Commit**

```bash
git add app components
git commit -m "feat: filter bar, topic result row, and global /filtered view"
```

---

### Task 7: Filter bars on subject & chapter pages

**Files:**
- Modify: `app/subject/[id]/page.tsx`
- Modify: `app/chapter/[id]/page.tsx`

**Interfaces:**
- Consumes: `useFilters`, `matchingTopics`, `hasActiveFilters`, `FilterBar`, `TopicResultRow`.

- [ ] **Step 1: Add filtering to the chapter page**

In `app/chapter/[id]/page.tsx`, add imports and, when filters are active, render matching topics instead of the normal list. Add imports:

```tsx
import { useFilters } from '@/store/useFilters';
import { matchingTopics, hasActiveFilters } from '@/lib/filters/predicates';
import { FilterBar } from '@/components/FilterBar';
import { TopicResultRow } from '@/components/TopicResultRow';
```

Add near the other store reads:

```tsx
  const data = useStore();
  const { tagIds, statuses } = useFilters();
  const filters = { tagIds, statuses };
```

Render `<FilterBar />` above the topic list, and branch the list. Replace the `<SortableContext>…</SortableContext>` block with:

```tsx
      <FilterBar />
      {hasActiveFilters(filters) ? (
        <div className="grid gap-3">
          {matchingTopics(data, filters, Date.now(), { chapterId: id }).map(({ topic, subject, chapter }) => (
            <TopicResultRow key={topic.id} topic={topic} subject={subject} chapter={chapter} />
          ))}
        </div>
      ) : (
        <SortableContext
          items={chapter.topicIds.filter((tid) => topics[tid] && !topics[tid].archivedAt).map((tid) => dragId('topic', tid))}
          strategy={verticalListSortingStrategy}
        >
          <div className="grid gap-3">
            {chapter.topicIds.map((tid) => topics[tid] && !topics[tid].archivedAt && (
              <SortableRow key={tid} id={dragId('topic', tid)}>
                <TopicCard topic={topics[tid]} autoEdit={tid === justAddedId} />
              </SortableRow>
            ))}
          </div>
        </SortableContext>
      )}
```

- [ ] **Step 2: Add filtering to the subject page**

In `app/subject/[id]/page.tsx`, add the same imports plus the `data`/`filters` reads. Render `<FilterBar />` above the chapter list and, when filters are active, show the subject's matching topics instead of chapters. Replace the `<SortableContext>…</SortableContext>` block with:

```tsx
      <FilterBar />
      {hasActiveFilters(filters) ? (
        <div className="grid gap-3">
          {matchingTopics(data, filters, Date.now(), { subjectId: id }).map(({ topic, subject, chapter }) => (
            <TopicResultRow key={topic.id} topic={topic} subject={subject} chapter={chapter} />
          ))}
        </div>
      ) : (
        <SortableContext
          items={subject.chapterIds.filter((cid) => chapters[cid] && !chapters[cid].archivedAt).map((cid) => dragId('chapter', cid))}
          strategy={verticalListSortingStrategy}
        >
          <div className="grid gap-3">
            {subject.chapterIds.map((cid) => chapters[cid] && !chapters[cid].archivedAt && (
              <SortableRow key={cid} id={dragId('chapter', cid)}>
                <ChapterCard chapter={chapters[cid]} autoEdit={cid === justAddedId} />
              </SortableRow>
            ))}
          </div>
        </SortableContext>
      )}
```

Add the imports to the subject page:

```tsx
import { useFilters } from '@/store/useFilters';
import { matchingTopics, hasActiveFilters } from '@/lib/filters/predicates';
import { FilterBar } from '@/components/FilterBar';
import { TopicResultRow } from '@/components/TopicResultRow';
```

and the reads next to the others:

```tsx
  const data = useStore();
  const { tagIds, statuses } = useFilters();
  const filters = { tagIds, statuses };
```

- [ ] **Step 3: Verify build + suite**

Run: `npx vitest run && npm run build`
Expected: all tests PASS; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add app
git commit -m "feat: in-place filter bars on subject and chapter pages"
```

---

### Task 8: Topic-page tag picker + Tag manager

**Files:**
- Create: `components/TagPicker.tsx`
- Create: `components/TagManager.tsx`
- Modify: `app/topic/[id]/page.tsx` (render TagPicker)
- Modify: `components/FilterBar.tsx` (add a "Manage tags" entry point)

**Interfaces:**
- Consumes: `useStore` (`toggleTopicTag`, `addTag`, `updateTag`, `deleteTag`).
- Produces: `<TagPicker topic />`; `<TagManager />`.

- [ ] **Step 1: Implement TagPicker**

Create `components/TagPicker.tsx`:

```tsx
'use client';
import { Tag as TagIcon } from 'lucide-react';
import type { Topic } from '@/lib/domain/types';
import { useStore } from '@/store/useStore';

export function TagPicker({ topic }: { topic: Topic }) {
  const tags = useStore((s) => s.tags);
  const tagOrder = useStore((s) => s.tagOrder);
  const toggleTopicTag = useStore((s) => s.toggleTopicTag);
  const active = new Set(topic.tagIds ?? []);
  return (
    <div className="glass rounded-xl p-4">
      <div className="mb-3 flex items-center gap-2"><TagIcon size={16} /><h3 className="font-semibold">Tags</h3></div>
      <div className="flex flex-wrap gap-1.5">
        {(tagOrder ?? []).map((id) => {
          const tag = (tags ?? {})[id];
          if (!tag) return null;
          const on = active.has(id);
          return (
            <button key={id} onClick={() => toggleTopicTag(topic.id, id)}
              className="rounded-full px-2.5 py-1 text-xs transition"
              style={{ background: on ? tag.color : `${tag.color}22`, color: on ? '#000' : undefined, opacity: on ? 1 : 0.85 }}>
              {tag.name}
            </button>
          );
        })}
        {(tagOrder ?? []).length === 0 && <span className="text-sm opacity-50">No tags yet — create some from any filter bar.</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement TagManager (popover)**

Create `components/TagManager.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { Settings2, Plus, Trash2 } from 'lucide-react';
import { useStore } from '@/store/useStore';

const SWATCHES = ['#f59e0b', '#8b5cf6', '#ef4444', '#10b981', '#0ea5e9', '#ec4899', '#64748b'];

export function TagManager() {
  const [open, setOpen] = useState(false);
  const tags = useStore((s) => s.tags);
  const tagOrder = useStore((s) => s.tagOrder);
  const { addTag, updateTag, deleteTag } = useStore.getState();
  const [name, setName] = useState('');
  const [color, setColor] = useState(SWATCHES[0]);

  const create = () => { if (name.trim()) { addTag(name.trim(), color, 'Tag'); setName(''); } };

  return (
    <div className="relative inline-block">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-xs opacity-70 hover:opacity-100"><Settings2 size={12} /> Tags</button>
      {open && (
        <div className="absolute z-30 mt-2 w-72 rounded-xl border border-white/10 bg-neutral-900 p-3 shadow-xl">
          <div className="mb-2 space-y-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New tag name" className="w-full rounded-lg bg-black/30 px-2 py-1.5 text-sm outline-none" onKeyDown={(e) => e.key === 'Enter' && create()} />
            <div className="flex items-center gap-1.5">
              {SWATCHES.map((c) => (
                <button key={c} aria-label={`color ${c}`} onClick={() => setColor(c)} className={`h-5 w-5 rounded-full ${color === c ? 'ring-2 ring-white' : ''}`} style={{ background: c }} />
              ))}
              <button onClick={create} className="ml-auto flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-xs hover:bg-white/20"><Plus size={12} /> Add</button>
            </div>
          </div>
          <ul className="max-h-56 space-y-1 overflow-y-auto">
            {(tagOrder ?? []).map((id) => {
              const tag = (tags ?? {})[id];
              if (!tag) return null;
              return (
                <li key={id} className="flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-white/5">
                  <span className="h-3 w-3 rounded-full" style={{ background: tag.color }} />
                  <input defaultValue={tag.name} onBlur={(e) => e.target.value.trim() && updateTag(id, { name: e.target.value.trim() })}
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
                  <button aria-label="Delete tag" onClick={() => { if (window.confirm(`Delete tag "${tag.name}"? It will be removed from all topics.`)) deleteTag(id); }} className="rounded p-1 hover:bg-white/10"><Trash2 size={13} /></button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add the tag picker to the topic page**

In `app/topic/[id]/page.tsx`, import and render `<TagPicker topic={topic} />` in the right column (below `RevisionHistoryPanel`, above `AttachmentsPanel`):

```tsx
import { TagPicker } from '@/components/TagPicker';
// … in the right column:
          <RevisionHistoryPanel topic={topic} />
          <TagPicker topic={topic} />
          <AttachmentsPanel topic={topic} />
```

- [ ] **Step 4: Add TagManager to the FilterBar**

In `components/FilterBar.tsx`, import `TagManager` and render `<TagManager />` at the end of the chip row (after the Clear button):

```tsx
import { TagManager } from '@/components/TagManager';
// … after the `{active && (…Clear…)}` block, before closing the wrapper div:
      <TagManager />
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add app components
git commit -m "feat: topic tag picker and tag manager"
```

---

### Task 9: Command palette + header wiring

**Files:**
- Create: `components/CommandPalette.tsx`
- Modify: `components/layout/AppShell.tsx` (mount palette + Filtered link)

**Interfaces:**
- Consumes: `useStore`, `search`, `next/navigation` `useRouter`.
- Produces: `<CommandPalette />` — a header search button + Cmd/Ctrl+K modal.

- [ ] **Step 1: Implement the command palette**

Create `components/CommandPalette.tsx`:

```tsx
'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { search } from '@/lib/search/search';

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const router = useRouter();
  const data = useStore();
  const results = useMemo(() => (open ? search(q, data) : []), [open, q, data]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o); }
      else if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => { setActive(0); }, [q, open]);

  const go = (href: string) => { setOpen(false); setQ(''); router.push(href); };
  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && results[active]) { e.preventDefault(); go(results[active].href); }
  };

  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Search"
        className="flex items-center gap-2 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs opacity-70 transition hover:opacity-100">
        <Search size={14} /> <span className="hidden sm:inline">Search</span> <kbd className="hidden rounded bg-white/10 px-1 sm:inline">⌘K</kbd>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-24" onClick={() => setOpen(false)}>
          <div className="glass w-full max-w-xl overflow-hidden rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onInputKey}
              placeholder="Search subjects, chapters, topics, notes, tags…"
              className="w-full border-b border-white/10 bg-transparent px-4 py-3 text-sm outline-none" />
            <ul className="max-h-80 overflow-y-auto p-1">
              {q && results.length === 0 && <li className="px-3 py-4 text-sm opacity-50">No matches.</li>}
              {results.map((r, i) => (
                <li key={`${r.kind}:${r.id}`}>
                  <button onClick={() => go(r.href)} onMouseEnter={() => setActive(i)}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm ${i === active ? 'bg-white/15' : 'hover:bg-white/5'}`}>
                    <span className="min-w-0 truncate">{r.label}{r.sublabel ? <span className="opacity-50"> · {r.sublabel}</span> : null}</span>
                    <span className="shrink-0 text-xs uppercase opacity-40">{r.kind}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Mount the palette + Filtered link in the header**

In `components/layout/AppShell.tsx`, import `CommandPalette` and add it plus a Filtered link. Update the right-hand header group:

```tsx
import { CommandPalette } from '@/components/CommandPalette';
// … in the header's right-side div, before HeaderControls:
        <div className="flex items-center gap-3">
          <CommandPalette />
          <HeaderControls />
          <Link href="/filtered" className="text-sm opacity-70 transition hover:opacity-100">Filtered</Link>
          <Link href="/bookmarks" className="text-sm opacity-70 transition hover:opacity-100">Bookmarks</Link>
          <Link href="/archive" className="text-sm opacity-70 transition hover:opacity-100">Archive</Link>
          <ThemeToggle />
        </div>
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: build succeeds; `/filtered` present.

- [ ] **Step 4: Commit**

```bash
git add app components
git commit -m "feat: Cmd/Ctrl+K command palette and header search/Filtered links"
```

---

### Task 10: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: all tests PASS.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: build succeeds; routes include `/filtered`.

- [ ] **Step 3: Manual end-to-end**

Run `npm run dev`:
1. Press **Cmd/Ctrl+K**, type part of a topic title → it appears; arrow-down + Enter navigates to it. Type a subject/chapter/tag name → those appear too.
2. On a **topic page**, toggle a couple of tags in the Tags panel; open **Manage tags** (from a filter bar), add a new colored tag, rename one, and delete one (confirm it disappears from topics).
3. On a **chapter page**, activate "Needs Revision" and a tag chip → the list narrows to matching topics (AND); Clear restores the normal list.
4. Open **Filtered** (header) → pick a status/tag → matching topics across the whole app are listed with their Subject · Chapter context.
5. Confirm filter selections do **not** persist across reload (ephemeral) while tags **do** persist.

- [ ] **Step 4: (No commit — verification only.)**

---

## Phase 4 Complete

Delivered: a `Tag` model with built-in tags (seeded + backfilled), tag CRUD + a topic tag picker, a shared filter bar (derived status filters + tag chips, AND semantics) on subject/chapter pages and a global `/filtered` view, and a Cmd/Ctrl+K command palette searching subjects, chapters, topics, notes, and tags — all with no new dependencies. Correctness-critical logic (predicates, search, tag actions, backfill, filter store) is unit-tested; the UI is verified by build, component tests, and the manual e2e.

**Deferred to later phases (per the design spec):** statistics/heatmap/streaks, calendar, notifications, SM-2, authentication, cloud sync, AI features. OR filter semantics and saved compound filters remain deferred.
