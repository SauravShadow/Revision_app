# Hardening Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the security, correctness, and data-integrity defects from the 2026-07-12 code review (spec: `docs/superpowers/specs/2026-07-12-hardening-pass-design.md`) with zero user-facing feature changes.

**Architecture:** Guard the file API against path traversal; replace per-mutation immediate PUTs with a debounced single-flight save queue and an honest save indicator; replace eager client-side blob deletes with a server-side GC sweep; make undo structure-only; make the Zustand store type-clean and repository-injectable; single source of truth for the seed.

**Tech Stack:** Next.js 15 (App Router route handlers), React 19, Zustand 5, Vitest 3 + Testing Library (jsdom env, globals on, `@` alias = repo root).

## Global Constraints

- Debounce delay: **800 ms** trailing; single in-flight PUT; coalesce to latest snapshot.
- Blob GC grace period: **24 h** by file mtime.
- Blob id validation: charset check `/^[A-Za-z0-9-]{1,64}$/` (covers both `crypto.randomUUID()` and the base36 fallback in `lib/domain/id.ts`; blocks `.` and `/` so traversal is impossible). This supersedes the spec's UUID-only regex — the fallback id format is not a UUID.
- `saveState` values: `'idle' | 'saving' | 'saved' | 'error'`.
- No new runtime dependencies. No feature changes.
- Run tests with `npm test -- <file>` (vitest run). Full suite: `npm test`. Typecheck: `npx tsc --noEmit`. Lint: `npm run lint`.
- Commit after every task with the trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Green baseline — fix stale tests, gitignore data/, lint warning

The suite currently fails 2 tests that assert pre-redesign markup. Fix them first so every later task's "suite green" check means something.

**Files:**
- Modify: `components/RevisionBadge.test.tsx`
- Modify: `components/cards/ChapterCard.test.tsx:14`
- Modify: `components/cards/SubjectCard.test.tsx:1`
- Modify: `.gitignore`

**Interfaces:** none (test/config only).

- [ ] **Step 1: Fix RevisionBadge test to match the blueprint chip labels**

`components/RevisionBadge.tsx` renders uppercase labels (`OVERDUE`, `DUE TODAY`). Replace the whole test body of `components/RevisionBadge.test.tsx` with:

```tsx
import { it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RevisionBadge } from './RevisionBadge';

it('renders human-readable labels for each state', () => {
  render(<RevisionBadge state="Overdue" />);
  expect(screen.getByText('OVERDUE')).toBeInTheDocument();
  render(<RevisionBadge state="DueToday" />);
  expect(screen.getByText('DUE TODAY')).toBeInTheDocument();
});
```

- [ ] **Step 2: Fix ChapterCard topic-count assertion**

`components/cards/ChapterCard.tsx:29` renders `1 TOPIC` (uppercase, via `{activeTopics} TOPIC{activeTopics === 1 ? '' : 'S'}`). In `components/cards/ChapterCard.test.tsx` line 14, change:

```tsx
  expect(screen.getByText(/1 topic/)).toBeInTheDocument();
```
to
```tsx
  expect(screen.getByText(/1 TOPIC/)).toBeInTheDocument();
```

- [ ] **Step 3: Remove unused `describe` import**

`components/cards/SubjectCard.test.tsx` line 1, change:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
```
to
```tsx
import { it, expect, beforeEach } from 'vitest';
```

- [ ] **Step 4: Gitignore runtime data**

In `.gitignore`, after the `# misc` block's `*.pem` line, add:

```
# runtime user data (appdata.json + uploaded files)
/data
```

- [ ] **Step 5: Verify**

Run: `npm test` → all tests pass (108/108). Run: `npm run lint` → 0 problems.

- [ ] **Step 6: Commit**

```bash
git add components/RevisionBadge.test.tsx components/cards/ChapterCard.test.tsx components/cards/SubjectCard.test.tsx .gitignore
git commit -m "test: update stale blueprint-markup tests; gitignore runtime data"
```

---

### Task 2: Blob id validation — block path traversal (H1)

**Files:**
- Modify: `lib/repository/fileBlobStore.ts`
- Modify: `app/api/files/[id]/route.ts`
- Test: `lib/repository/fileBlobStore.test.ts`
- Create: `app/api/files/[id]/route.test.ts`
- Modify: `docs/superpowers/specs/2026-07-12-hardening-pass-design.md` (regex amendment)

