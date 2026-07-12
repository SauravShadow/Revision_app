# Phase 3: Rich Editor, Attachments, Flashcards & Bookmarks — Design Spec

**Date:** 2026-07-12
**Status:** Approved (design) — pending implementation planning
**Builds on:** Phase 1 + server-side persistence + Phase 2 (all shipped)

## 1. Overview

Phase 3 turns the plain markdown note area into a rich study surface and adds
per-topic study aids. Five tracks, one implementation plan:

1. **Enhanced markdown editor** — KaTeX math, syntax-highlighted code, GFM
   tables + task lists, callouts/highlights, collapsible sections, and an insert
   toolbar with a split (edit | preview) view.
2. **Attachments + durable file storage** — upload images & PDFs to the Docker
   volume; reference external links & videos. Only references live in the JSON
   snapshot.
3. **Flashcards** — per-topic Q/A cards with a flip-through review.
4. **Bookmarks** — a per-topic star and a `/bookmarks` view.
5. **Store, persistence & tests** — new actions flow through the existing
   `commit` path (undoable + auto-saved); correctness-critical logic is
   unit-tested.

The Phase 1/2 architecture is preserved: a pure domain layer, the
`RevisionRepository` snapshot contract, and a single Zustand store. `Topic.notes`
remains a markdown string — no rich-block data model — which keeps the JSON
persistence and the repository contract unchanged.

## 2. Load-bearing decisions

**Notes stay markdown.** The editor is an *enhanced markdown* editor, not a
block/WYSIWYG editor. `Topic.notes` is still a string; the richness is entirely
in rendering (remark/rehype plugins) and the insert toolbar. No migration, no
persistence-shape change.

**Binaries never enter the JSON snapshot.** Uploaded images/PDFs are written as
files under `${DATA_DIR}/files/<id>` (where `DATA_DIR` is the directory of
`DATA_FILE`, i.e. `/app/data` in the container — the **same named volume**
`ce-revision-data` as `appdata.json`). The snapshot stores only an `Attachment`
reference (`{ id, url, name, mime, size }`). This keeps the single-blob snapshot
small and makes uploads durable across container restart/rebuild, exactly like
the JSON data.

**New model fields are additive & optional.** `Topic` gains
`attachments?`, `flashcards?`, `bookmarkedAt?` — all optional, so existing
persisted snapshots (including the seeded syllabus) load unchanged.

**Reference-only deletes for undo-safety.** `removeAttachment` deletes only the
reference (undoable via `commit`). The underlying blob is cleaned when a topic is
permanently deleted (purge). Orphaned blobs from mid-session removals are
acceptable for v1 (a later phase can add sweep-on-idle).

## 3. Data model changes (`lib/domain/types.ts`)

```ts
export type AttachmentKind = 'image' | 'pdf' | 'link' | 'video';

export interface Attachment {
  id: string;
  name: string;
  kind: AttachmentKind;
  url: string;        // '/api/files/<id>' for uploads; external URL for link/video
  mime?: string;
  size?: number;      // bytes, for uploads
  createdAt: number;
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  createdAt: number;
}

// Topic gains:
//   attachments?: Attachment[]
//   flashcards?: Flashcard[]
//   bookmarkedAt?: number
```

## 4. Enhanced markdown editor

### 4.1 Rendering pipeline (`components/editor/MarkdownView.tsx`)
`react-markdown` configured with:
- `remarkPlugins`: `remark-gfm` (tables, task lists, strikethrough), `remark-math`.
- `rehypePlugins`: `rehype-raw` (parse embedded HTML like `<details>`),
  `rehype-sanitize` (allow-list schema — see below), `rehype-katex` (math),
  `rehype-highlight` (code).
- KaTeX CSS (`katex/dist/katex.min.css`) and a highlight.js theme CSS are
  imported once (in the editor component / globals).

**Callouts:** a small custom `components.blockquote` override detects a leading
`[!note] | [!tip] | [!warning] | [!danger]` marker on the first line and renders
a styled callout (icon + colored border); plain blockquotes render normally.

**Sanitize schema:** extend the default `rehype-sanitize` schema to allow
`details`, `summary`, `input` (only `type=checkbox`, `disabled`, `checked`),
`span`/`div` `className` (needed by KaTeX + highlight.js), and `math`-related
attributes. This keeps embedded HTML safe while enabling collapsibles, task
checkboxes, math, and highlighted code.

### 4.2 Editor UX (`components/editor/MarkdownEditor.tsx`, rewritten)
- Modes: **Edit**, **Preview**, **Split** (textarea left, live `MarkdownView`
  right). Toggle persisted in `localStorage`.
- **Insert toolbar** above the textarea: Bold, Italic, Heading, Bulleted list,
  Checklist item, Table (skeleton), Code block, Inline math / Math block,
  Callout, Link, and **Image** (opens the upload flow, then inserts
  `![name](/api/files/<id>)`). Each button wraps/inserts markdown at the caret
  via a controlled `textarea` ref helper.

## 5. Attachments + file storage

