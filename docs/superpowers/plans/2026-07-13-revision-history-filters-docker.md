# Editable Revision History, Filter Cleanup & Docker Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make revision-history entries deletable and time-editable, trim the filter bar to three status chips, and make Docker data survive container removal (spec: `docs/superpowers/specs/2026-07-13-revision-history-filters-docker-design.md`).

**Architecture:** Pure helpers in the revision engine (clamp + re-sort invariants), thin silent store actions wrapping them, hover row-actions in the history panel; filter cleanup is type-narrowing plus label change; Docker persistence is a compose file with the existing named volume plus a one-time verified migration.

**Tech Stack:** Next.js 15, React 19, Zustand 5, Vitest 3 (jsdom, globals on, `@` alias = repo root), Docker + compose v2.

## Global Constraints

- Revision edits are **silent**: they go through `commitSilent`, never create undo entries, and persist via the existing save queue.
- Timestamp invariants: edited timestamps clamp to `min(timestamp, now)`; `revisionHistory` stays sorted ascending by timestamp (the engine reads `h[h.length - 1]` as latest).
- Filter keys: `StatusFilter` becomes exactly `'needs-revision' | 'never-revised' | 'has-attachments'`; the `has-attachments` **key** is unchanged, only its label becomes `Attachments`.
- Docker: named volume `ce-revision-data` mounted at `/app/data`, `restart: unless-stopped`, host port `3200`. Backup path: `~/ce-revision-backups/appdata-2026-07-13.json`. Containers approved for removal: `ce-revision`, `ce-revision-blueprint`.
- No new npm dependencies. Gates per task: `npm test`, `npx tsc --noEmit`, `npm run lint`.
- Commit after every task with trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Engine helpers — deleteRevision & updateRevisionTimestamp

**Files:**
- Modify: `lib/revision/engine.ts` (append after `markRevised`, ~line 72)
- Test: `lib/revision/engine.test.ts` (append)

**Interfaces:**
- Consumes: existing `Topic`/`Revision` types from `@/lib/domain/types`; `lastRevisedAt` from the same file (tests).
- Produces (Task 2 wraps these):
  - `deleteRevision(topic: Topic, revisionId: string, now: number): Topic`
  - `updateRevisionTimestamp(topic: Topic, revisionId: string, timestamp: number, now: number): Topic`
  Both return the input `topic` unchanged (same reference) when `revisionId` is not found. (Note: the spec sketched `deleteRevision(topic, revisionId)`; a `now` parameter is added for purity — `updatedAt` must bump without the engine calling `Date.now()`.)

- [ ] **Step 1: Write the failing tests**

Append to `lib/revision/engine.test.ts` (the file already defines `DAY`, `rev`, and `baseTopic` at the top — reuse them; extend the import from `./engine` with `deleteRevision, updateRevisionTimestamp`):