**Interfaces:**
- Produces: `isValidBlobId(id: string): boolean` exported from `lib/repository/fileBlobStore.ts` (Task 8's GC also relies on the id charset).

- [ ] **Step 1: Write the failing tests**

Append inside the `describe('fileBlobStore', ...)` block of `lib/repository/fileBlobStore.test.ts`:

```ts
  it('isValidBlobId accepts generated ids and rejects traversal', async () => {
    const { isValidBlobId } = await import('./fileBlobStore');
    expect(isValidBlobId('4f1c2d3e-1111-4222-8333-444455556666')).toBe(true);
    expect(isValidBlobId('lx2m0abc-k3j9d8e2')).toBe(true); // base36 fallback shape
    expect(isValidBlobId('../appdata.json')).toBe(false);
    expect(isValidBlobId('..')).toBe(false);
    expect(isValidBlobId('a/b')).toBe(false);
    expect(isValidBlobId('a\\b')).toBe(false);
    expect(isValidBlobId('')).toBe(false);
    expect(isValidBlobId('a'.repeat(65))).toBe(false);
  });

  it('readBlob and deleteBlob refuse traversal ids without touching the fs', async () => {
    const { writeBlob, readBlob, deleteBlob } = await import('./fileBlobStore');
    await writeBlob('safe1', Buffer.from('x'), { name: 'x', mime: 'text/plain', size: 1 });
    expect(await readBlob('../files/safe1')).toBeNull();
    await deleteBlob('../files/safe1'); // must be a no-op
    expect(await readBlob('safe1')).not.toBeNull();
  });
```

Create `app/api/files/[id]/route.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { GET, DELETE } from './route';

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe('/api/files/[id] traversal guard', () => {
  it('GET returns 400 for a traversal id', async () => {
    const res = await GET(new Request('http://test/api/files/x'), ctx('../appdata.json'));
    expect(res.status).toBe(400);
  });

  it('DELETE returns 400 for a traversal id', async () => {
    const res = await DELETE(new Request('http://test/api/files/x'), ctx('../appdata.json'));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/repository/fileBlobStore.test.ts app/api/files`
Expected: FAIL — `isValidBlobId` is not exported; route tests fail with status 404/204 instead of 400.

- [ ] **Step 3: Implement the guard**

In `lib/repository/fileBlobStore.ts`, add after the `BlobMeta` interface:

```ts
// Ids come from makeId(): UUIDs or a base36 fallback. Anything outside this
// charset (dots, slashes, backslashes) never reaches the filesystem.
const BLOB_ID_RE = /^[A-Za-z0-9-]{1,64}$/;

export function isValidBlobId(id: string): boolean {
  return BLOB_ID_RE.test(id);
}
```

At the top of `readBlob`, before `const dir = filesDir();`:

```ts
  if (!isValidBlobId(id)) return null;
```

At the top of `deleteBlob`:

```ts
  if (!isValidBlobId(id)) return;
```

In `app/api/files/[id]/route.ts`, change the import and add the guard to both handlers immediately after `const { id } = await params;`:

```ts
import { readBlob, deleteBlob, isValidBlobId } from '@/lib/repository/fileBlobStore';
```
```ts
  if (!isValidBlobId(id)) return new Response(null, { status: 400 });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/repository/fileBlobStore.test.ts app/api/files`
Expected: PASS (including the pre-existing round-trip tests, whose ids `b1`/`nope` are valid under the charset rule).

- [ ] **Step 5: Amend the spec regex line**

In `docs/superpowers/specs/2026-07-12-hardening-pass-design.md` section 1, replace the UUID regex sentence with:

```markdown
Add `isValidBlobId(id: string): boolean` in `lib/repository/fileBlobStore.ts` — a strict charset check (`/^[A-Za-z0-9-]{1,64}$/`) covering both UUID ids and the base36 fallback `makeId()` can produce; `.`/`/` are excluded so traversal is impossible.
```

- [ ] **Step 6: Commit**

```bash
git add lib/repository/fileBlobStore.ts lib/repository/fileBlobStore.test.ts app/api/files/\[id\]/route.ts app/api/files/\[id\]/route.test.ts docs/superpowers/specs/2026-07-12-hardening-pass-design.md
git commit -m "fix: validate blob ids in file API — block path traversal"
```

---

### Task 3: `normalizeData` — required tags/tagOrder at the load boundary (M6 part 1)

**Files:**
- Create: `lib/domain/normalize.ts`
- Create: `lib/domain/normalize.test.ts`
- Modify: `lib/domain/types.ts:76-83` (make `tags`/`tagOrder` required)
- Modify: `lib/domain/builtinTags.ts` (delete `withBuiltinTagsIfMissing`)
- Modify: `lib/domain/builtinTags.test.ts` (drop tests of the deleted function)
- Modify: `store/useStore.ts` (hydrate uses `normalizeData`; delete `?? {}` / `?? []` guards)

**Interfaces:**
- Consumes: `makeBuiltinTags()` from `lib/domain/builtinTags.ts` (unchanged).
- Produces: `normalizeData(raw: Partial<AppData> | null | undefined): AppData` — later tasks (hydrate, GC tests) may rely on every `AppData` field being present after load.

- [ ] **Step 1: Write the failing test**

Create `lib/domain/normalize.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { normalizeData } from './normalize';

describe('normalizeData', () => {
  it('backfills built-in tags when tagOrder is absent (pre-tags snapshot)', () => {
    const out = normalizeData({ subjects: {}, chapters: {}, topics: {}, subjectOrder: [] });
    expect(out.tagOrder.length).toBeGreaterThan(0);
    expect(Object.keys(out.tags).sort()).toEqual([...out.tagOrder].sort());
  });

  it('keeps deliberately-emptied tags', () => {
    const out = normalizeData({ subjects: {}, chapters: {}, topics: {}, subjectOrder: [], tags: {}, tagOrder: [] });
    expect(out.tagOrder).toEqual([]);
    expect(out.tags).toEqual({});
  });

  it('fills every missing collection on a degenerate payload', () => {
    const out = normalizeData({});
    expect(out.subjects).toEqual({});
    expect(out.chapters).toEqual({});
    expect(out.topics).toEqual({});
    expect(out.subjectOrder).toEqual([]);
  });

  it('returns a full AppData for null', () => {
    const out = normalizeData(null);
    expect(out.subjectOrder).toEqual([]);
    expect(out.tagOrder.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/domain/normalize.test.ts`
Expected: FAIL — module `./normalize` does not exist.

- [ ] **Step 3: Implement**

Create `lib/domain/normalize.ts`:

```ts
import type { AppData } from './types';
import { makeBuiltinTags } from './builtinTags';

// Single load-boundary migration: guarantees every AppData field exists so
// nothing downstream guards for legacy snapshots. Snapshots saved before
// tags existed (tagOrder absent) get the built-in tags backfilled; a user
// who deliberately emptied their tags keeps [].
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
  if (src.tagOrder === undefined) return { ...base, ...makeBuiltinTags() };
  return base;
}
```

In `lib/domain/types.ts`, make the last two `AppData` fields required:

```ts
export interface AppData {
  subjects: Record<string, Subject>;
  chapters: Record<string, Chapter>;
  topics: Record<string, Topic>;
  subjectOrder: string[];
  tags: Record<string, Tag>;
  tagOrder: string[];
}
```

In `lib/domain/builtinTags.ts`, delete the `withBuiltinTagsIfMissing` function and its comment (lines 23-28). Remove any tests of it from `lib/domain/builtinTags.test.ts` (keep `makeBuiltinTags` tests).

- [ ] **Step 4: Sweep the guards out of the store**

In `store/useStore.ts`:
- Change the import: `import { withBuiltinTagsIfMissing } from '@/lib/domain/builtinTags';` → `import { normalizeData } from '@/lib/domain/normalize';`
- In `hydrate`, replace `withBuiltinTagsIfMissing(loaded)` with `normalizeData(loaded)`.
- `snapshot()` becomes:

```ts
function snapshot(s: StoreState): AppData {
  return { subjects: s.subjects, chapters: s.chapters, topics: s.topics, subjectOrder: s.subjectOrder, tags: s.tags, tagOrder: s.tagOrder };
}
```

- In `addTag`, `updateTag`, `deleteTag`: replace every `(s.tags ?? {})` with `s.tags` and every `(s.tagOrder ?? [])` with `s.tagOrder` (six occurrences total).

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: PASS / clean. (Seed data already includes tags via `makeBuiltinTags`, and both test files that call `useStore.setState` already provide `tags`/`tagOrder` or merge partially.)

- [ ] **Step 6: Commit**

```bash
git add lib/domain/normalize.ts lib/domain/normalize.test.ts lib/domain/types.ts lib/domain/builtinTags.ts lib/domain/builtinTags.test.ts store/useStore.ts
git commit -m "refactor: normalizeData at load boundary; tags/tagOrder required"
```

---

### Task 4: Injectable repository + type-clean store (M3, M6 part 2)

**Files:**
- Create: `lib/repository/MemoryRepository.ts`
- Modify: `store/useStore.ts` (wrap in `createRevisionStore(repo)`, remove `as never`)
- Modify: `vitest.setup.ts` (default fetch stub)
- Test: `store/useStore.test.ts` (add injection test)

**Interfaces:**
- Consumes: `RevisionRepository` from `lib/repository/RevisionRepository.ts`.
- Produces: `createRevisionStore(repo: RevisionRepository)` returning the same store type as `useStore`; `MemoryRepository implements RevisionRepository`. Task 6 wires the save queue inside `createRevisionStore`.

- [ ] **Step 1: Write the failing test**

Append inside the `describe('useStore', ...)` block of `store/useStore.test.ts` (and extend the imports at the top of the file):

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore, createRevisionStore } from './useStore';
import { MemoryRepository } from '@/lib/repository/MemoryRepository';
import { seedData } from '@/lib/repository/seed';
```

```ts
  it('hydrate loads from the injected repository', async () => {
    const repo = new MemoryRepository();
    await repo.save(seedData());
    const store = createRevisionStore(repo);
    await store.getState().hydrate();
    expect(store.getState().subjectOrder).toHaveLength(13);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- store/useStore.test.ts`
Expected: FAIL — `createRevisionStore` / `MemoryRepository` not exported.

- [ ] **Step 3: Implement**

Create `lib/repository/MemoryRepository.ts`:

```ts
import type { AppData } from '@/lib/domain/types';
import type { RevisionRepository } from './RevisionRepository';

// In-memory repository for tests (and a template for future backends).
export class MemoryRepository implements RevisionRepository {
  private data: AppData | null = null;
  async load(): Promise<AppData | null> {
    return this.data;
  }
  async save(data: AppData): Promise<void> {
    this.data = data;
  }
}
```

In `store/useStore.ts`:
- Add to the top-of-file imports:

```ts
import type { RevisionRepository } from '@/lib/repository/RevisionRepository';
```

- Delete the module-level `const repo = new ApiRepository();` (line 11).
- Wrap the existing store creation — the `(set, get) => { ... }` body is unchanged, it just moves inside a factory that closes over `repo`:

```ts
export function createRevisionStore(repo: RevisionRepository) {
  return create<StoreState>((set, get) => {
    // ...existing body exactly as-is...
  });
}

export const useStore = createRevisionStore(new ApiRepository());
```

- Remove every `as never` cast (11 occurrences: `persist`, `commit`, `commitSilent`, `hydrate` ×2, `undo`, `redo`). After Task 3 all patches are plain `Partial<StoreState>` shapes; if the compiler still complains on a specific call, annotate that patch `as Partial<StoreState>` — never `as never`.

- [ ] **Step 4: Silence jsdom fetch noise from the default store**

Replace `vitest.setup.ts` content with:

```ts
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// jsdom cannot fetch relative URLs, and the app-wide store persists to
// /api/data on every mutation. Default fetch to a 204 so component tests
// don't spray network errors; tests that care stub their own fetch.
vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
```

- [ ] **Step 5: Run suite + typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: PASS, and the `Failed to persist data to server` stderr noise is gone from component tests.

- [ ] **Step 6: Commit**

```bash
git add lib/repository/MemoryRepository.ts store/useStore.ts store/useStore.test.ts vitest.setup.ts
git commit -m "refactor: injectable repository via createRevisionStore; drop as-never casts"
```

---

### Task 5: SaveQueue — debounced single-flight persistence primitive (H2 core)

**Files:**
- Create: `store/saveQueue.ts`
- Create: `store/saveQueue.test.ts`

**Interfaces:**
- Produces (Task 6 wires this into the store):

```ts
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
export class SaveQueue<T> {
  constructor(
    saveFn: (snapshot: T, opts: { keepalive: boolean }) => Promise<void>,
    getSnapshot: () => T,
    onStatus: (s: SaveStatus) => void,
    delayMs?: number, // default 800
  );
  schedule(): void; // trailing debounce; sets status 'saving'
  flush(): void;    // if a save is pending, send now with keepalive
}
```

- [ ] **Step 1: Write the failing tests**

Create `store/saveQueue.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SaveQueue, type SaveStatus } from './saveQueue';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function deferred() {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('SaveQueue', () => {
  it('coalesces rapid schedules into one save with the latest snapshot', async () => {
    const saves: string[] = [];
    let snap = 'v1';
    const q = new SaveQueue<string>(async (s) => { saves.push(s); }, () => snap, () => {});
    q.schedule();
    snap = 'v2';
    q.schedule();
    snap = 'v3';
    q.schedule();
    await vi.advanceTimersByTimeAsync(800);
    expect(saves).toEqual(['v3']);
  });

  it('runs exactly one follow-up save for mutations arriving mid-flight', async () => {
    const saves: string[] = [];
    const gate = deferred();
    let snap = 'v1';
    const q = new SaveQueue<string>(
      async (s) => { saves.push(s); if (saves.length === 1) await gate.promise; },
      () => snap,
      () => {},
      800,
    );
    q.schedule();
    await vi.advanceTimersByTimeAsync(800); // first save now in flight, blocked on gate
    snap = 'v2';
    q.schedule();
    snap = 'v3';
    q.schedule();
    await vi.advanceTimersByTimeAsync(800); // debounce elapses while still in flight
    expect(saves).toEqual(['v1']); // no overlap
    gate.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(saves).toEqual(['v1', 'v3']); // one follow-up, newest snapshot
  });

  it('reports error on failure and recovers to saved on the next schedule', async () => {
    const statuses: SaveStatus[] = [];
    let fail = true;
    const q = new SaveQueue<string>(
      async () => { if (fail) throw new Error('boom'); },
      () => 'v',
      (s) => statuses.push(s),
      800,
    );
    q.schedule();
    await vi.advanceTimersByTimeAsync(800);
    expect(statuses.at(-1)).toBe('error');
    fail = false;
    q.schedule();
    await vi.advanceTimersByTimeAsync(800);
    expect(statuses.at(-1)).toBe('saved');
  });

  it('flush sends a pending save immediately with keepalive', async () => {
    const calls: { snap: string; keepalive: boolean }[] = [];
    const q = new SaveQueue<string>(
      async (snap, opts) => { calls.push({ snap, keepalive: opts.keepalive }); },
      () => 'v',
      () => {},
      800,
    );
    q.schedule();
    q.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual([{ snap: 'v', keepalive: true }]);
    await vi.advanceTimersByTimeAsync(800); // debounce timer must be cancelled
    expect(calls).toHaveLength(1);
  });

  it('flush with nothing pending is a no-op', async () => {
    const calls: string[] = [];
    const q = new SaveQueue<string>(async (s) => { calls.push(s); }, () => 'v', () => {}, 800);
    q.flush();
    await vi.advanceTimersByTimeAsync(800);
    expect(calls).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- store/saveQueue.test.ts`
Expected: FAIL — module `./saveQueue` does not exist.

- [ ] **Step 3: Implement**

Create `store/saveQueue.ts`:

```ts
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

// Trailing-debounce, single-flight save queue. At most one save is ever in
// flight; mutations arriving mid-flight coalesce into exactly one follow-up
// carrying the newest snapshot, so requests can never land out of order.
export class SaveQueue<T> {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight = false;
  private rerun = false;

  constructor(
    private readonly saveFn: (snapshot: T, opts: { keepalive: boolean }) => Promise<void>,
    private readonly getSnapshot: () => T,
    private readonly onStatus: (s: SaveStatus) => void,
    private readonly delayMs = 800,
  ) {}

  schedule(): void {
    this.onStatus('saving');
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run(false);
    }, this.delayMs);
  }

  // Send a pending save immediately (tab close). No-op when nothing is pending.
  flush(): void {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
    void this.run(true);
  }

  private async run(keepalive: boolean): Promise<void> {
    if (this.inFlight) {
      this.rerun = true;
      return;
    }
    this.inFlight = true;
    let failed = false;
    try {
      await this.saveFn(this.getSnapshot(), { keepalive });
    } catch {
      failed = true;
    }
    this.inFlight = false;
    if (this.rerun) {
      this.rerun = false;
      void this.run(keepalive);
      return;
    }
    // A new debounce window may have opened while we were in flight.
    if (this.timer === null) this.onStatus(failed ? 'error' : 'saved');
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- store/saveQueue.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add store/saveQueue.ts store/saveQueue.test.ts
git commit -m "feat: SaveQueue — debounced single-flight persistence primitive"
```

---

### Task 6: Wire SaveQueue into the store; honest save state end-to-end (H2 + H3)

**Files:**
- Modify: `lib/repository/RevisionRepository.ts` (save gains `opts`)
- Modify: `lib/repository/ApiRepository.ts` (throw on failure; keepalive support)
- Modify: `lib/repository/ApiRepository.test.ts`
- Modify: `lib/repository/MemoryRepository.ts` (signature)
- Modify: `store/useStore.ts` (queue wiring, `flushSave`, hydrate error handling)
- Modify: `store/useStore.test.ts` (debounce-aware tests)
- Modify: `components/StoreHydrator.tsx` (pagehide flush)
- Modify: `components/layout/HeaderControls.tsx` (error state)

**Interfaces:**
- Consumes: `SaveQueue`/`SaveStatus` from Task 5, `createRevisionStore` from Task 4.
- Produces: `RevisionRepository.save(data: AppData, opts?: { keepalive?: boolean }): Promise<void>` now throws on failure; store action `flushSave(): void`; `StoreState.saveState: SaveStatus`.

- [ ] **Step 1: Update repository tests to the new contract**

In `lib/repository/ApiRepository.test.ts`, replace the two `save` tests with:

```ts
  it('save PUTs the data as JSON', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const data = seedData();
    await new ApiRepository().save(data);
    expect(fetchMock).toHaveBeenCalledWith(DATA_ENDPOINT, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
      keepalive: false,
    });
  });

  it('save passes keepalive for tab-close flushes', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    await new ApiRepository().save(seedData(), { keepalive: true });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ keepalive: true });
  });

  it('save throws on network error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    await expect(new ApiRepository().save(seedData())).rejects.toThrow();
  });

  it('save throws on a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 500 })));
    await expect(new ApiRepository().save(seedData())).rejects.toThrow(/500/);
  });
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npm test -- lib/repository/ApiRepository.test.ts`
Expected: FAIL — save currently swallows errors and sends no `keepalive` field.

- [ ] **Step 3: Implement the repository contract**

`lib/repository/RevisionRepository.ts`:

```ts
import type { AppData } from '@/lib/domain/types';