### 5.1 Server file store (`lib/repository/fileBlobStore.ts`, server-only)
- `filesDir()` → `path.join(path.dirname(dataFilePath()), 'files')` — reuses the
  existing `dataFilePath()` from `fileStore.ts` so blobs live beside
  `appdata.json` on the volume.
- `writeBlob(id, bytes: Buffer, meta): Promise<void>` — `mkdir -p filesDir`,
  atomic write of `<id>` and a sidecar `<id>.json` meta (`{ name, mime, size }`).
- `readBlob(id): Promise<{ bytes: Buffer; meta } | null>`.
- `deleteBlob(id): Promise<void>` — removes `<id>` and `<id>.json` (best-effort).

### 5.2 API routes
- `POST /api/files` (`app/api/files/route.ts`) — reads `FormData`, validates
  mime (`image/png|jpeg|webp|gif|svg+xml`, `application/pdf`) and size
  (`MAX_UPLOAD = 25 * 1024 * 1024`), generates `id = makeId()`, `writeBlob`,
  returns `{ id, url: '/api/files/'+id, name, mime, size }`. Rejects bad
  type/size with 400.
- `GET /api/files/[id]` (`app/api/files/[id]/route.ts`) — `readBlob`, streams
  bytes with `Content-Type` from meta and `Content-Disposition: inline;
  filename="…"`; 404 if missing. `export const dynamic = 'force-dynamic'`.
- `DELETE /api/files/[id]` — `deleteBlob`, 204.

### 5.3 Client + UI
- `lib/files/uploadFile.ts` — `uploadFile(file: File): Promise<Attachment>`
  POSTs to `/api/files` and maps the response to an `Attachment` (kind derived
  from mime). External resources use `addLinkAttachment(url, kind, name)` (no
  upload).
- `components/AttachmentsPanel.tsx` (topic page) — drop/upload images & PDFs, an
  "add link/video" field, a grid listing: image thumbnails, PDF chip (open in
  new tab / embed), link/video rows; each with a delete button. Delete calls
  `store.removeAttachment` and best-effort `DELETE /api/files/<id>` for uploads.

## 6. Flashcards (`components/FlashcardsPanel.tsx`)

- Per-topic list from `topic.flashcards`. Add via a two-field (front/back) form;
  edit inline; delete.
- **Review mode:** a modal/section that shows one card front, "Reveal" flips to
  back, Next/Prev navigate, Shuffle reorders. Pure client state; no scheduling.
- Store actions: `addFlashcard(topicId, front, back)`,
  `updateFlashcard(topicId, cardId, front, back)`,
  `deleteFlashcard(topicId, cardId)`.

## 7. Bookmarks

- `toggleBookmark(topicId)` sets/clears `bookmarkedAt`.
- A star button on the topic page header and on `TopicCard`.
- `app/bookmarks/page.tsx` — lists bookmarked, non-archived topics (title +
  subject/chapter breadcrumb + link), like `/archive`. Header gets a Bookmarks
  link.

## 8. Store actions (all via `commit`, undoable + auto-saved)

`store/useStore.ts` gains:
- `addAttachment(topicId, a: Attachment)`, `removeAttachment(topicId, attId)`
- `addFlashcard(topicId, front, back): string`,
  `updateFlashcard(topicId, cardId, front, back)`,
  `deleteFlashcard(topicId, cardId)`
- `toggleBookmark(topicId)`

The store stays synchronous and only manages references. Blob cleanup on
permanent delete is the caller's job: before calling `deleteTopic`, the archive
view reads that topic's uploaded attachments (`kind === 'image' | 'pdf'`) and
fires a best-effort `DELETE /api/files/<id>` for each. No store signature
changes for this.

## 9. Testing

Unit (Vitest), correctness-critical:
- Store: add/remove attachment, add/update/delete flashcard, toggleBookmark;
  each is undoable (one `history.past` entry) and immutable.
- `fileBlobStore`: write→read round-trip (bytes + meta), delete, directory
  creation, and that `filesDir()` sits under the data dir.
- `uploadFile`: maps a mocked `POST /api/files` response to an `Attachment`
  (mime→kind), and surfaces errors.

Component (Vitest + Testing Library):
- `MarkdownView` renders math (a `.katex` node), a task-list checkbox
  (`input[type=checkbox]`), a callout (its class/role), and a fenced code block.
- `FlashcardsPanel`: add a card → it appears; reveal flips front→back.
- Bookmarks view lists a bookmarked topic.

Not unit-tested (build + manual + restart check): the `/api/files` route
handlers and multipart upload; the store/blobStore beneath them are tested. A
manual step uploads an image, restarts the container, and confirms the image
still loads (volume durability).

## 10. New dependencies

`remark-math`, `rehype-katex`, `katex`, `rehype-highlight`, `rehype-raw`,
`rehype-sanitize`. All are framework-agnostic unified/rehype processors,
compatible with Node 18 and React 19. KaTeX and a highlight.js theme ship CSS
imported once by the editor.

## 11. Out of scope for Phase 3 (per roadmap)

Built-in & custom filters, global search, statistics/heatmap/streaks, calendar,
notifications, authentication, cloud sync, AI/SM-2 flashcard scheduling, OCR/PDF
import, voice notes, mobile app. Video is external-link/embed only (no video
file uploads).