```ts
describe('deleteRevision', () => {
  it('removes the entry with the given id and bumps updatedAt', () => {
    const t = baseTopic([{ id: 'r1', timestamp: 100 }, { id: 'r2', timestamp: 200 }]);
    const out = deleteRevision(t, 'r1', 999);
    expect(out.revisionHistory).toEqual([{ id: 'r2', timestamp: 200 }]);
    expect(out.updatedAt).toBe(999);
  });

  it('returns the topic unchanged for an unknown id', () => {
    const t = baseTopic([{ id: 'r1', timestamp: 100 }]);
    expect(deleteRevision(t, 'nope', 999)).toBe(t);
  });

  it('deleting the latest entry shifts lastRevisedAt', () => {
    const t = baseTopic([{ id: 'r1', timestamp: 100 }, { id: 'r2', timestamp: 200 }]);
    const out = deleteRevision(t, 'r2', 999);
    expect(lastRevisedAt(out.revisionHistory)).toBe(100);
  });

  it('deleting the only entry returns the topic to never-revised', () => {
    const t = baseTopic([{ id: 'r1', timestamp: 100 }]);
    const out = deleteRevision(t, 'r1', 999);
    expect(out.revisionHistory).toEqual([]);
    expect(lastRevisedAt(out.revisionHistory)).toBeUndefined();
  });
});

describe('updateRevisionTimestamp', () => {
  it('changes the timestamp and re-sorts ascending', () => {
    const t = baseTopic([{ id: 'r1', timestamp: 100 }, { id: 'r2', timestamp: 200 }]);
    const out = updateRevisionTimestamp(t, 'r1', 300, 1000);
    expect(out.revisionHistory.map((r) => r.id)).toEqual(['r2', 'r1']);
    expect(lastRevisedAt(out.revisionHistory)).toBe(300);
    expect(out.updatedAt).toBe(1000);
  });

  it('clamps a future timestamp to now', () => {
    const t = baseTopic([{ id: 'r1', timestamp: 100 }]);
    const out = updateRevisionTimestamp(t, 'r1', 5000, 1000);
    expect(out.revisionHistory[0].timestamp).toBe(1000);
  });

  it('returns the topic unchanged for an unknown id', () => {
    const t = baseTopic([{ id: 'r1', timestamp: 100 }]);
    expect(updateRevisionTimestamp(t, 'nope', 300, 1000)).toBe(t);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/revision/engine.test.ts`
Expected: FAIL — `deleteRevision` / `updateRevisionTimestamp` not exported.

- [ ] **Step 3: Implement**

Append to `lib/revision/engine.ts` after `markRevised`:

```ts
export function deleteRevision(topic: Topic, revisionId: string, now: number): Topic {
  if (!topic.revisionHistory.some((r) => r.id === revisionId)) return topic;
  return {
    ...topic,
    revisionHistory: topic.revisionHistory.filter((r) => r.id !== revisionId),
    updatedAt: now,
  };
}

// Clamps to now (a future "last revised" breaks days-since/badge math) and
// re-sorts: the engine reads h[h.length - 1] as the latest revision.
export function updateRevisionTimestamp(topic: Topic, revisionId: string, timestamp: number, now: number): Topic {
  if (!topic.revisionHistory.some((r) => r.id === revisionId)) return topic;
  const clamped = Math.min(timestamp, now);
  const revisionHistory = topic.revisionHistory
    .map((r) => (r.id === revisionId ? { ...r, timestamp: clamped } : r))
    .sort((a, b) => a.timestamp - b.timestamp);
  return { ...topic, revisionHistory, updatedAt: now };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/revision/engine.test.ts`
Expected: PASS (7 new tests, all pre-existing engine tests still green).

- [ ] **Step 5: Commit**

```bash
git add lib/revision/engine.ts lib/revision/engine.test.ts
git commit -m "feat: engine helpers to delete and re-time revision entries"
```

---

### Task 2: Store actions — silent revision edits

**Files:**
- Modify: `store/useStore.ts`
- Test: `store/useStore.test.ts` (append)

**Interfaces:**
- Consumes: Task 1's `deleteRevision`/`updateRevisionTimestamp` from `@/lib/revision/engine`; the store's existing `commitSilent` helper.
- Produces (Task 3 calls these):
  - store action `deleteRevision(topicId: string, revisionId: string): void`
  - store action `updateRevisionTimestamp(topicId: string, revisionId: string, timestamp: number): void`

- [ ] **Step 1: Write the failing tests**

Append inside the `describe('useStore', ...)` block of `store/useStore.test.ts`:

```ts
  it('deleteRevision removes one entry silently (no undo entry)', () => {
    const s = useStore.getState().addSubject('S');
    const c = useStore.getState().addChapter(s, 'C');
    const t = useStore.getState().addTopic(c, 'T');
    useStore.getState().markTopicRevised(t);
    useStore.getState().markTopicRevised(t);
    const rid = useStore.getState().topics[t].revisionHistory[0].id;
    const before = useStore.getState().history.past.length;
    useStore.getState().deleteRevision(t, rid);
    expect(useStore.getState().topics[t].revisionHistory).toHaveLength(1);
    expect(useStore.getState().history.past.length).toBe(before);
  });

  it('updateRevisionTimestamp re-times an entry silently and keeps order sorted', () => {
    const s = useStore.getState().addSubject('S');
    const c = useStore.getState().addChapter(s, 'C');
    const t = useStore.getState().addTopic(c, 'T');
    useStore.getState().markTopicRevised(t);
    useStore.getState().markTopicRevised(t);
    const [first, second] = useStore.getState().topics[t].revisionHistory;
    const before = useStore.getState().history.past.length;
    useStore.getState().updateRevisionTimestamp(t, second.id, first.timestamp - 1000);
    const h = useStore.getState().topics[t].revisionHistory;
    expect(h[0].id).toBe(second.id); // re-sorted: edited entry is now oldest
    expect(h[0].timestamp).toBe(first.timestamp - 1000);
    expect(useStore.getState().history.past.length).toBe(before);
  });

  it('revision edits on a missing topic are no-ops', () => {
    expect(() => useStore.getState().deleteRevision('missing', 'r')).not.toThrow();
    expect(() => useStore.getState().updateRevisionTimestamp('missing', 'r', 1)).not.toThrow();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- store/useStore.test.ts`
Expected: FAIL — `deleteRevision` is not a function on the store.

- [ ] **Step 3: Implement**

In `store/useStore.ts`:

1. Extend the engine import (currently `import { markRevised } from '@/lib/revision/engine';`) — alias to avoid colliding with the store action names:

```ts
import { markRevised, deleteRevision as engineDeleteRevision, updateRevisionTimestamp as engineUpdateRevisionTimestamp } from '@/lib/revision/engine';
```

2. Add to the `StoreState` interface, next to `markTopicRevised`:

```ts
  deleteRevision: (topicId: string, revisionId: string) => void;
  updateRevisionTimestamp: (topicId: string, revisionId: string, timestamp: number) => void;
```

3. Add the actions in the store body, directly after `markTopicRevised` (which is at ~line 218; follow its exact shape):

```ts
      deleteRevision: (topicId, revisionId) => {
        const s = get();
        const topic = s.topics[topicId];
        if (!topic) return;
        commitSilent({ topics: { ...s.topics, [topicId]: engineDeleteRevision(topic, revisionId, Date.now()) } });
      },

      updateRevisionTimestamp: (topicId, revisionId, timestamp) => {
        const s = get();
        const topic = s.topics[topicId];
        if (!topic) return;
        commitSilent({ topics: { ...s.topics, [topicId]: engineUpdateRevisionTimestamp(topic, revisionId, timestamp, Date.now()) } });
      },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- store/useStore.test.ts`
Expected: PASS (3 new tests).

- [ ] **Step 5: Commit**

```bash
git add store/useStore.ts store/useStore.test.ts
git commit -m "feat: silent store actions to delete and re-time revisions"
```

---

### Task 3: Revision History panel — row actions

**Files:**
- Modify: `components/RevisionHistoryPanel.tsx` (full replacement below)
- Test: `components/RevisionHistoryPanel.test.tsx` (append)

**Interfaces:**
- Consumes: Task 2's store actions `deleteRevision(topicId, revisionId)` and `updateRevisionTimestamp(topicId, revisionId, timestamp)`.
- Produces: UI only — nothing downstream.

- [ ] **Step 1: Write the failing tests**

Append to `components/RevisionHistoryPanel.test.tsx` (keep the existing test; extend imports at the top to `import { it, expect, beforeEach, vi } from 'vitest';` and add `fireEvent` to the testing-library import):

