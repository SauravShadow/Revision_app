# Phase 3: Rich Editor, Attachments, Flashcards & Bookmarks — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the topic page into a rich study surface — an enhanced markdown editor (KaTeX, code highlighting, tables, task lists, callouts, collapsibles), durable image/PDF attachments, per-topic flashcards, and bookmarks — without changing the persistence contract.

**Architecture:** Notes stay a markdown string; richness is all in the render pipeline + insert toolbar. Uploaded binaries go to `/app/data/files/` on the same Docker volume as `appdata.json` (durable), and only lightweight `Attachment` references live in the JSON snapshot. New `Topic` fields (`attachments`, `flashcards`, `bookmarkedAt`) are optional/additive. All new store actions flow through the existing `commit` path, so they are undoable and auto-saved.

**Tech Stack:** Next.js 15 + React 19 + TypeScript, Zustand, react-markdown + remark/rehype (gfm, math, katex, highlight, raw, sanitize), Vitest + Testing Library.

## Global Constraints

- **Node:** 18.19 in this environment. Do not upgrade Next/Vitest majors (Node-20-only). Pinned toolchain from Phase 1 stays.
- **Package manager:** npm.
- **Notes stay markdown** — `Topic.notes` is a string; no block/WYSIWYG model.
- **Binaries never enter the JSON snapshot** — uploads go to `${dirname(DATA_FILE)}/files/<id>` (i.e. `/app/data/files`), the durable volume; the snapshot stores only `Attachment` references.
- **New `Topic` fields are optional** (`attachments?`, `flashcards?`, `bookmarkedAt?`) — existing/seeded snapshots load unchanged.
- **All persistence via `RevisionRepository`**; all new mutations via the store's `commit` (undoable + auto-saved).
- **Markdown pipeline order (fixed):** `remarkPlugins: [remarkGfm, remarkMath, remarkCallouts]`; `rehypePlugins: [rehypeRaw, [rehypeSanitize, schema], rehypeKatex, rehypeHighlight]`. Sanitize runs after raw (to clean embedded HTML) but before katex/highlight (so their generated nodes are never stripped).
- **Next 15 route params are `Promise`** — `await params` in route handlers.
- **FormData file check:** distinguish a file from a text field with `typeof entry !== 'string'` (do **not** reference a global `File`, which is not guaranteed on Node 18).
- **IDs** via `makeId()`.

---

### Task 1: Dependencies + model fields

**Files:**
- Modify: `package.json`
- Modify: `lib/domain/types.ts`

**Interfaces:**
- Produces: `AttachmentKind`, `Attachment`, `Flashcard` types; `Topic` gains `attachments?: Attachment[]`, `flashcards?: Flashcard[]`, `bookmarkedAt?: number`.

- [ ] **Step 1: Install markdown + math + highlight deps**

```bash
npm install remark-math rehype-katex katex rehype-highlight rehype-raw rehype-sanitize unist-util-visit
```

A React 19 peer warning (if any) is safe to ignore — these are unified/rehype processors, not React components. Verify:

```bash
npm ls remark-math rehype-katex katex rehype-highlight rehype-raw rehype-sanitize unist-util-visit
```

Expected: all resolve.

- [ ] **Step 2: Add the new types**

In `lib/domain/types.ts`, add above the `Topic` interface:

```ts
export type AttachmentKind = 'image' | 'pdf' | 'link' | 'video';

export interface Attachment {
  id: string;
  name: string;
  kind: AttachmentKind;
  url: string;        // '/api/files/<id>' for uploads; external URL otherwise
  mime?: string;
  size?: number;
  createdAt: number;
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  createdAt: number;
}
```

Then add these three optional fields to the end of the `Topic` interface (after `archivedAt?`):

```ts
  attachments?: Attachment[];
  flashcards?: Flashcard[];
  bookmarkedAt?: number;
```

- [ ] **Step 3: Verify the suite still passes (additive change breaks nothing)**