export interface RevisionRepository {
  load(): Promise<AppData | null>;
  // Throws on failure — callers own retry/UI. keepalive survives tab close.
  save(data: AppData, opts?: { keepalive?: boolean }): Promise<void>;
}
```

`lib/repository/ApiRepository.ts` — replace the `save` method (and drop the "swallowed" sentence from the class comment):

```ts
  async save(data: AppData, opts: { keepalive?: boolean } = {}): Promise<void> {
    const res = await fetch(DATA_ENDPOINT, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
      keepalive: opts.keepalive ?? false,
    });
    if (!res.ok) throw new Error(`save failed: ${res.status}`);
  }
```

`lib/repository/MemoryRepository.ts` — update the signature to match (`async save(data: AppData, _opts?: { keepalive?: boolean }): Promise<void>`).

- [ ] **Step 4: Wire the queue into the store**

In `store/useStore.ts`:

```ts
import { SaveQueue, type SaveStatus } from './saveQueue';
```

In `StoreState`, change `saveState: 'idle' | 'saving' | 'saved';` to `saveState: SaveStatus;` and add `flushSave: () => void;`.

Inside `createRevisionStore`, replace the `persist` helper:

```ts
    const queue = new SaveQueue<AppData>(
      (snap, opts) => repo.save(snap, opts),
      () => snapshot(get()),
      (saveState) => set({ saveState }),
    );
    const persist = () => queue.schedule();