```tsx
it('delete button removes a revision after confirm', () => {
  const s = useStore.getState().addSubject('S');
  const c = useStore.getState().addChapter(s, 'C');
  const t = useStore.getState().addTopic(c, 'T');
  useStore.getState().markTopicRevised(t);
  useStore.getState().markTopicRevised(t);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  render(<RevisionHistoryPanel topic={useStore.getState().topics[t]} />);
  fireEvent.click(screen.getAllByLabelText('Delete revision')[0]);
  expect(useStore.getState().topics[t].revisionHistory).toHaveLength(1);
  vi.restoreAllMocks();
});

it('confirm=false leaves history untouched', () => {
  const s = useStore.getState().addSubject('S');
  const c = useStore.getState().addChapter(s, 'C');
  const t = useStore.getState().addTopic(c, 'T');
  useStore.getState().markTopicRevised(t);
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  render(<RevisionHistoryPanel topic={useStore.getState().topics[t]} />);
  fireEvent.click(screen.getByLabelText('Delete revision'));
  expect(useStore.getState().topics[t].revisionHistory).toHaveLength(1);
  vi.restoreAllMocks();
});

it('editing a timestamp commits through the store', () => {
  const s = useStore.getState().addSubject('S');
  const c = useStore.getState().addChapter(s, 'C');
  const t = useStore.getState().addTopic(c, 'T');
  useStore.getState().markTopicRevised(t);
  render(<RevisionHistoryPanel topic={useStore.getState().topics[t]} />);
  fireEvent.click(screen.getByLabelText('Edit revision time'));
  const input = screen.getByLabelText('Revision timestamp');
  fireEvent.change(input, { target: { value: '2026-07-10T09:30' } });
  fireEvent.blur(input);
  const ts = useStore.getState().topics[t].revisionHistory[0].timestamp;
  expect(new Date(ts).getFullYear()).toBe(2026);
  expect(new Date(ts).getMonth()).toBe(6); // July (0-indexed), local time
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- components/RevisionHistoryPanel.test.tsx`
Expected: FAIL — no element labeled "Delete revision".

- [ ] **Step 3: Implement — replace `components/RevisionHistoryPanel.tsx` with:**