Run: `npx vitest run`
Expected: all existing tests PASS.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json lib/domain/types.ts
git commit -m "chore: add markdown/math/highlight deps and attachment/flashcard/bookmark model fields"
```

---

### Task 2: Store actions — attachments, flashcards, bookmarks

**Files:**
- Modify: `store/useStore.ts`
- Test: `store/useStore.test.ts` (extend)

**Interfaces:**
- Consumes: `Attachment`, `Flashcard`, `makeId`, store `commit`.
- Produces (store actions, all via `commit` → undoable + auto-saved):
  - `addAttachment(topicId: string, a: Attachment): void`
  - `removeAttachment(topicId: string, attId: string): void`
  - `addFlashcard(topicId: string, front: string, back: string): string`
  - `updateFlashcard(topicId: string, cardId: string, front: string, back: string): void`
  - `deleteFlashcard(topicId: string, cardId: string): void`
  - `toggleBookmark(topicId: string): void`

- [ ] **Step 1: Write the failing store tests**

Add to `store/useStore.test.ts` (append inside `describe('useStore', …)`):

```ts
  it('addAttachment / removeAttachment update the topic and are undoable', () => {
    const s = useStore.getState().addSubject('S');
    const c = useStore.getState().addChapter(s, 'C');
    const t = useStore.getState().addTopic(c, 'T');
    const att = { id: 'a1', name: 'x.png', kind: 'image' as const, url: '/api/files/a1', createdAt: 1 };
    const before = useStore.getState().history.past.length;
    useStore.getState().addAttachment(t, att);
    expect(useStore.getState().topics[t].attachments).toEqual([att]);
    expect(useStore.getState().history.past.length).toBe(before + 1);
    useStore.getState().removeAttachment(t, 'a1');
    expect(useStore.getState().topics[t].attachments).toEqual([]);
  });

  it('addFlashcard / updateFlashcard / deleteFlashcard manage the card list', () => {
    const s = useStore.getState().addSubject('S');
    const c = useStore.getState().addChapter(s, 'C');
    const t = useStore.getState().addTopic(c, 'T');
    const cid = useStore.getState().addFlashcard(t, 'Q', 'A');
    expect(useStore.getState().topics[t].flashcards).toHaveLength(1);
    useStore.getState().updateFlashcard(t, cid, 'Q2', 'A2');
    expect(useStore.getState().topics[t].flashcards![0]).toMatchObject({ front: 'Q2', back: 'A2' });
    useStore.getState().deleteFlashcard(t, cid);
    expect(useStore.getState().topics[t].flashcards).toHaveLength(0);
  });

  it('toggleBookmark flips bookmarkedAt', () => {
    const s = useStore.getState().addSubject('S');
    const c = useStore.getState().addChapter(s, 'C');
    const t = useStore.getState().addTopic(c, 'T');
    useStore.getState().toggleBookmark(t);
    expect(useStore.getState().topics[t].bookmarkedAt).toBeTypeOf('number');
    useStore.getState().toggleBookmark(t);
    expect(useStore.getState().topics[t].bookmarkedAt).toBeUndefined();
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run store/useStore.test.ts`
Expected: FAIL (addAttachment/addFlashcard/toggleBookmark not defined).

- [ ] **Step 3: Add imports + signatures**

In `store/useStore.ts`, extend the type import:

```ts
import type { AppData, Attachment, Chapter, Flashcard, Subject, Topic } from '@/lib/domain/types';
```

Add to the `StoreState` interface (after the Phase 2 actions):

```ts
  addAttachment: (topicId: string, a: Attachment) => void;
  removeAttachment: (topicId: string, attId: string) => void;
  addFlashcard: (topicId: string, front: string, back: string) => string;
  updateFlashcard: (topicId: string, cardId: string, front: string, back: string) => void;
  deleteFlashcard: (topicId: string, cardId: string) => void;
  toggleBookmark: (topicId: string) => void;
```

- [ ] **Step 4: Add the implementations**

Insert before the final `undo:`/`redo:` actions in the returned object:

```ts
    addAttachment: (topicId, a) => {
      const s = get();
      const t = s.topics[topicId];
      if (!t) return;
      commit({ topics: { ...s.topics, [topicId]: { ...t, attachments: [...(t.attachments ?? []), a], updatedAt: Date.now() } } });
    },
    removeAttachment: (topicId, attId) => {
      const s = get();
      const t = s.topics[topicId];
      if (!t) return;
      commit({ topics: { ...s.topics, [topicId]: { ...t, attachments: (t.attachments ?? []).filter((x) => x.id !== attId), updatedAt: Date.now() } } });
    },
    addFlashcard: (topicId, front, back) => {
      const id = makeId();
      const s = get();
      const t = s.topics[topicId];
      if (!t) return id;
      const card: Flashcard = { id, front, back, createdAt: Date.now() };
      commit({ topics: { ...s.topics, [topicId]: { ...t, flashcards: [...(t.flashcards ?? []), card], updatedAt: Date.now() } } });
      return id;
    },
    updateFlashcard: (topicId, cardId, front, back) => {
      const s = get();
      const t = s.topics[topicId];
      if (!t) return;
      const flashcards = (t.flashcards ?? []).map((c) => (c.id === cardId ? { ...c, front, back } : c));
      commit({ topics: { ...s.topics, [topicId]: { ...t, flashcards, updatedAt: Date.now() } } });
    },
    deleteFlashcard: (topicId, cardId) => {
      const s = get();
      const t = s.topics[topicId];
      if (!t) return;
      commit({ topics: { ...s.topics, [topicId]: { ...t, flashcards: (t.flashcards ?? []).filter((c) => c.id !== cardId), updatedAt: Date.now() } } });
    },
    toggleBookmark: (topicId) => {
      const s = get();
      const t = s.topics[topicId];
      if (!t) return;
      const next = t.bookmarkedAt ? undefined : Date.now();
      const { bookmarkedAt: _drop, ...rest } = t;
      void _drop;
      const updated = next ? { ...rest, bookmarkedAt: next, updatedAt: Date.now() } : { ...rest, updatedAt: Date.now() };
      commit({ topics: { ...s.topics, [topicId]: updated } });
    },
```

- [ ] **Step 5: Run to verify all store tests pass**

Run: `npx vitest run store/useStore.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add store/useStore.ts store/useStore.test.ts
git commit -m "feat: store actions for attachments, flashcards, and bookmarks"
```

---

### Task 3: Server file blob store

**Files:**
- Create: `lib/repository/fileBlobStore.ts`
- Test: `lib/repository/fileBlobStore.test.ts`

**Interfaces:**
- Consumes: `dataFilePath` from `./fileStore`.
- Produces:
  - `filesDir(): string`
  - `interface BlobMeta { name: string; mime: string; size: number }`
  - `writeBlob(id: string, bytes: Buffer, meta: BlobMeta): Promise<void>`
  - `readBlob(id: string): Promise<{ bytes: Buffer; meta: BlobMeta } | null>`
  - `deleteBlob(id: string): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `lib/repository/fileBlobStore.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ce-blob-'));
  process.env.DATA_FILE = path.join(dir, 'appdata.json');
});
afterEach(async () => {
  delete process.env.DATA_FILE;
  await fs.rm(dir, { recursive: true, force: true });
});

describe('fileBlobStore', () => {
  it('filesDir sits beside the data file', async () => {
    const { filesDir } = await import('./fileBlobStore');
    expect(filesDir()).toBe(path.join(dir, 'files'));
  });

  it('returns null for a missing blob', async () => {
    const { readBlob } = await import('./fileBlobStore');
    expect(await readBlob('nope')).toBeNull();
  });

  it('round-trips bytes and meta, then deletes', async () => {
    const { writeBlob, readBlob, deleteBlob } = await import('./fileBlobStore');
    const bytes = Buffer.from('hello world');
    const meta = { name: 'note.txt', mime: 'text/plain', size: bytes.length };
    await writeBlob('b1', bytes, meta);
    const got = await readBlob('b1');
    expect(got!.bytes.equals(bytes)).toBe(true);
    expect(got!.meta).toEqual(meta);
    await deleteBlob('b1');
    expect(await readBlob('b1')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/repository/fileBlobStore.test.ts`
Expected: FAIL (cannot find module './fileBlobStore').

- [ ] **Step 3: Implement the blob store**

Create `lib/repository/fileBlobStore.ts`:

```ts
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { dataFilePath } from './fileStore';

export interface BlobMeta {
  name: string;
  mime: string;
  size: number;
}

export function filesDir(): string {
  return path.join(path.dirname(dataFilePath()), 'files');
}

export async function writeBlob(id: string, bytes: Buffer, meta: BlobMeta): Promise<void> {
  const dir = filesDir();
  await fs.mkdir(dir, { recursive: true });
  // Atomic-ish: write bytes then meta.
  await fs.writeFile(path.join(dir, id), bytes);
  await fs.writeFile(path.join(dir, `${id}.json`), JSON.stringify(meta), 'utf8');
}

export async function readBlob(id: string): Promise<{ bytes: Buffer; meta: BlobMeta } | null> {
  const dir = filesDir();
  try {
    const bytes = await fs.readFile(path.join(dir, id));
    const meta = JSON.parse(await fs.readFile(path.join(dir, `${id}.json`), 'utf8')) as BlobMeta;
    return { bytes, meta };
  } catch {
    return null;
  }
}

export async function deleteBlob(id: string): Promise<void> {
  const dir = filesDir();
  await fs.rm(path.join(dir, id), { force: true });
  await fs.rm(path.join(dir, `${id}.json`), { force: true });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/repository/fileBlobStore.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/repository/fileBlobStore.ts lib/repository/fileBlobStore.test.ts
git commit -m "feat: durable server-side file blob store on the data volume"
```

---

### Task 4: File API routes + upload client

**Files:**
- Create: `app/api/files/route.ts` (POST)
- Create: `app/api/files/[id]/route.ts` (GET, DELETE)
- Create: `lib/files/uploadFile.ts`
- Test: `lib/files/uploadFile.test.ts`

**Interfaces:**
- Consumes: `writeBlob`/`readBlob`/`deleteBlob`, `makeId`, `Attachment`.
- Produces:
  - `POST /api/files` → `{ id, url, name, mime, size }`
  - `GET /api/files/[id]` → the bytes; `DELETE /api/files/[id]` → 204
  - `uploadFile(file: File): Promise<Attachment>`; `mimeToKind(mime: string): AttachmentKind`

- [ ] **Step 1: Write the failing upload-client test**

Create `lib/files/uploadFile.test.ts`:

```ts
import { it, expect, vi, afterEach } from 'vitest';
import { uploadFile, mimeToKind } from './uploadFile';

afterEach(() => vi.unstubAllGlobals());

it('mimeToKind maps pdf and images', () => {
  expect(mimeToKind('application/pdf')).toBe('pdf');
  expect(mimeToKind('image/png')).toBe('image');
});

it('uploadFile maps the server response to an Attachment', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(
    JSON.stringify({ id: 'x1', url: '/api/files/x1', name: 'p.png', mime: 'image/png', size: 12 }),
    { status: 200 },
  )));
  const file = { name: 'p.png', type: 'image/png', size: 12 } as unknown as File;
  const att = await uploadFile(file);
  expect(att).toMatchObject({ id: 'x1', kind: 'image', url: '/api/files/x1', name: 'p.png', mime: 'image/png', size: 12 });
  expect(att.createdAt).toBeTypeOf('number');
});

it('uploadFile throws on a failed upload', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('bad', { status: 400 })));
  const file = { name: 'p.png', type: 'image/png', size: 12 } as unknown as File;
  await expect(uploadFile(file)).rejects.toThrow();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/files/uploadFile.test.ts`
Expected: FAIL (cannot find module './uploadFile').

- [ ] **Step 3: Implement the upload client**

Create `lib/files/uploadFile.ts`:

```ts
import type { Attachment, AttachmentKind } from '@/lib/domain/types';

export function mimeToKind(mime: string): AttachmentKind {
  return mime === 'application/pdf' ? 'pdf' : 'image';
}

export async function uploadFile(file: File): Promise<Attachment> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('/api/files', { method: 'POST', body: fd });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  const data = (await res.json()) as { id: string; url: string; name: string; mime: string; size: number };
  return {
    id: data.id, name: data.name, kind: mimeToKind(data.mime),
    url: data.url, mime: data.mime, size: data.size, createdAt: Date.now(),
  };
}
```

- [ ] **Step 4: Run to verify the client test passes**

Run: `npx vitest run lib/files/uploadFile.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Implement the POST route**

Create `app/api/files/route.ts`:

```ts
import type { NextRequest } from 'next/server';
import { makeId } from '@/lib/domain/id';
import { writeBlob } from '@/lib/repository/fileBlobStore';

export const dynamic = 'force-dynamic';

const MAX_UPLOAD = 25 * 1024 * 1024;
const ALLOWED = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml', 'application/pdf',
]);

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const entry = form.get('file');
  // A text field is a string; a file is not. (Avoids referencing a global File.)
  if (!entry || typeof entry === 'string') {
    return Response.json({ error: 'no file' }, { status: 400 });
  }
  const mime = entry.type;
  if (!ALLOWED.has(mime)) return Response.json({ error: 'unsupported type' }, { status: 400 });
  if (entry.size > MAX_UPLOAD) return Response.json({ error: 'too large' }, { status: 400 });

  const id = makeId();
  const bytes = Buffer.from(await entry.arrayBuffer());
  const name = entry.name || id;
  await writeBlob(id, bytes, { name, mime, size: entry.size });
  return Response.json({ id, url: `/api/files/${id}`, name, mime, size: entry.size });
}
```

- [ ] **Step 6: Implement the GET/DELETE route**

Create `app/api/files/[id]/route.ts`:

```ts
import { readBlob, deleteBlob } from '@/lib/repository/fileBlobStore';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const blob = await readBlob(id);
  if (!blob) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(blob.bytes), {
    headers: {
      'Content-Type': blob.meta.mime,
      'Content-Disposition': `inline; filename="${blob.meta.name.replace(/"/g, '')}"`,
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteBlob(id);
  return new Response(null, { status: 204 });
}
```

- [ ] **Step 7: Verify build**

Run: `npm run build`
Expected: build succeeds; routes `/api/files` and `/api/files/[id]` appear as dynamic (ƒ).

- [ ] **Step 8: Commit**

```bash
git add app/api/files lib/files
git commit -m "feat: file upload/serve/delete API routes and upload client"
```

---

### Task 5: Enhanced markdown renderer (`MarkdownView`)

**Files:**
- Create: `components/editor/remarkCallouts.ts`
- Create: `components/editor/MarkdownView.tsx`
- Modify: `app/layout.tsx` (import KaTeX CSS)
- Modify: `app/globals.css` (callout + code-highlight styles)
- Test: `components/editor/MarkdownView.test.tsx`

**Interfaces:**
- Produces: `<MarkdownView markdown={string} />` rendering GFM + math + code highlight + callouts + collapsibles; `remarkCallouts` unified plugin.

- [ ] **Step 1: Implement the callout remark plugin**

Create `components/editor/remarkCallouts.ts`:

```ts
import { visit } from 'unist-util-visit';

// Turns a blockquote whose first line is `[!note] | [!tip] | [!warning] | [!danger]`
// into a <div class="callout callout-<type>">, stripping the marker.
export function remarkCallouts() {
  return (tree: unknown) => {
    visit(tree as never, 'blockquote', (node: {
      children: { type: string; children?: { type: string; value?: string }[]; data?: Record<string, unknown> }[];
      data?: Record<string, unknown>;
    }) => {
      const first = node.children[0];
      const firstText = first?.children?.[0];
      if (first?.type === 'paragraph' && firstText?.type === 'text' && typeof firstText.value === 'string') {
        const m = firstText.value.match(/^\[!(note|tip|warning|danger)\]\s?/i);
        if (m) {
          const type = m[1].toLowerCase();
          firstText.value = firstText.value.slice(m[0].length);
          node.data = node.data || {};
          (node.data as { hName?: string }).hName = 'div';
          (node.data as { hProperties?: unknown }).hProperties = { className: ['callout', `callout-${type}`] };
        }
      }
    });
  };
}
```

- [ ] **Step 2: Write the failing render test**

Create `components/editor/MarkdownView.test.tsx`:

```tsx
import { it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MarkdownView } from './MarkdownView';

it('renders inline math via KaTeX', () => {
  const { container } = render(<MarkdownView markdown={'Euler: $e^{i\\pi}+1=0$'} />);
  expect(container.querySelector('.katex')).not.toBeNull();
});

it('renders a GFM task-list checkbox', () => {
  const { container } = render(<MarkdownView markdown={'- [x] done\n- [ ] todo'} />);
  const box = container.querySelector('input[type="checkbox"]');
  expect(box).not.toBeNull();
});

it('renders a callout with its type class', () => {
  const { container } = render(<MarkdownView markdown={'> [!warning] be careful'} />);
  expect(container.querySelector('.callout-warning')).not.toBeNull();
});

it('renders a fenced code block', () => {
  const { container } = render(<MarkdownView markdown={'```js\nconst x = 1;\n```'} />);
  expect(container.querySelector('pre code')).not.toBeNull();
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run components/editor/MarkdownView.test.tsx`
Expected: FAIL (cannot find module './MarkdownView').

- [ ] **Step 4: Implement MarkdownView**

Create `components/editor/MarkdownView.tsx`:

```tsx
'use client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import { remarkCallouts } from './remarkCallouts';

// Allow the elements/attributes our features emit, while still stripping scripts etc.
const schema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'details', 'summary'],
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] ?? []), 'className', 'style'],
    input: ['type', 'checked', 'disabled'],
    span: [...(defaultSchema.attributes?.span ?? []), 'className', 'style'],
    code: [...(defaultSchema.attributes?.code ?? []), 'className'],
    div: [...(defaultSchema.attributes?.div ?? []), 'className'],
  },
};