```

Add the action next to `undo`/`redo`:

```ts
    flushSave: () => queue.flush(),
```

Change `hydrate`'s seeding branch so a failed first save is visible, not fatal:

```ts
      const seeded = seedData();
      set({ ...seeded, history: emptyHistory<AppData>() });
      try {
        await repo.save(seeded);
      } catch {
        set({ saveState: 'error' });
      }
```

- [ ] **Step 5: Add debounce-aware store tests**

Append inside the `describe('useStore', ...)` block of `store/useStore.test.ts`:

```ts
  it('debounces persistence and saves the latest snapshot once', async () => {
    vi.useFakeTimers();
    try {
      const repo = new MemoryRepository();
      const store = createRevisionStore(repo);
      store.getState().addSubject('A');
      store.getState().addSubject('B');
      expect(store.getState().saveState).toBe('saving');
      await vi.advanceTimersByTimeAsync(800);
      expect((await repo.load())?.subjectOrder).toHaveLength(2);
      expect(store.getState().saveState).toBe('saved');
    } finally {
      vi.useRealTimers();
    }
  });

  it('flushSave sends a pending save immediately', async () => {
    vi.useFakeTimers();
    try {
      const repo = new MemoryRepository();
      const store = createRevisionStore(repo);
      store.getState().addSubject('A');
      store.getState().flushSave();
      await vi.advanceTimersByTimeAsync(0);
      expect((await repo.load())?.subjectOrder).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
```

Add `vi` to the vitest import in that file. The existing test `'marking a mutation sets saveState to saving'` still passes (schedule sets `'saving'` synchronously).

- [ ] **Step 6: Flush on tab close and show errors**

`components/StoreHydrator.tsx` — add a second effect:

```tsx
  useEffect(() => {
    const flush = () => useStore.getState().flushSave();
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);
```

`components/layout/HeaderControls.tsx` — extend the import to `import { Undo2, Redo2, Check, Loader2, TriangleAlert } from 'lucide-react';` and replace the save-state span body with:

```tsx
          {saveState === 'saving'
            ? <><Loader2 size={13} className="animate-spin text-accent" /> Saving…</>
            : saveState === 'error'
              ? <><TriangleAlert size={13} className="text-alarm" /> Save failed — retrying</>
              : <><Check size={13} className="text-go" /> Saved</>}
```

- [ ] **Step 7: Full suite + typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: PASS / clean. Note: the Task 4 hydrate-seeding test (`hydrate seeds 13 subjects on first run`) uses the singleton store whose fetch is stubbed to 204 in setup — `load()` returns `null` (204 has no body → `res.json()` throws → caught → `null`), then seeding saves successfully against the stub.

- [ ] **Step 8: Commit**

```bash
git add lib/repository/RevisionRepository.ts lib/repository/ApiRepository.ts lib/repository/ApiRepository.test.ts lib/repository/MemoryRepository.ts store/useStore.ts store/useStore.test.ts components/StoreHydrator.tsx components/layout/HeaderControls.tsx
git commit -m "feat: debounced single-flight saves with honest save state and tab-close flush"
```

---

### Task 7: Undo reverts structure, never typing (M5)

**Files:**
- Create: `store/silentFields.ts`
- Create: `store/silentFields.test.ts`
- Modify: `store/useStore.ts` (`undo`/`redo` wiring)
- Test: `store/useStore.test.ts` (integration)

**Interfaces:**
- Produces: `preserveSilentFields(restored: AppData, present: AppData): AppData`.

- [ ] **Step 1: Write the failing tests**

Create `store/silentFields.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { preserveSilentFields } from './silentFields';
import type { AppData, Topic } from '@/lib/domain/types';

function topic(id: string, notes: string, revisions = 0): Topic {
  return {
    id, chapterId: 'c1', title: id, notes, order: 0,
    difficulty: 'Medium', priority: 'Medium',
    revisionHistory: Array.from({ length: revisions }, (_, i) => ({ id: `r${i}`, timestamp: i })),
    createdAt: 1, updatedAt: 1,
  };
}

function data(topics: Topic[]): AppData {
  return {
    subjects: {}, chapters: {}, subjectOrder: [], tags: {}, tagOrder: [],
    topics: Object.fromEntries(topics.map((t) => [t.id, t])),
  };
}

describe('preserveSilentFields', () => {
  it('keeps present notes and revisionHistory for topics in both states', () => {
    const restored = data([topic('t1', 'old', 0)]);
    const present = data([topic('t1', 'new typing', 2)]);
    const out = preserveSilentFields(restored, present);
    expect(out.topics.t1.notes).toBe('new typing');
    expect(out.topics.t1.revisionHistory).toHaveLength(2);
  });

  it('leaves topics untouched when absent from the present state', () => {
    const restored = data([topic('t1', 'old')]);
    const out = preserveSilentFields(restored, data([]));
    expect(out.topics.t1.notes).toBe('old');
  });

  it('does not resurrect topics deleted from the restored state', () => {
    const out = preserveSilentFields(data([]), data([topic('t1', 'x')]));
    expect(out.topics.t1).toBeUndefined();
  });
});
```

Append to `store/useStore.test.ts` inside the describe block:

```ts
  it('undo reverts structure but keeps notes typed after the snapshot', () => {
    const s = useStore.getState().addSubject('S');
    const c = useStore.getState().addChapter(s, 'C');
    const t = useStore.getState().addTopic(c, 'T');
    useStore.getState().addChapter(s, 'C2'); // structural change to undo
    useStore.getState().updateTopicNotes(t, 'my notes'); // silent edit
    useStore.getState().undo();
    expect(useStore.getState().subjects[s].chapterIds).toHaveLength(1);
    expect(useStore.getState().topics[t].notes).toBe('my notes');
  });

  it('mark-revised survives undo of a later structural change', () => {
    const s = useStore.getState().addSubject('S');
    const c = useStore.getState().addChapter(s, 'C');
    const t = useStore.getState().addTopic(c, 'T');
    useStore.getState().addChapter(s, 'C2');
    useStore.getState().markTopicRevised(t); // silent edit
    useStore.getState().undo();
    expect(useStore.getState().topics[t].revisionHistory).toHaveLength(1);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- store/silentFields.test.ts store/useStore.test.ts`
Expected: FAIL — `./silentFields` missing; the undo integration tests see notes `''` / history length 0.

- [ ] **Step 3: Implement**

Create `store/silentFields.ts`:

```ts
import type { AppData } from '@/lib/domain/types';

// Notes edits and mark-revised are recorded without undo entries ("silent").
// When undo/redo restores a structural snapshot, carry the present values of
// those fields forward so typing and revision ticks are never reverted.
export function preserveSilentFields(restored: AppData, present: AppData): AppData {
  const topics = { ...restored.topics };
  for (const id of Object.keys(topics)) {
    const cur = present.topics[id];
    if (cur) topics[id] = { ...topics[id], notes: cur.notes, revisionHistory: cur.revisionHistory };
  }
  return { ...restored, topics };
}
```

In `store/useStore.ts`, import it and wire both directions:

```ts
import { preserveSilentFields } from './silentFields';
```
```ts
    undo: () => {
      const res = undoHistory(get().history, snapshot(get()));
      if (!res) return;
      set({ ...preserveSilentFields(res.present, snapshot(get())), history: res.history });
      persist();
    },
    redo: () => {
      const res = redoHistory(get().history, snapshot(get()));
      if (!res) return;
      set({ ...preserveSilentFields(res.present, snapshot(get())), history: res.history });
      persist();
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- store/silentFields.test.ts store/useStore.test.ts`
Expected: PASS, including the pre-existing `'undo reverts a structural change; redo re-applies it'` test.

- [ ] **Step 5: Commit**

```bash
git add store/silentFields.ts store/silentFields.test.ts store/useStore.ts store/useStore.test.ts
git commit -m "fix: undo restores structure only — notes and revisions survive"
```

---

### Task 8: Blob GC sweep; remove eager client-side deletes (M1)

**Files:**
- Create: `lib/repository/gc.ts`
- Create: `lib/repository/gc.test.ts`
- Create: `app/api/files/gc/route.ts`
- Modify: `components/StoreHydrator.tsx` (fire GC after hydrate)
- Modify: `components/AttachmentsPanel.tsx:31-34,56,66` (drop eager DELETE)
- Modify: `app/archive/page.tsx:15-20,58` (drop `purgeTopicBlobs`)

**Interfaces:**
- Consumes: `filesDir`, `deleteBlob`, `isValidBlobId` from `lib/repository/fileBlobStore.ts`; `readData` from `lib/repository/fileStore.ts`.
- Produces: `referencedBlobIds(data: AppData | null): Set<string>`; `sweepUnreferenced(referenced: Set<string>, now?: number): Promise<{ scanned: number; deleted: number }>`; `GC_GRACE_MS` (24h); route `POST /api/files/gc` → `{ scanned, deleted }`.

- [ ] **Step 1: Write the failing tests**

Create `lib/repository/gc.test.ts` (temp-dir pattern copied from `fileBlobStore.test.ts`):

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { AppData, Topic } from '@/lib/domain/types';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ce-gc-'));
  process.env.DATA_FILE = path.join(dir, 'appdata.json');
});
afterEach(async () => {
  delete process.env.DATA_FILE;
  await fs.rm(dir, { recursive: true, force: true });
});

function topicWithUpload(blobId: string): Topic {
  return {
    id: 't1', chapterId: 'c1', title: 'T', notes: '', order: 0,
    difficulty: 'Medium', priority: 'Medium', revisionHistory: [],
    createdAt: 1, updatedAt: 1,
    attachments: [
      { id: blobId, name: 'f.png', kind: 'image', url: `/api/files/${blobId}`, createdAt: 1 },
      { id: 'ext', name: 'site', kind: 'link', url: 'https://example.com', createdAt: 1 },
    ],
  };
}

function appData(topics: Topic[]): AppData {
  return {
    subjects: {}, chapters: {}, subjectOrder: [], tags: {}, tagOrder: [],
    topics: Object.fromEntries(topics.map((t) => [t.id, t])),
  };
}

describe('referencedBlobIds', () => {
  it('collects upload ids and ignores external links', async () => {
    const { referencedBlobIds } = await import('./gc');
    const ids = referencedBlobIds(appData([topicWithUpload('blob-a')]));
    expect(ids).toEqual(new Set(['blob-a']));
  });

  it('returns an empty set for null data', async () => {
    const { referencedBlobIds } = await import('./gc');
    expect(referencedBlobIds(null).size).toBe(0);
  });
});

describe('sweepUnreferenced', () => {
  it('deletes old unreferenced blobs, keeps referenced and young ones', async () => {
    const { writeBlob, readBlob, GC_GRACE_MS } = await import('./fileBlobStore');
    const { sweepUnreferenced } = await import('./gc');
    const meta = { name: 'f', mime: 'image/png', size: 1 };
    await writeBlob('kept-ref', Buffer.from('a'), meta);
    await writeBlob('kept-young', Buffer.from('b'), meta);
    await writeBlob('gone-old', Buffer.from('c'), meta);
    // Age the old one past the grace period via mtime.
    const old = new Date(Date.now() - GC_GRACE_MS - 60_000);
    await fs.utimes(path.join(dir, 'files', 'gone-old'), old, old);

    const result = await sweepUnreferenced(new Set(['kept-ref']));
    expect(result).toEqual({ scanned: 3, deleted: 1 });
    expect(await readBlob('kept-ref')).not.toBeNull();
    expect(await readBlob('kept-young')).not.toBeNull();
    expect(await readBlob('gone-old')).toBeNull();
    // Meta sidecar removed too.
    await expect(fs.stat(path.join(dir, 'files', 'gone-old.json'))).rejects.toThrow();
  });

  it('returns zeros when the files dir does not exist', async () => {
    const { sweepUnreferenced } = await import('./gc');
    expect(await sweepUnreferenced(new Set())).toEqual({ scanned: 0, deleted: 0 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/repository/gc.test.ts`
Expected: FAIL — `./gc` does not exist; `GC_GRACE_MS` not exported from fileBlobStore.

- [ ] **Step 3: Implement**

In `lib/repository/fileBlobStore.ts`, add:

```ts
export const GC_GRACE_MS = 24 * 60 * 60 * 1000;
```

Create `lib/repository/gc.ts`:

```ts
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AppData } from '@/lib/domain/types';
import { filesDir, deleteBlob, GC_GRACE_MS } from './fileBlobStore';

const UPLOAD_URL_RE = /^\/api\/files\/([A-Za-z0-9-]+)$/;

export function referencedBlobIds(data: AppData | null): Set<string> {
  const ids = new Set<string>();
  if (!data) return ids;
  for (const t of Object.values(data.topics)) {
    for (const a of t.attachments ?? []) {
      const m = a.url.match(UPLOAD_URL_RE);
      if (m) ids.add(m[1]);
    }
  }
  return ids;
}

// Delete blobs no longer referenced by any attachment. Blobs younger than
// the grace period are kept so in-session undo can still restore them.
export async function sweepUnreferenced(
  referenced: Set<string>,
  now = Date.now(),
): Promise<{ scanned: number; deleted: number }> {
  const dir = filesDir();
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return { scanned: 0, deleted: 0 };
  }
  const ids = entries.filter((e) => !e.endsWith('.json'));
  let deleted = 0;
  for (const id of ids) {
    if (referenced.has(id)) continue;
    try {
      const stat = await fs.stat(path.join(dir, id));
      if (now - stat.mtimeMs < GC_GRACE_MS) continue;
      await deleteBlob(id);
      deleted++;
    } catch {
      // Raced with another delete or unreadable entry — skip.
    }
  }
  return { scanned: ids.length, deleted };
}
```

Create `app/api/files/gc/route.ts`:

```ts
import { readData } from '@/lib/repository/fileStore';
import { referencedBlobIds, sweepUnreferenced } from '@/lib/repository/gc';

export const dynamic = 'force-dynamic';

export async function POST() {
  const data = await readData();
  const result = await sweepUnreferenced(referencedBlobIds(data));
  return Response.json(result);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/repository/gc.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Trigger GC on load; remove eager client deletes**

`components/StoreHydrator.tsx` — in the hydrate effect, fire-and-forget after hydration:

```tsx
  useEffect(() => {
    void hydrate().then(() => {
      setReady(true);
      void fetch('/api/files/gc', { method: 'POST' }).catch(() => {});
    });
  }, [hydrate]);
```

`components/AttachmentsPanel.tsx` — the blob now outlives the record (GC collects it later), so deletion is store-only. Replace the `remove` helper (lines 31-34) with:

```tsx
  const remove = (id: string) => removeAttachment(topic.id, id);
```

update the button at line 66 to `onClick={() => remove(a.id)}`, and delete the now-unused `const isUpload = a.url.startsWith('/api/files/');` at line 56 (the icon/thumbnail branches key off `a.kind`, not `isUpload`).

`app/archive/page.tsx` — delete the `purgeTopicBlobs` function (lines 15-20) and change the topic `onPurge` at line 58 to:

```tsx
              onPurge={() => { if (window.confirm(`Permanently delete "${t.title}"?`)) store.deleteTopic(t.id); }} />
```

- [ ] **Step 6: Full suite + typecheck + lint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: PASS / clean / clean.

- [ ] **Step 7: Commit**

```bash
git add lib/repository/fileBlobStore.ts lib/repository/gc.ts lib/repository/gc.test.ts app/api/files/gc/route.ts components/StoreHydrator.tsx components/AttachmentsPanel.tsx app/archive/page.tsx
git commit -m "feat: blob GC sweep with 24h grace; drop eager client-side blob deletes"
```

---

### Task 9: Seed single source of truth (M2)

**Files:**
- Delete: `scripts/gen_seed.py`
- Create: `scripts/gen-seed.ts`

**Interfaces:**
- Consumes: `seedData()` from `lib/repository/seed.ts`.

- [ ] **Step 1: Create the TS generator**

Create `scripts/gen-seed.ts`:

```ts
// Regenerate a fresh appdata.json from the canonical seed.
// Usage: npx tsx scripts/gen-seed.ts [outfile]   (default: data/appdata.json)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { seedData } from '../lib/repository/seed';

const out = process.argv[2] ?? 'data/appdata.json';
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(seedData(), null, 2));
console.log(`Wrote ${out}`);
```

- [ ] **Step 2: Verify it runs and produces the full syllabus**

Run: `npx tsx scripts/gen-seed.ts /tmp/claude-gen-seed-check.json && node -e "const d=require('/tmp/claude-gen-seed-check.json'); console.log(d.subjectOrder.length + ' subjects'); process.exit(d.subjectOrder.length === 13 ? 0 : 1)" && rm /tmp/claude-gen-seed-check.json`
Expected: prints `Wrote /tmp/claude-gen-seed-check.json` then `13 subjects`, exit 0. (`seed.ts` imports use the `@/` alias only via its own relative deps — if `tsx` fails on `@/lib/...` resolution, run with `npx tsx --tsconfig tsconfig.json scripts/gen-seed.ts`, which resolves the `@/*` path mapping.)

- [ ] **Step 3: Remove the Python duplicate**

```bash
git rm scripts/gen_seed.py
```

- [ ] **Step 4: Commit**

```bash
git add scripts/gen-seed.ts
git commit -m "refactor: single seed source — TS generator replaces gen_seed.py"
```

---

### Task 10: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full gates**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean / 0 problems / all tests pass (≈120 tests, 0 failures).

- [ ] **Step 2: Manual end-to-end checks (from the spec's exit criteria)**

Start the dev server: `npm run dev` (note port). Then:

1. Traversal guard: `curl -s -o /dev/null -w "%{http_code}" -X DELETE "http://127.0.0.1:3000/api/files/..%2Fappdata.json"` → expected `400`.
2. GC endpoint: `curl -s -X POST http://127.0.0.1:3000/api/files/gc` → expected `{"scanned":N,"deleted":M}` JSON.
3. Save coalescing: open the app, type continuously in a topic's notes for ~5 s; the header shows "Saving…" then a single "Saved" — confirm via server logs / network tab that PUTs are coalesced (roughly one per pause), not one per keystroke.
4. Honest errors: stop the dev server while editing → header shows "Save failed — retrying"; restart server, make another edit → returns to "Saved".
5. Undo safety: create a chapter, type notes in a topic, press Ctrl+Z once → chapter creation undone, notes intact.

- [ ] **Step 3: Report**

Summarize gate output and manual-check results. Do not claim completion unless every gate passed (superpowers:verification-before-completion).