```tsx
'use client';
import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import type { Topic } from '@/lib/domain/types';
import { useStore } from '@/store/useStore';
import { totalRevisions, relativeLabel } from '@/lib/revision/engine';

// datetime-local wants a local-time "YYYY-MM-DDTHH:mm" string.
function toLocalInputValue(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function RevisionHistoryPanel({ topic }: { topic: Topic }) {
  const { deleteRevision, updateRevisionTimestamp } = useStore.getState();
  const [editingId, setEditingId] = useState<string | null>(null);
  const now = Date.now();
  const history = [...topic.revisionHistory].reverse();

  const remove = (id: string, n: number, ts: number) => {
    const d = new Date(ts);
    if (window.confirm(`Delete Revision ${n} (${d.toLocaleDateString()} ${d.toLocaleTimeString()})? The revision count and next due date will recalculate.`)) {
      deleteRevision(topic.id, id);
    }
  };

  const commitEdit = (id: string, value: string) => {
    const ts = new Date(value).getTime();
    if (!Number.isNaN(ts)) updateRevisionTimestamp(topic.id, id, ts);
    setEditingId(null);
  };

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
            const n = history.length - i;
            return (
              <li key={r.id} className="group flex items-center justify-between gap-2 text-sm">
                <span>Revision {n}</span>
                <span className="flex items-center gap-1">
                  {editingId === r.id ? (
                    <input
                      type="datetime-local"
                      aria-label="Revision timestamp"
                      defaultValue={toLocalInputValue(r.timestamp)}
                      max={toLocalInputValue(now)}
                      autoFocus
                      onBlur={(e) => commitEdit(r.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitEdit(r.id, (e.target as HTMLInputElement).value);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      className="rounded bg-black/30 px-1.5 py-0.5 text-sm outline-none"
                    />
                  ) : (
                    <span className="opacity-70">{d.toLocaleDateString()} {d.toLocaleTimeString()} · {relativeLabel(r.timestamp, now)}</span>
                  )}
                  <button aria-label="Edit revision time" onClick={() => setEditingId(r.id)}
                    className="rounded p-1 opacity-0 transition-opacity hover:bg-white/10 group-hover:opacity-100"><Pencil size={13} /></button>
                  <button aria-label="Delete revision" onClick={() => remove(r.id, n, r.timestamp)}
                    className="rounded p-1 opacity-0 transition-opacity hover:bg-white/10 group-hover:opacity-100"><Trash2 size={13} /></button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

Note: the action buttons use `opacity-0 group-hover:opacity-100` (hover-revealed), but remain in the DOM — the tests find them by `aria-label` regardless of visual state.

- [ ] **Step 4: Run tests to verify they pass, then the full gate**

Run: `npm test -- components/RevisionHistoryPanel.test.tsx`
Expected: PASS (4 tests: 1 pre-existing + 3 new).
Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all green / clean / clean.

- [ ] **Step 5: Commit**

```bash
git add components/RevisionHistoryPanel.tsx components/RevisionHistoryPanel.test.tsx
git commit -m "feat: delete and re-time revision entries from the history panel"
```

---

### Task 4: Filter bar cleanup

**Files:**
- Modify: `lib/filters/predicates.ts:4-6,24-25`
- Modify: `components/FilterBar.tsx:8-14`
- Test: `lib/filters/predicates.test.ts:33-50`

**Interfaces:**
- Consumes: nothing from earlier tasks (independent).
- Produces: `StatusFilter = 'needs-revision' | 'never-revised' | 'has-attachments'` — `store/useFilters.ts` stores these keys but is ephemeral, so no migration.

- [ ] **Step 1: Update the test that uses a removed status**

In `lib/filters/predicates.test.ts`, the `matchingTopics` test (lines 33-50) filters on `'bookmarked'`. Rewrite that test to use `has-attachments` (t1 gains an attachment instead of a bookmark):

```ts
  it('matchingTopics returns matches with context, scoped optionally', () => {
    const data: AppData = {
      subjectOrder: ['s1'],
      subjects: { s1: { id: 's1', name: 'S', color: '#000', icon: 'X', order: 0, chapterIds: ['c1'] } },
      chapters: { c1: { id: 'c1', subjectId: 's1', name: 'C', order: 0, difficulty: 'Medium', priority: 'Medium', topicIds: ['t1', 't2'] } },
      topics: {
        t1: topic({ id: 't1', chapterId: 'c1', attachments: [{ id: 'a1', name: 'f.png', kind: 'image', url: '/api/files/a1', createdAt: 1 }] }),
        t2: topic({ id: 't2', chapterId: 'c1' }),
      },
      tags: {},
      tagOrder: [],
    };
    const res = matchingTopics(data, { tagIds: [], statuses: ['has-attachments'] }, now);
    expect(res).toHaveLength(1);
    expect(res[0].topic.id).toBe('t1');
    expect(res[0].subject?.id).toBe('s1');
    expect(matchingTopics(data, { tagIds: [], statuses: ['has-attachments'] }, now, { chapterId: 'cX' })).toHaveLength(0);
  });
```

- [ ] **Step 2: Narrow the type and predicates**

In `lib/filters/predicates.ts`, replace the `StatusFilter` type (lines 4-6):

```ts
export type StatusFilter = 'needs-revision' | 'never-revised' | 'has-attachments';
```

and in `topicMatchesStatus`, delete the two cases:

```ts
    case 'bookmarked': return !!topic.bookmarkedAt;
    case 'has-flashcards': return (topic.flashcards?.length ?? 0) > 0;