const PROSE =
  'space-y-3 text-sm leading-relaxed break-words ' +
  '[&_a]:underline [&_a]:text-sky-400 ' +
  '[&_h1]:text-xl [&_h1]:font-bold [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:font-semibold ' +
  '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 ' +
  '[&_pre]:rounded-lg [&_pre]:bg-black/40 [&_pre]:p-3 [&_pre]:overflow-x-auto ' +
  '[&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-white/10 [&_:not(pre)>code]:px-1 ' +
  '[&_table]:w-full [&_table]:border-collapse [&_th]:border [&_td]:border [&_th]:border-white/15 [&_td]:border-white/15 [&_th]:p-1.5 [&_td]:p-1.5 ' +
  '[&_blockquote]:border-l-2 [&_blockquote]:border-white/20 [&_blockquote]:pl-3 [&_blockquote]:opacity-80 ' +
  '[&_img]:max-w-full [&_img]:rounded-lg';

export function MarkdownView({ markdown }: { markdown: string }) {
  return (
    <div className={PROSE}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkCallouts]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, schema], rehypeKatex, rehypeHighlight]}
      >
        {markdown || '_Nothing yet._'}
      </ReactMarkdown>
    </div>
  );
}
```

- [ ] **Step 5: Import KaTeX CSS + add callout/code styles**

In `app/layout.tsx`, add the KaTeX stylesheet import next to `import './globals.css';`:

```tsx
import 'katex/dist/katex.min.css';
import './globals.css';
```

Append to `app/globals.css`:

```css
/* Callouts */
.callout { border-left: 3px solid; border-radius: 0.5rem; padding: 0.6rem 0.8rem; background: rgba(255,255,255,0.03); }
.callout-note { border-color: #38bdf8; }
.callout-tip { border-color: #34d399; }
.callout-warning { border-color: #fbbf24; }
.callout-danger { border-color: #f87171; }

/* Minimal highlight.js token theme (rehype-highlight adds .hljs-* classes) */
.hljs-keyword, .hljs-selector-tag, .hljs-built_in { color: #c792ea; }
.hljs-string, .hljs-attr { color: #c3e88d; }
.hljs-number, .hljs-literal { color: #f78c6c; }
.hljs-comment { color: #7f848e; font-style: italic; }
.hljs-title, .hljs-function .hljs-title, .hljs-section { color: #82aaff; }
.hljs-type, .hljs-class .hljs-title { color: #ffcb6b; }
```

- [ ] **Step 6: Run the render test + build**

Run: `npx vitest run components/editor/MarkdownView.test.tsx && npm run build`
Expected: test PASS (4 tests); build succeeds.

- [ ] **Step 7: Commit**

```bash
git add components/editor app/layout.tsx app/globals.css
git commit -m "feat: enhanced markdown renderer with KaTeX, code highlight, callouts"
```

---

### Task 6: Editor rewrite — toolbar + split view

**Files:**
- Modify: `components/editor/MarkdownEditor.tsx` (rewrite)
- Create: `components/editor/insertMarkdown.ts`
- Test: `components/editor/insertMarkdown.test.ts`

**Interfaces:**
- Consumes: `MarkdownView`, `uploadFile`, store `addAttachment`.
- Produces: `<MarkdownEditor value onChange topicId />` with Edit/Preview/Split modes + insert toolbar; `applyInsert(text, selStart, selEnd, snippet): { text, cursor }` pure helper.

- [ ] **Step 1: Write the failing insert-helper test**

Create `components/editor/insertMarkdown.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { wrapSelection, insertAt } from './insertMarkdown';

describe('insert helpers', () => {
  it('wrapSelection wraps the selected range', () => {
    const r = wrapSelection('abc', 0, 3, '**'); // "abc" -> "**abc**"
    expect(r.text).toBe('**abc**');
    expect(r.cursor).toBe(5);
  });
  it('wrapSelection with no selection inserts the markers with caret between', () => {
    const r = wrapSelection('ab', 2, 2, '**');
    expect(r.text).toBe('ab****');
    expect(r.cursor).toBe(4);
  });
  it('insertAt inserts a block snippet at the caret', () => {
    const r = insertAt('ab', 2, '\n```\ncode\n```\n');
    expect(r.text).toBe('ab\n```\ncode\n```\n');
    expect(r.cursor).toBe(r.text.length);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/editor/insertMarkdown.test.ts`
Expected: FAIL (cannot find module './insertMarkdown').

- [ ] **Step 3: Implement the insert helpers**

Create `components/editor/insertMarkdown.ts`:

```ts
export function wrapSelection(text: string, start: number, end: number, marker: string): { text: string; cursor: number } {
  const before = text.slice(0, start);
  const sel = text.slice(start, end);
  const after = text.slice(end);
  const next = `${before}${marker}${sel}${marker}${after}`;
  const cursor = start + marker.length + sel.length;
  return { text: next, cursor };
}

export function insertAt(text: string, at: number, snippet: string): { text: string; cursor: number } {
  const next = text.slice(0, at) + snippet + text.slice(at);
  return { text: next, cursor: at + snippet.length };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run components/editor/insertMarkdown.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Rewrite MarkdownEditor**

Replace `components/editor/MarkdownEditor.tsx` with:

```tsx
'use client';
import { useRef, useState } from 'react';
import { Bold, Italic, Heading, List, ListChecks, Code, Sigma, Quote, Link2, Image as ImageIcon, Table } from 'lucide-react';
import { MarkdownView } from './MarkdownView';
import { wrapSelection, insertAt } from './insertMarkdown';
import { uploadFile } from '@/lib/files/uploadFile';
import { useStore } from '@/store/useStore';

type Mode = 'edit' | 'preview' | 'split';

export function MarkdownEditor({ value, onChange, topicId }: { value: string; onChange: (v: string) => void; topicId: string }) {
  const [mode, setMode] = useState<Mode>('split');
  const ref = useRef<HTMLTextAreaElement>(null);
  const addAttachment = useStore((s) => s.addAttachment);

  const apply = (fn: (text: string, start: number, end: number) => { text: string; cursor: number }) => {
    const el = ref.current;
    if (!el) return;
    const { text, cursor } = fn(value, el.selectionStart, el.selectionEnd);
    onChange(text);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(cursor, cursor); });
  };

  const wrap = (m: string) => apply((t, s, e) => wrapSelection(t, s, e, m));
  const block = (snippet: string) => apply((t, _s, e) => insertAt(t, e, snippet));

  const pickImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const att = await uploadFile(file);
        addAttachment(topicId, att);
        block(`\n![${att.name}](${att.url})\n`);
      } catch { window.alert('Image upload failed.'); }
    };
    input.click();
  };

  const Btn = ({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) => (
    <button title={title} onClick={onClick} className="rounded p-1.5 opacity-70 hover:bg-white/10 hover:opacity-100">{children}</button>
  );

  return (
    <div className="glass rounded-xl p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-0.5">
          <Btn title="Bold" onClick={() => wrap('**')}><Bold size={15} /></Btn>
          <Btn title="Italic" onClick={() => wrap('*')}><Italic size={15} /></Btn>
          <Btn title="Heading" onClick={() => block('\n## Heading\n')}><Heading size={15} /></Btn>
          <Btn title="List" onClick={() => block('\n- item\n')}><List size={15} /></Btn>
          <Btn title="Checklist" onClick={() => block('\n- [ ] task\n')}><ListChecks size={15} /></Btn>
          <Btn title="Table" onClick={() => block('\n| A | B |\n| --- | --- |\n| 1 | 2 |\n')}><Table size={15} /></Btn>
          <Btn title="Code block" onClick={() => block('\n```\ncode\n```\n')}><Code size={15} /></Btn>
          <Btn title="Math" onClick={() => block('\n$$\ne^{i\\pi}+1=0\n$$\n')}><Sigma size={15} /></Btn>
          <Btn title="Callout" onClick={() => block('\n> [!note] Note text\n')}><Quote size={15} /></Btn>
          <Btn title="Link" onClick={() => block('[text](https://)')}><Link2 size={15} /></Btn>
          <Btn title="Image" onClick={pickImage}><ImageIcon size={15} /></Btn>
        </div>
        <div className="flex gap-1 text-xs">
          {(['edit', 'split', 'preview'] as Mode[]).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={`rounded px-2 py-1 capitalize ${mode === m ? 'bg-white/15' : 'opacity-60'}`}>{m}</button>
          ))}
        </div>
      </div>
      <div className={mode === 'split' ? 'grid gap-3 md:grid-cols-2' : ''}>
        {mode !== 'preview' && (
          <textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} rows={18}
            placeholder="Write markdown… supports **bold**, tables, - [ ] tasks, ```code```, $math$, > [!note] callouts, <details>"
            className="w-full resize-y rounded-lg bg-black/20 p-3 font-mono text-sm outline-none" />
        )}
        {mode !== 'edit' && (
          <div className="max-h-[32rem] overflow-y-auto rounded-lg bg-black/10 p-3"><MarkdownView markdown={value} /></div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add components/editor
git commit -m "feat: editor toolbar, split view, and image-upload insertion"
```

---

### Task 7: Attachments panel + topic-page wiring + purge cleanup

**Files:**
- Create: `components/AttachmentsPanel.tsx`
- Modify: `app/topic/[id]/page.tsx` (use new editor + attachments panel)
- Modify: `app/archive/page.tsx` (best-effort blob delete on purge)

**Interfaces:**
- Consumes: `useStore` (`addAttachment`, `removeAttachment`), `uploadFile`.
- Produces: `<AttachmentsPanel topic={Topic} />`.

- [ ] **Step 1: Implement AttachmentsPanel**

Create `components/AttachmentsPanel.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { Paperclip, Upload, LinkIcon, FileText, Trash2, ExternalLink } from 'lucide-react';
import type { Topic } from '@/lib/domain/types';
import { useStore } from '@/store/useStore';
import { uploadFile } from '@/lib/files/uploadFile';
import { makeId } from '@/lib/domain/id';

export function AttachmentsPanel({ topic }: { topic: Topic }) {
  const { addAttachment, removeAttachment } = useStore.getState();
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState('');
  const attachments = topic.attachments ?? [];

  const onUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) addAttachment(topic.id, await uploadFile(f));
    } catch { window.alert('Upload failed.'); } finally { setBusy(false); }
  };

  const addLink = () => {
    const u = url.trim();
    if (!u) return;
    const kind = /youtube\.com|youtu\.be|vimeo\.com|\.mp4($|\?)/i.test(u) ? 'video' : 'link';
    addAttachment(topic.id, { id: makeId(), name: u, kind, url: u, createdAt: Date.now() });
    setUrl('');
  };

  const remove = (id: string, isUpload: boolean) => {
    removeAttachment(topic.id, id);
    if (isUpload) void fetch(`/api/files/${id}`, { method: 'DELETE' });
  };

  return (
    <div className="glass rounded-xl p-4">
      <div className="mb-3 flex items-center gap-2"><Paperclip size={16} /><h3 className="font-semibold">Attachments</h3></div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="flex cursor-pointer items-center gap-1 rounded-lg border border-dashed border-white/15 px-3 py-2 text-sm hover:border-white/30">
          <Upload size={14} /> {busy ? 'Uploading…' : 'Upload image/PDF'}
          <input type="file" hidden multiple accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,application/pdf"
            onChange={(e) => onUpload(e.target.files)} />
        </label>
      </div>
      <div className="mb-3 flex gap-2">
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a link or video URL"
          className="flex-1 rounded-lg bg-black/20 px-3 py-2 text-sm outline-none" onKeyDown={(e) => e.key === 'Enter' && addLink()} />
        <button onClick={addLink} className="rounded-lg border border-white/10 px-3 text-sm hover:bg-white/5"><LinkIcon size={14} /></button>
      </div>
      {attachments.length === 0 ? (
        <p className="text-sm opacity-50">No attachments yet.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {attachments.map((a) => {
            const isUpload = a.url.startsWith('/api/files/');
            return (
              <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg bg-white/5 p-2">
                <a href={a.url} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 text-sm hover:underline">
                  {a.kind === 'image' ? (
                    <img src={a.url} alt={a.name} className="h-10 w-10 rounded object-cover" />
                  ) : a.kind === 'pdf' ? <FileText size={18} /> : <ExternalLink size={16} />}
                  <span className="truncate">{a.name}</span>
                </a>
                <button aria-label="Remove attachment" onClick={() => remove(a.id, isUpload)} className="rounded p-1 hover:bg-white/10"><Trash2 size={14} /></button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire the new editor + panel into the topic page**

In `app/topic/[id]/page.tsx`: pass `topicId={topic.id}` to `MarkdownEditor` and render `AttachmentsPanel` under the history panel. Update the import block and the right column. Change the `MarkdownEditor` usage line:

```tsx
        <MarkdownEditor value={topic.notes} onChange={(v) => updateTopicNotes(topic.id, v)} topicId={topic.id} />
```

Add the import and place `<AttachmentsPanel topic={topic} />` in the right-hand column, below `<RevisionHistoryPanel topic={topic} />`:

```tsx
import { AttachmentsPanel } from '@/components/AttachmentsPanel';
// … in the right column:
        <div className="space-y-4">
          <RevisionHistoryPanel topic={topic} />
          <AttachmentsPanel topic={topic} />
        </div>
```

(Replace the existing single `<RevisionHistoryPanel topic={topic} />` in the grid's second column with the wrapping `div` above.)

- [ ] **Step 3: Best-effort blob cleanup on permanent delete**

In `app/archive/page.tsx`, before each `store.deleteTopic(...)` / `deleteChapter` / `deleteSubject` call for a **topic**, delete its uploaded blobs. Add a helper near the top of the component and use it in the topic `onPurge`:

```tsx
  const purgeTopicBlobs = (topicId: string) => {
    const t = data.topics[topicId];
    (t?.attachments ?? []).filter((a) => a.url.startsWith('/api/files/')).forEach((a) => {
      void fetch(`/api/files/${a.id}`, { method: 'DELETE' });
    });
  };
```

Change the topic row's `onPurge` to:

```tsx
              onPurge={() => { if (window.confirm(`Permanently delete "${t.title}"?`)) { purgeTopicBlobs(t.id); store.deleteTopic(t.id); } }}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add app components
git commit -m "feat: attachments panel on topic page + blob cleanup on purge"
```

---

### Task 8: Flashcards panel + review

**Files:**
- Create: `components/FlashcardsPanel.tsx`
- Modify: `app/topic/[id]/page.tsx` (render the panel)
- Test: `components/FlashcardsPanel.test.tsx`

**Interfaces:**
- Consumes: `useStore` (`addFlashcard`, `updateFlashcard`, `deleteFlashcard`).
- Produces: `<FlashcardsPanel topic={Topic} />` with add/delete + flip-through review.

- [ ] **Step 1: Write a failing test**

Create `components/FlashcardsPanel.test.tsx`:

```tsx
import { it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FlashcardsPanel } from './FlashcardsPanel';
import { useStore } from '@/store/useStore';

let topicId = '';
beforeEach(() => {
  useStore.setState({ subjects: {}, chapters: {}, topics: {}, subjectOrder: [] });
  const s = useStore.getState().addSubject('S');
  const c = useStore.getState().addChapter(s, 'C');
  topicId = useStore.getState().addTopic(c, 'T');
});

it('adds a flashcard which then appears', async () => {
  const { rerender } = render(<FlashcardsPanel topic={useStore.getState().topics[topicId]} />);
  await userEvent.type(screen.getByPlaceholderText(/front/i), 'What is 2+2?');
  await userEvent.type(screen.getByPlaceholderText(/back/i), '4');
  await userEvent.click(screen.getByRole('button', { name: /add card/i }));
  rerender(<FlashcardsPanel topic={useStore.getState().topics[topicId]} />);
  expect(screen.getByText('What is 2+2?')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/FlashcardsPanel.test.tsx`
Expected: FAIL (cannot find module './FlashcardsPanel').

- [ ] **Step 3: Implement FlashcardsPanel**

Create `components/FlashcardsPanel.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { Layers, Plus, Trash2, Play, X } from 'lucide-react';
import type { Topic } from '@/lib/domain/types';
import { useStore } from '@/store/useStore';

export function FlashcardsPanel({ topic }: { topic: Topic }) {
  const { addFlashcard, deleteFlashcard } = useStore.getState();
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [review, setReview] = useState(false);
  const cards = topic.flashcards ?? [];

  const add = () => {
    if (!front.trim() || !back.trim()) return;
    addFlashcard(topic.id, front.trim(), back.trim());
    setFront(''); setBack('');
  };

  return (
    <div className="glass rounded-xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2"><Layers size={16} /><h3 className="font-semibold">Flashcards ({cards.length})</h3></div>
        {cards.length > 0 && (
          <button onClick={() => setReview(true)} className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-xs hover:bg-white/5"><Play size={13} /> Review</button>
        )}
      </div>
      <div className="mb-3 grid gap-2">
        <input value={front} onChange={(e) => setFront(e.target.value)} placeholder="Front (question)" className="rounded-lg bg-black/20 px-3 py-2 text-sm outline-none" />
        <input value={back} onChange={(e) => setBack(e.target.value)} placeholder="Back (answer)" className="rounded-lg bg-black/20 px-3 py-2 text-sm outline-none" />
        <button onClick={add} className="flex items-center justify-center gap-1 rounded-lg border border-dashed border-white/15 py-2 text-sm hover:border-white/30"><Plus size={14} /> Add card</button>
      </div>
      <ul className="space-y-2">
        {cards.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg bg-white/5 p-2 text-sm">
            <span className="min-w-0"><span className="truncate font-medium">{c.front}</span> <span className="opacity-50">— {c.back}</span></span>
            <button aria-label="Delete card" onClick={() => deleteFlashcard(topic.id, c.id)} className="rounded p-1 hover:bg-white/10"><Trash2 size={13} /></button>
          </li>
        ))}
      </ul>
      {review && <ReviewModal cards={cards} onClose={() => setReview(false)} />}
    </div>
  );
}

function ReviewModal({ cards, onClose }: { cards: { id: string; front: string; back: string }[]; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = cards[i];
  const next = () => { setFlipped(false); setI((n) => (n + 1) % cards.length); };
  const prev = () => { setFlipped(false); setI((n) => (n - 1 + cards.length) % cards.length); };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="glass w-full max-w-lg rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between text-sm opacity-70">
          <span>Card {i + 1} / {cards.length}</span>
          <button aria-label="Close review" onClick={onClose}><X size={16} /></button>
        </div>
        <button onClick={() => setFlipped((f) => !f)} className="grid min-h-40 w-full place-items-center rounded-xl bg-white/5 p-6 text-center text-lg">
          {flipped ? card.back : card.front}
        </button>
        <div className="mt-2 text-center text-xs opacity-50">{flipped ? 'answer — click to flip' : 'question — click to reveal'}</div>
        <div className="mt-4 flex justify-between">
          <button onClick={prev} className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:bg-white/5">Prev</button>
          <button onClick={next} className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:bg-white/5">Next</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Render the panel on the topic page**

In `app/topic/[id]/page.tsx`, add the import and render `<FlashcardsPanel topic={topic} />` in the right column below `AttachmentsPanel`:

```tsx
import { FlashcardsPanel } from '@/components/FlashcardsPanel';
// … in the right column, after AttachmentsPanel:
          <FlashcardsPanel topic={topic} />
```

- [ ] **Step 5: Run test + build**

Run: `npx vitest run components/FlashcardsPanel.test.tsx && npm run build`
Expected: test PASS; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add app components
git commit -m "feat: per-topic flashcards with add/delete and flip-through review"
```

---

### Task 9: Bookmarks — star + /bookmarks view

**Files:**
- Create: `app/bookmarks/page.tsx`
- Modify: `app/topic/[id]/page.tsx` (bookmark star in header)
- Modify: `components/cards/TopicCard.tsx` (star indicator/toggle)
- Modify: `components/layout/AppShell.tsx` (Bookmarks header link)
- Test: `app/bookmarks/BookmarksPage.test.tsx`

**Interfaces:**
- Consumes: `useStore` (`toggleBookmark`), bookmarked topics.
- Produces: `/bookmarks` route; a star toggle on the topic page and topic card.

- [ ] **Step 1: Write a failing bookmarks-view test**

Create `app/bookmarks/BookmarksPage.test.tsx`:

```tsx
import { it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import BookmarksPage from './page';
import { useStore } from '@/store/useStore';

beforeEach(() => useStore.setState({ subjects: {}, chapters: {}, topics: {}, subjectOrder: [] }));

it('lists bookmarked topics and shows an empty state otherwise', () => {
  const s = useStore.getState().addSubject('S');
  const c = useStore.getState().addChapter(s, 'C');
  const t = useStore.getState().addTopic(c, 'Bernoulli');
  useStore.getState().toggleBookmark(t);
  render(<BookmarksPage />);
  expect(screen.getByText('Bernoulli')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run app/bookmarks/BookmarksPage.test.tsx`
Expected: FAIL (cannot find module './page').

- [ ] **Step 3: Implement the bookmarks page**

Create `app/bookmarks/page.tsx`:

```tsx
'use client';
import Link from 'next/link';
import { Star } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { Breadcrumb } from '@/components/layout/Breadcrumb';

export default function BookmarksPage() {
  const data = useStore();
  const topics = Object.values(data.topics).filter((t) => t.bookmarkedAt && !t.archivedAt);
  return (
    <div>
      <Breadcrumb items={[{ label: 'Subjects', href: '/' }, { label: 'Bookmarks' }]} />
      <h1 className="mb-6 mt-4 text-2xl font-bold">Bookmarks</h1>
      {topics.length === 0 ? (
        <p className="text-sm opacity-50">No bookmarks yet. Star a topic to pin it here.</p>
      ) : (
        <div className="grid gap-3">
          {topics.map((t) => {
            const chapter = data.chapters[t.chapterId];
            const subject = chapter ? data.subjects[chapter.subjectId] : undefined;
            return (
              <Link key={t.id} href={`/topic/${t.id}`} className="glass flex items-center gap-3 rounded-xl p-4 hover:bg-white/5">
                <Star size={16} className="fill-amber-400 text-amber-400" />
                <div className="min-w-0">
                  <div className="font-medium">{t.title}</div>
                  <div className="mt-0.5 text-xs opacity-50">{subject?.name}{chapter ? ` · ${chapter.name}` : ''}</div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add the star to the topic page header**

In `app/topic/[id]/page.tsx`, import `Star` and `toggleBookmark`, and add a star button next to the title/badge. Add to the imports:

```tsx
import { CheckCircle2, Star } from 'lucide-react';
```

Add the action selector with the others:

```tsx
  const toggleBookmark = useStore((s) => s.toggleBookmark);
```

In the header's title row, after the `<RevisionBadge …/>`, add:

```tsx
          <button aria-label="Toggle bookmark" onClick={() => toggleBookmark(topic.id)} className="rounded-lg p-1.5 hover:bg-white/10">
            <Star size={18} className={topic.bookmarkedAt ? 'fill-amber-400 text-amber-400' : 'opacity-60'} />
          </button>
```

- [ ] **Step 5: Add a star indicator to TopicCard**

In `components/cards/TopicCard.tsx`, import `Star` (add to the lucide import) and render it before the badge when bookmarked. Change the right-hand controls `div`:

```tsx
      <div className="flex items-center gap-3">
        {topic.bookmarkedAt && <Star size={14} className="fill-amber-400 text-amber-400" />}
        <RevisionBadge state={badgeState(topic.revisionHistory, now)} />
        <RowActions onRename={() => setEditing(true)} onDelete={remove} />
      </div>
```

Add `Star` to the existing `lucide-react` import in that file (it currently imports none directly — add `import { Star } from 'lucide-react';`).

- [ ] **Step 6: Add the Bookmarks header link**

In `components/layout/AppShell.tsx`, add a Bookmarks link before Archive:

```tsx
          <Link href="/bookmarks" className="text-sm opacity-70 transition hover:opacity-100">Bookmarks</Link>
          <Link href="/archive" className="text-sm opacity-70 transition hover:opacity-100">Archive</Link>
```

- [ ] **Step 7: Run test + build**

Run: `npx vitest run app/bookmarks/BookmarksPage.test.tsx && npm run build`
Expected: test PASS; build succeeds.

- [ ] **Step 8: Commit**

```bash
git add app components
git commit -m "feat: bookmarks — star toggle and /bookmarks view"
```

---

### Task 10: Final verification (full suite, build, e2e, restart durability)

**Files:** none (verification only).

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: all tests PASS.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: build succeeds; routes include `/api/files`, `/api/files/[id]`, `/bookmarks`.

- [ ] **Step 3: Manual end-to-end (rich editor + flashcards + bookmark)**

Run `npm run dev`; on a topic:
1. In the editor, type math `$e^{i\pi}+1=0$`, a `- [ ] task`, a ```` ```js ```` code block, a `> [!note]` callout, and a `<details><summary>more</summary>hidden</details>` — switch to **Preview/Split** and confirm each renders (math typeset, checkbox, colored code, callout box, collapsible).
2. Click the **Image** toolbar button, upload a PNG → it uploads and the image appears in the preview and in the Attachments panel.
3. Add a **link** attachment; confirm it lists.
4. Add two **flashcards**, open **Review**, flip and navigate.
5. **Star** the topic → it appears under `/bookmarks`.

- [ ] **Step 4: Restart-durability check (the key attachment guarantee)**

With the dev server or the Docker container, after uploading an image note its `/api/files/<id>` URL, then:

```bash
# If verifying via Docker (rebuild + run happens at finish):
docker restart ce-revision
sleep 3
curl -s -o /dev/null -w "attachment after restart: %{http_code}\n" http://127.0.0.1:3200/api/files/<id>
```

Expected: `200` — the uploaded file survived the restart (it lives on the `ce-revision-data` volume under `/app/data/files`).

- [ ] **Step 5: (No commit — verification only.)**

---

## Phase 3 Complete

Delivered: an enhanced markdown editor (KaTeX math, syntax-highlighted code, GFM tables + task lists, callouts, collapsibles) with an insert toolbar and split view; durable image/PDF attachments stored on the data volume with only references in the JSON snapshot; per-topic flashcards with a flip-through review; and bookmarks with a dedicated view. All new mutations are undoable and auto-saved. Correctness-critical logic (store actions, blob store, upload mapping, markdown rendering) is unit-tested; the file routes and durability are verified by build + the manual e2e and restart checks.

**Deferred to later phases (per the design spec):** built-in & custom filters, global search, statistics/heatmap/streaks, calendar, notifications, authentication, cloud sync, AI/SM-2 flashcard scheduling, OCR/PDF import, voice notes, mobile app.
