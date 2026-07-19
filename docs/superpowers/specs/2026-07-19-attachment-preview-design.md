# In-App Preview for Photos & PDFs — Design Spec

**Date:** 2026-07-19
**Status:** Approved (brainstorming)
**Scope:** Topic page attachments + note markdown preview

## Problem

Attachments (photos and PDFs) on a topic currently render as `<a target="_blank">`
links, so clicking one **opens it in a separate browser tab** rather than previewing
it inside the app. PDFs show only a generic file icon (no visual preview at all), and
PDFs are not auto-inserted into the note the way images are.

The user wants:

1. A proper **in-app preview** (lightbox/modal) for both photos and PDFs — no new tab.
2. **Rich cards**: photos and PDFs both show a real inline thumbnail on their
   attachment card (PDFs get a first-page thumbnail, not just an icon).
3. **Auto-inline**: any attachment added (image *or* PDF) automatically appears in the
   rendered markdown note preview, and clicking it there opens the same in-app preview.

## Non-Goals (YAGNI)

- No prev/next carousel between attachments.
- No zoom/pan on images (native browser gestures only).
- No custom PDF page navigation (the native `<iframe>` viewer handles paging).
- No preview for arbitrary external links or video URLs — those keep opening externally.

## Current State (verified)

- `apps/frontend/components/AttachmentsPanel.tsx` — renders attachment cards as
  `<a href={url} target="_blank">`. Images get a cropped `h-24 object-cover`
  thumbnail; PDFs render only a `FileText` icon + name. On upload, **images** are
  auto-inserted into the note via `onInsertMarkdown` as `![name](url)`; PDFs are not.
- `apps/frontend/components/editor/MarkdownView.tsx` — pure markdown renderer
  (react-markdown + rehypeRaw + sanitize). Contains its own copy of `addTokenToUrl`.
- `apps/frontend/components/editor/MarkdownEditor.tsx` — the only consumer of
  `MarkdownView` (its live preview pane).
- `apps/frontend/app/topic/[id]/page.tsx` — the only consumer of `MarkdownEditor` and
  `AttachmentsPanel`. **The entire feature is contained to the topic page.**
- `apps/frontend/lib/files/uploadFile.ts` — uploads and returns an `Attachment`
  (`kind: 'image' | 'pdf' | ...`). Unchanged by this work.
- `apps/frontend/app/api/files/[id]/route.ts` — proxies file bytes from the
  files-service; requires a `?token=` query param (handled by `addTokenToUrl`).
- Existing modal pattern: `FlashcardsPanel`'s `ReviewModal` uses
  `fixed inset-0 z-50 grid place-items-center bg-black/60`, a `glass` card,
  click-outside + `X` to close. It does **not** handle Esc or lock body scroll.
- No PDF library is installed.

## Architecture

One shared preview, triggered from two places, coordinated by a React context provided
at the topic page.

### New files

- **`components/preview/PreviewContext.tsx`**
  - `PreviewProvider` holds the currently-previewed item (`{ url, name, kind } | null`).
  - `usePreview()` hook exposes `openPreview(item)` and `closePreview()`.
  - Renders `<PreviewModal>` at the provider root when an item is set.
  - When no provider is present (e.g. a future read-only `MarkdownView` usage),
    consumers fall back to plain rendering — the hook returns a no-op / the components
    check for a handler before wiring click behavior.

- **`components/preview/PreviewModal.tsx`**
  - Backdrop: `fixed inset-0 z-50` dark overlay, click-outside to close.
  - **Image**: `object-contain`, up to ~90vw / 90vh, on the dark backdrop.
  - **PDF**: native `<iframe>` viewer inside a large `glass` frame (~90vw / 90vh).
  - Header: attachment name + a "download / open in new tab" link (escape hatch) + a
    close (`X`) button.
  - Improvements over the existing modal: **Esc-to-close** and **body scroll-lock**
    while open.

- **`components/preview/PdfThumbnail.tsx`**
  - Client-only (`'use client'`).
  - Renders PDF **page 1** to a `<canvas>` via pdf.js at a small scale.
  - Fallback to the `FileText` icon while loading or on any error.
  - Used both on attachment cards and inline in the note.

### pdf.js setup