```

- [ ] **Step 3: Update the filter bar**

In `components/FilterBar.tsx`, replace the `STATUSES` array (lines 8-14):

```ts
const STATUSES: { key: StatusFilter; label: string }[] = [
  { key: 'needs-revision', label: 'Needs Revision' },
  { key: 'never-revised', label: 'Never Revised' },
  { key: 'has-attachments', label: 'Attachments' },
];
```

- [ ] **Step 4: Full gate**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all green — tsc in particular proves no other file still references the removed status keys (`store/useFilters.ts` stores `StatusFilter[]` generically and needs no change; verify with `grep -rn "bookmarked'\|has-flashcards" lib components store --include="*.ts*" | grep -v test | grep -v bookmarkedAt` → no hits).

- [ ] **Step 5: Commit**

```bash
git add lib/filters/predicates.ts lib/filters/predicates.test.ts components/FilterBar.tsx
git commit -m "feat: trim status filters to needs-revision/never-revised/attachments"
```

---

### Task 5: Docker persistence — compose file + one-time migration

**Files:**
- Create: `docker-compose.yml` (repo root)

This task is part repo artifact, part host operations. The operations were **explicitly approved by the user**, including removing the `ce-revision` and `ce-revision-blueprint` containers. Every step verifies before the next; abort and report BLOCKED if any verification fails.

**Interfaces:**
- Consumes: existing Docker image build (`Dockerfile`), existing named volume `ce-revision-data` (holds a stale Jul 12 copy that will be overwritten), running containers `ce-revision` (port 3200, live data, no mounts) and `ce-revision-blueprint` (port 3201, stale, disposable).
- Produces: app on port 3200 with data in the named volume, surviving container removal.

- [ ] **Step 1: Create `docker-compose.yml`**

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

- [ ] **Step 2: Back up the LIVE data (container copy, not the stale volume copy)**

```bash
mkdir -p ~/ce-revision-backups
docker cp ce-revision:/app/data/appdata.json ~/ce-revision-backups/appdata-2026-07-13.json
ls -l ~/ce-revision-backups/appdata-2026-07-13.json
```
Expected: file exists, size ≈ 70,000+ bytes (the live copy; the stale volume copy is ~65KB). **Do not proceed if this file is missing or tiny.**

- [ ] **Step 3: Remove the old containers (approved)**

```bash
docker rm -f ce-revision ce-revision-blueprint
docker ps --format '{{.Names}}' | grep -c ce-revision || echo "0"
```
Expected: `0` — both gone.

- [ ] **Step 4: Build and start via compose**

From `/home/subaru/projects/Civil_Engineering_revision`:

```bash
docker compose build
docker compose up -d
docker inspect ce-revision --format '{{json .Mounts}}'
```
Expected: build succeeds (the image now contains Tasks 1-4); Mounts JSON shows volume `ce-revision-data` at `/app/data`; `docker inspect ce-revision --format '{{.HostConfig.RestartPolicy.Name}}'` prints `unless-stopped`.

- [ ] **Step 5: Restore the live data into the volume and restart**

```bash
docker cp ~/ce-revision-backups/appdata-2026-07-13.json ce-revision:/app/data/appdata.json
docker restart ce-revision && sleep 8
curl -s http://127.0.0.1:3200/api/data | head -c 300
```
Expected: JSON starting with `{"subjects":{...` containing real subject names (e.g. "Building Materials") — not `null`, not the seed's untouched shape. Spot-check size: `curl -s http://127.0.0.1:3200/api/data | wc -c` ≈ 70,000+.

- [ ] **Step 6: Destruction test — the whole point**

```bash
docker rm -f ce-revision
docker compose up -d && sleep 8
curl -s http://127.0.0.1:3200/api/data | wc -c
```
Expected: still ≈ 70,000+ bytes — data survived container removal. If this returns the seed size or null, STOP and report BLOCKED (do not delete the host backup regardless).

- [ ] **Step 7: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: docker compose with named data volume — data survives container removal"
```

---

### Task 6: Final verification

**Files:** none.

- [ ] **Step 1: Gates**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean / 0 problems / all tests green (≈151: 138 baseline + 13 new).

- [ ] **Step 2: Manual checks**

Against the compose-managed container on port 3200 (which now runs this code):
1. Open a topic with revisions → hover a history row → × asks for confirmation, deleting updates Total Revisions and the due badge.
2. ✎ opens the datetime editor; picking an earlier time re-orders history; a future time is refused by the input (`max`) and clamped by the engine.
3. Filter bar shows exactly: Needs Revision, Never Revised, Attachments (plus tag chips).
4. `/bookmarks` page and topic star still work.

- [ ] **Step 3: Report**

Summarize gate output, migration verification (steps 5-6 of Task 5), and manual checks. Claim completion only with all evidence present (superpowers:verification-before-completion).