- Add dependency `pdfjs-dist`.
- Set `GlobalWorkerOptions.workerSrc` to the bundled worker
  (`pdfjs-dist/build/pdf.worker.min.mjs` imported as a URL, or copied into `public/` —
  use whichever the Next.js build resolves cleanly, verified against a real render).
- Worker init guarded to run once.
- pdf.js fetches the **tokenized** file URL. All pdf.js code is client-only and never
  runs during SSR.

### Shared URL helper

- `addTokenToUrl` is currently duplicated in `AttachmentsPanel.tsx` and
  `MarkdownView.tsx`. Extract it to **`lib/files/url.ts`** and import from both, plus
  the new preview components. (Targeted cleanup, in service of this work.)

## Component Changes

### `AttachmentsPanel.tsx`

- Each card's `<a target="_blank">` becomes a `<button onClick={() => openPreview(a)}>`
  — no more new tab.
- **Image card**: keep the existing thumbnail look; now opens the modal.
- **PDF card**: replace the bare icon with `<PdfThumbnail url={a.url} />` (falls back to
  icon on error). Opens the modal on click.
- **Link / video cards**: unchanged — still open externally.
- Trash/remove button unchanged.
- `onUpload`: extend so **PDFs also auto-insert** into the note, as a plain link
  `[name](url)` (images keep inserting as `![name](url)`).

### `MarkdownView.tsx`

- Accepts an optional `attachments` prop (the topic's attachments) for kind lookup.
- Reads `usePreview()`; when a handler is present, adds two custom renderers:
  - **`img`** → wrapped so clicking enlarges it in the shared modal.
  - **`a`** → if the href resolves to a PDF attachment (looked up from `attachments`),
    render an inline `PdfThumbnail` card that opens the preview instead of a plain link.
- When no preview handler is present, both fall back to plain rendering (existing
  behavior and tests preserved).

### `MarkdownEditor.tsx` / `app/topic/[id]/page.tsx`

- Wrap the topic page content in `PreviewProvider`.
- Thread the topic's `attachments` to `MarkdownView` (via `MarkdownEditor`).

## Data Flow

1. User uploads a photo/PDF in `AttachmentsPanel` → `uploadFile` → `addAttachment`
   (store) → card renders (image thumbnail or `PdfThumbnail`) → markdown auto-inserted
   into the note (`![]()` for images, `[]()` for PDFs).
2. Clicking a card → `openPreview({ url, name, kind })` → `PreviewModal` shows the
   image (`<img>`) or PDF (`<iframe>`).
3. In the rendered note, `MarkdownView`'s `img`/`a` renderers call the same
   `openPreview`, opening the identical modal.

## Error Handling & Edge Cases

- `PdfThumbnail`: pdf.js load/parse failure or slow load → graceful fallback to the
  `FileText` icon (never a broken canvas). Worker init guarded once.
- `PreviewModal`: a PDF `<iframe>` that fails still shows the header with the
  "open in new tab / download" link as an escape hatch.
- Missing auth token → thumbnail/preview fail to fetch and fall back; no crash.
- SSR safety: all pdf.js code is client-only, never touched during server render.

## Testing (Vitest + Testing Library, TDD)

- **`PreviewContext`** — `openPreview` sets state; modal mounts/unmounts; Esc and
  backdrop-click close it.
- **`PreviewModal`** — image renders `<img>`; PDF renders `<iframe>` with the tokenized
  src; header "open in new tab" link present.
- **`PdfThumbnail`** — pdf.js mocked: success renders `<canvas>`; failure/loading
  renders the icon fallback.
- **`AttachmentsPanel`** — clicking an image/PDF card calls `openPreview` and does
  **not** open a new tab; PDF card renders the thumbnail component; uploading a PDF
  auto-inserts a link into the note.
- **`MarkdownView`** — with a preview handler, `img` is clickable and a PDF-attachment
  link renders the inline card; without a handler, both fall back to plain rendering
  (existing tests stay green).

## Files Touched (summary)

**New**
- `components/preview/PreviewContext.tsx`
- `components/preview/PreviewModal.tsx`
- `components/preview/PdfThumbnail.tsx`
- `lib/files/url.ts`
- Test files for each of the above + updated component tests.

**Modified**
- `components/AttachmentsPanel.tsx`
- `components/editor/MarkdownView.tsx`
- `components/editor/MarkdownEditor.tsx`
- `app/topic/[id]/page.tsx`
- `package.json` (add `pdfjs-dist`)
