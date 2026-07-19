# In-App Preview for Photos & PDFs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users preview photos and PDFs inside the app (a modal/lightbox) instead of in a new browser tab, give PDF attachments real first-page thumbnails, and auto-inline every uploaded attachment into the note.

**Architecture:** A single `PreviewProvider` React context wraps the topic page and exposes `openPreview(item)`. Both the Attachments panel cards and the note's rendered markdown call it, and one `PreviewModal` renders at the provider root. PDF thumbnails are drawn from page 1 via pdf.js to a `<canvas>`; the full-size PDF preview uses a native `<iframe>`.

**Tech Stack:** Next.js 15 (App Router) + React 19, TypeScript, Zustand store, react-markdown v10, lucide-react icons, `pdfjs-dist` (new), Vitest + Testing Library.

## Global Constraints

- **Working directory for all commands:** `apps/frontend` (run `cd apps/frontend` first each session). The `@` import alias maps to `apps/frontend/`.
- **Run tests with:** `npx vitest run <path>` (single file) or `npm test` (full suite). `npm test` runs `vitest run`.
- **File-access tokens:** internal file URLs (`/api/...`) require a `?token=<token>` query param, produced by `addTokenToUrl` (extracted in Task 1). External URLs pass through unchanged.
- **`PreviewItem.url` is always already-tokenized** — `PreviewModal` and `PdfThumbnail` receive a final URL and must NOT tokenize again. Tokenization happens at the call site (the panel) or via react-markdown's `urlTransform` (the note).
- **`Attachment` type** (`@revision-app/shared`): `{ id: string; name: string; kind: 'image'|'pdf'|'link'|'video'; url: string; mime?: string; size?: number; createdAt: number }`.
- TDD: write the failing test first, watch it fail, implement minimally, watch it pass, commit.

---

### Task 1: Extract shared `addTokenToUrl` helper

`addTokenToUrl` is currently duplicated verbatim in `AttachmentsPanel.tsx` and `editor/MarkdownView.tsx`. Extract it to one module and re-point both consumers. Pure refactor — the full suite must stay green.

**Files:**
- Create: `apps/frontend/lib/files/url.ts`
- Create: `apps/frontend/lib/files/url.test.ts`
- Modify: `apps/frontend/components/AttachmentsPanel.tsx` (remove local copy, import)
- Modify: `apps/frontend/components/editor/MarkdownView.tsx` (remove local copy, import)

**Interfaces:**
- Produces: `addTokenToUrl(url?: string): string`

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/lib/files/url.test.ts`:

```ts
import { it, expect, vi } from 'vitest';

vi.mock('@/lib/auth/client', () => ({ getStoredFileToken: () => 'file-tok' }));

import { addTokenToUrl } from './url';

it('appends the token to internal /api/ urls', () => {
  expect(addTokenToUrl('/api/files/a1')).toBe('/api/files/a1?token=file-tok');
});

it('uses & when the url already has a query string', () => {
  expect(addTokenToUrl('/api/files/a1?x=1')).toBe('/api/files/a1?x=1&token=file-tok');
});

it('leaves external urls untouched and returns empty for undefined', () => {
  expect(addTokenToUrl('https://example.com/x.png')).toBe('https://example.com/x.png');
  expect(addTokenToUrl(undefined)).toBe('');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run lib/files/url.test.ts`
Expected: FAIL — cannot resolve `./url`.

- [ ] **Step 3: Create the module**

Create `apps/frontend/lib/files/url.ts`:

```ts
import { getStoredFileToken } from '@/lib/auth/client';

/** Appends the stored file-access token to internal (/api/...) URLs. External URLs pass through unchanged. */
export function addTokenToUrl(url?: string): string {
  if (!url) return '';
  if (url.startsWith('/api/')) {
    const token = getStoredFileToken();
    if (token) {
      const separator = url.includes('?') ? '&' : '?';
      return `${url}${separator}token=${encodeURIComponent(token)}`;
    }
  }
  return url;
}
```

- [ ] **Step 4: Re-point `AttachmentsPanel.tsx`**

In `apps/frontend/components/AttachmentsPanel.tsx`, delete the local `addTokenToUrl` function (lines 10–20) and add this import near the other `@/lib` imports:

```ts
import { addTokenToUrl } from '@/lib/files/url';
```

- [ ] **Step 5: Re-point `editor/MarkdownView.tsx`**

In `apps/frontend/components/editor/MarkdownView.tsx`, delete the local `addTokenToUrl` function and its now-unused `getStoredFileToken` import; add:

```ts
import { addTokenToUrl } from '@/lib/files/url';
```

- [ ] **Step 6: Run the new test + both affected suites**

Run: `cd apps/frontend && npx vitest run lib/files/url.test.ts components/AttachmentsPanel.test.tsx components/editor/MarkdownView.test.tsx`
Expected: PASS (all).

- [ ] **Step 7: Commit**

```bash
cd apps/frontend && git add lib/files/url.ts lib/files/url.test.ts components/AttachmentsPanel.tsx components/editor/MarkdownView.tsx
git commit -m "refactor(files): extract shared addTokenToUrl helper"
```

---

### Task 2: pdf.js loader module

Add `pdfjs-dist` and a single module that configures the worker once and renders page 1 of a PDF to a canvas. Isolating pdf.js here makes it trivially mockable in every downstream test.

**Files:**
- Modify: `apps/frontend/package.json` (add `pdfjs-dist`)
- Create: `apps/frontend/lib/files/pdf.ts`
- Create: `apps/frontend/lib/files/pdf.test.ts`

**Interfaces:**
- Produces: `loadPdfFirstPageToCanvas(url: string, canvas: HTMLCanvasElement, opts?: { width?: number }): Promise<void>`

- [ ] **Step 1: Install the dependency**

Run: `cd apps/frontend && npm install pdfjs-dist@4`
Expected: `pdfjs-dist` appears under `dependencies` in `apps/frontend/package.json`.

- [ ] **Step 2: Write the failing test**

Create `apps/frontend/lib/files/pdf.test.ts`:

```ts
import { it, expect, vi } from 'vitest';

const render = vi.fn(() => ({ promise: Promise.resolve() }));
const getPage = vi.fn(async () => ({
  getViewport: ({ scale = 1 }: { scale?: number }) => ({ width: 100 * scale, height: 200 * scale }),
  render,
}));

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: vi.fn(() => ({ promise: Promise.resolve({ getPage }) })),
}));

import { loadPdfFirstPageToCanvas } from './pdf';

it('renders page 1 into the canvas, sized to the target width', async () => {
  const canvas = document.createElement('canvas');
  // jsdom has no real 2d context; supply a stub so the loader proceeds.
  canvas.getContext = (() => ({})) as unknown as HTMLCanvasElement['getContext'];

  await loadPdfFirstPageToCanvas('/api/files/p1?token=t', canvas, { width: 200 });

  // base width 100 → scale 2 → viewport 200 x 400
  expect(canvas.width).toBe(200);
  expect(canvas.height).toBe(400);
  expect(render).toHaveBeenCalledOnce();
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run lib/files/pdf.test.ts`
Expected: FAIL — cannot resolve `./pdf`.

- [ ] **Step 4: Create the module**

Create `apps/frontend/lib/files/pdf.ts`:

```ts
import * as pdfjs from 'pdfjs-dist';

// Configure the worker once. Next emits the worker asset from this URL.
// Fallback if the worker fails to load at runtime: copy
// node_modules/pdfjs-dist/build/pdf.worker.min.mjs into apps/frontend/public/
// and set workerSrc = '/pdf.worker.min.mjs'.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

/** Renders the first page of the PDF at `url` into `canvas`, fitting `width` px. */
export async function loadPdfFirstPageToCanvas(
  url: string,
  canvas: HTMLCanvasElement,
  opts: { width?: number } = {},
): Promise<void> {
  const targetWidth = opts.width ?? 240;
  const pdf = await pdfjs.getDocument({ url }).promise;
  const page = await pdf.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const scale = targetWidth / base.width;
  const viewport = page.getViewport({ scale });
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: ctx, viewport }).promise;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/frontend && npx vitest run lib/files/pdf.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd apps/frontend && git add package.json package-lock.json lib/files/pdf.ts lib/files/pdf.test.ts
git commit -m "feat(files): add pdf.js first-page canvas renderer"
```

> Note: if `package-lock.json` for this workspace lives at the repo root, `git add` it from there instead; run `git status` to confirm which lockfile changed.

---

### Task 3: Preview context + modal

The shared trigger and the lightbox. Context default has `openPreview: null` so consumers outside a provider fall back to plain rendering.

**Files:**
- Create: `apps/frontend/components/preview/PreviewContext.tsx`
- Create: `apps/frontend/components/preview/PreviewModal.tsx`
- Create: `apps/frontend/components/preview/PreviewContext.test.tsx`
- Create: `apps/frontend/components/preview/PreviewModal.test.tsx`

**Interfaces:**
- Produces: `type PreviewKind = 'image' | 'pdf'`
- Produces: `interface PreviewItem { url: string; name: string; kind: PreviewKind }`
- Produces: `PreviewProvider({ children }): JSX.Element`
- Produces: `usePreview(): { openPreview: ((item: PreviewItem) => void) | null }`
- Produces: `PreviewModal({ item, onClose }: { item: PreviewItem; onClose: () => void }): JSX.Element`

- [ ] **Step 1: Write the failing modal test**

Create `apps/frontend/components/preview/PreviewModal.test.tsx`:

```tsx
import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PreviewModal } from './PreviewModal';

it('renders an image preview with the given url', () => {
  render(<PreviewModal item={{ url: '/api/files/i1?token=t', name: 'pic.png', kind: 'image' }} onClose={() => {}} />);
  const img = screen.getByAltText('pic.png') as HTMLImageElement;
  expect(img.getAttribute('src')).toBe('/api/files/i1?token=t');
});

it('renders a pdf preview in an iframe with the given url', () => {
  render(<PreviewModal item={{ url: '/api/files/p1?token=t', name: 'doc.pdf', kind: 'pdf' }} onClose={() => {}} />);
  const iframe = screen.getByTitle('doc.pdf') as HTMLIFrameElement;
  expect(iframe.getAttribute('src')).toBe('/api/files/p1?token=t');
});

it('closes on Escape and on backdrop click', () => {
  const onClose = vi.fn();
  const { container } = render(
    <PreviewModal item={{ url: '/x', name: 'n', kind: 'image' }} onClose={onClose} />,
  );
  fireEvent.keyDown(window, { key: 'Escape' });
  fireEvent.click(container.firstChild as Element);
  expect(onClose).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/frontend && npx vitest run components/preview/PreviewModal.test.tsx`
Expected: FAIL — cannot resolve `./PreviewModal`.

- [ ] **Step 3: Create `PreviewModal.tsx`**

Create `apps/frontend/components/preview/PreviewModal.tsx`:

```tsx
'use client';
import { useEffect } from 'react';
import { X, ExternalLink } from 'lucide-react';
import type { PreviewItem } from './PreviewContext';

export function PreviewModal({ item, onClose }: { item: PreviewItem; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid grid-rows-[auto_1fr] gap-3 bg-black/80 p-4" onClick={onClose}>
      <div className="flex items-center justify-between text-sm text-white" onClick={(e) => e.stopPropagation()}>
        <span className="truncate">{item.name}</span>
        <div className="flex items-center gap-3">
          <a href={item.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 opacity-80 hover:opacity-100">
            <ExternalLink size={16} /> Open
          </a>
          <button aria-label="Close preview" onClick={onClose} className="opacity-80 hover:opacity-100"><X size={18} /></button>
        </div>
      </div>
      <div className="min-h-0" onClick={(e) => e.stopPropagation()}>
        {item.kind === 'image' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.url} alt={item.name} className="mx-auto h-full max-h-full w-auto max-w-full rounded-lg object-contain" />
        ) : (
          <iframe src={item.url} title={item.name} className="h-full w-full rounded-lg bg-white" />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify the modal test passes**

Run: `cd apps/frontend && npx vitest run components/preview/PreviewModal.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write the failing context test**

Create `apps/frontend/components/preview/PreviewContext.test.tsx`:

```tsx
import { it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PreviewProvider, usePreview } from './PreviewContext';

function Trigger() {
  const { openPreview } = usePreview();
  return (
    <button onClick={() => openPreview?.({ url: '/api/files/i1?token=t', name: 'pic.png', kind: 'image' })}>
      open
    </button>
  );
}

it('opens and closes the modal through the context', () => {
  render(<PreviewProvider><Trigger /></PreviewProvider>);
  expect(screen.queryByAltText('pic.png')).toBeNull();
  fireEvent.click(screen.getByText('open'));
  expect(screen.getByAltText('pic.png')).toBeTruthy();
  fireEvent.click(screen.getByLabelText('Close preview'));
  expect(screen.queryByAltText('pic.png')).toBeNull();
});

it('exposes a null openPreview when no provider is present', () => {
  let captured: unknown = 'unset';
  function Probe() { captured = usePreview().openPreview; return null; }
  render(<Probe />);
  expect(captured).toBeNull();
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `cd apps/frontend && npx vitest run components/preview/PreviewContext.test.tsx`
Expected: FAIL — cannot resolve `./PreviewContext`.

- [ ] **Step 7: Create `PreviewContext.tsx`**

Create `apps/frontend/components/preview/PreviewContext.tsx`:

```tsx
'use client';
import { createContext, useContext, useState, useCallback } from 'react';
import { PreviewModal } from './PreviewModal';

export type PreviewKind = 'image' | 'pdf';
export interface PreviewItem { url: string; name: string; kind: PreviewKind }

type OpenPreview = (item: PreviewItem) => void;

const PreviewContext = createContext<{ openPreview: OpenPreview | null }>({ openPreview: null });

export function usePreview() {
  return useContext(PreviewContext);
}

export function PreviewProvider({ children }: { children: React.ReactNode }) {
  const [item, setItem] = useState<PreviewItem | null>(null);
  const openPreview = useCallback<OpenPreview>((next) => setItem(next), []);
  return (
    <PreviewContext.Provider value={{ openPreview }}>
      {children}
      {item && <PreviewModal item={item} onClose={() => setItem(null)} />}
    </PreviewContext.Provider>
  );
}
```

- [ ] **Step 8: Run both preview tests**

Run: `cd apps/frontend && npx vitest run components/preview/`
Expected: PASS (all).

- [ ] **Step 9: Commit**

```bash
cd apps/frontend && git add components/preview/PreviewContext.tsx components/preview/PreviewModal.tsx components/preview/PreviewContext.test.tsx components/preview/PreviewModal.test.tsx
git commit -m "feat(preview): shared preview context and modal"
```

---

### Task 4: PDF thumbnail component

Renders a PDF's first page to a canvas via the Task 2 loader, falling back to a file icon on failure or while loading.

**Files:**
- Create: `apps/frontend/components/preview/PdfThumbnail.tsx`
- Create: `apps/frontend/components/preview/PdfThumbnail.test.tsx`

**Interfaces:**
- Consumes: `loadPdfFirstPageToCanvas` (Task 2)
- Produces: `PdfThumbnail({ url, className }: { url: string; className?: string }): JSX.Element`

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/components/preview/PdfThumbnail.test.tsx`:

```tsx
import { it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { loadPdfFirstPageToCanvas } from '@/lib/files/pdf';
import { PdfThumbnail } from './PdfThumbnail';

vi.mock('@/lib/files/pdf', () => ({ loadPdfFirstPageToCanvas: vi.fn() }));
const loadMock = vi.mocked(loadPdfFirstPageToCanvas);

it('renders a canvas and calls the loader with the url', async () => {
  loadMock.mockResolvedValueOnce(undefined);
  render(<PdfThumbnail url="/api/files/p1?token=t" />);
  expect(screen.getByLabelText('PDF preview')).toBeTruthy();
  await waitFor(() =>
    expect(loadMock).toHaveBeenCalledWith('/api/files/p1?token=t', expect.any(HTMLCanvasElement)),
  );
});

it('falls back to a file icon when rendering fails', async () => {
  loadMock.mockRejectedValueOnce(new Error('boom'));
  render(<PdfThumbnail url="/api/files/p1?token=t" />);
  await waitFor(() => expect(screen.getByLabelText('PDF')).toBeTruthy());
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/frontend && npx vitest run components/preview/PdfThumbnail.test.tsx`
Expected: FAIL — cannot resolve `./PdfThumbnail`.

- [ ] **Step 3: Create `PdfThumbnail.tsx`**

Create `apps/frontend/components/preview/PdfThumbnail.tsx`:

```tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import { loadPdfFirstPageToCanvas } from '@/lib/files/pdf';

export function PdfThumbnail({ url, className }: { url: string; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setReady(false);
    const canvas = canvasRef.current;
    if (!canvas) return;
    loadPdfFirstPageToCanvas(url, canvas)
      .then(() => { if (!cancelled) setReady(true); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [url]);

  if (failed) {
    return (
      <div className={`grid place-items-center bg-black/20 ${className ?? ''}`} aria-label="PDF">
        <FileText size={28} className="opacity-70" />
      </div>
    );
  }
  return (
    <canvas
      ref={canvasRef}
      aria-label="PDF preview"
      className={`${ready ? '' : 'opacity-0'} ${className ?? ''}`}
    />
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/frontend && npx vitest run components/preview/PdfThumbnail.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd apps/frontend && git add components/preview/PdfThumbnail.tsx components/preview/PdfThumbnail.test.tsx
git commit -m "feat(preview): pdf first-page thumbnail component"
```

---

### Task 5: Wire the Attachments panel

Cards open the in-app preview instead of a new tab; PDF cards show a real thumbnail; uploading a PDF auto-inserts a note link. Update the one existing test that asserted an image renders as an anchor.

**Files:**
- Modify: `apps/frontend/components/AttachmentsPanel.tsx`
- Modify: `apps/frontend/components/AttachmentsPanel.test.tsx`

**Interfaces:**
- Consumes: `usePreview` (Task 3), `PdfThumbnail` (Task 4), `addTokenToUrl` (Task 1)

- [ ] **Step 1: Write/adjust the failing tests**

In `apps/frontend/components/AttachmentsPanel.test.tsx`:

(a) Add these imports at the top (after the existing imports):

```tsx
import { PreviewProvider } from '@/components/preview/PreviewContext';
```

(b) Add this pdf-loader mock alongside the existing `vi.mock` calls (so PDF cards don't hit real pdf.js):

```tsx
vi.mock('@/lib/files/pdf', () => ({ loadPdfFirstPageToCanvas: vi.fn().mockRejectedValue(new Error('no-op')) }));
```

(c) Add a render helper near the other helpers:

```tsx
function renderPanel(topic: Topic, onInsert?: (m: string) => void) {
  return render(
    <PreviewProvider>
      <AttachmentsPanel topic={topic} onInsertMarkdown={onInsert} />
    </PreviewProvider>,
  );
}
```

(d) REPLACE the existing test `it('appends the stored file token to an internal attachment URL', ...)` (the one asserting `screen.getByText('diagram.png').closest('a')`) with:

```tsx
it('previews an image in-app instead of opening a new tab', () => {
  renderPanel(topicWithAttachment());
  const img = screen.getByAltText('diagram.png') as HTMLImageElement;
  expect(img.getAttribute('src')).toBe('/api/files/a1?token=file-tok');
  expect(img.closest('a')).toBeNull(); // no tab-out anchor for images

  fireEvent.click(img);
  // the modal renders a second copy of the same image
  expect(screen.getAllByAltText('diagram.png').length).toBeGreaterThan(1);
});
```

(e) Add a new test for PDF auto-insert:

```tsx
it('auto-inserts an uploaded PDF into the note as a link', async () => {
  const onInsert = vi.fn();
  uploadFileMock.mockResolvedValueOnce({
    id: 'p9', name: 'notes.pdf', kind: 'pdf', url: '/api/files/p9', createdAt: 1,
  });
  renderPanel(createTopic(), onInsert);

  fireEvent.change(screen.getByLabelText(/upload image\/pdf/i), {
    target: { files: [new File(['%PDF'], 'notes.pdf', { type: 'application/pdf' })] },
  });

  await waitFor(() => expect(onInsert).toHaveBeenCalledWith('[notes.pdf](/api/files/p9)'));
});
```

- [ ] **Step 2: Run to verify the new/changed tests fail**

Run: `cd apps/frontend && npx vitest run components/AttachmentsPanel.test.tsx`
Expected: FAIL — image still renders inside an anchor; PDF is not inserted.

- [ ] **Step 3: Update `AttachmentsPanel.tsx` imports & helpers**

In `apps/frontend/components/AttachmentsPanel.tsx`:

(a) Update the lucide import to drop `FileText` (PDFs now use the thumbnail) and keep the rest:

```ts
import { Paperclip, Upload, Link as LinkIcon, Trash2, ExternalLink } from 'lucide-react';
```

(b) Add these imports:

```ts
import { usePreview } from '@/components/preview/PreviewContext';
import { PdfThumbnail } from '@/components/preview/PdfThumbnail';
```

(c) Add a `pdfMarkdown` helper next to the existing `imageMarkdown`:

```ts
function pdfMarkdown(attachment: Attachment): string {
  return `[${escapeMarkdownAlt(attachment.name)}](${attachment.url})`;
}
```

- [ ] **Step 4: Read `usePreview` and extend `onUpload`**

In the `AttachmentsPanel` component body, add near the top (after `const { addAttachment, removeAttachment } = useStore.getState();`):

```ts
const { openPreview } = usePreview();
```

Replace the `onUpload` function body's loop so PDFs auto-insert too:

```ts
const onUpload = async (files: FileList | null) => {
  if (!files || files.length === 0) return;
  setBusy(true);
  try {
    const inserted: string[] = [];
    for (const f of Array.from(files)) {
      const attachment = await uploadFile(f);
      addAttachment(topic.id, attachment);
      if (attachment.kind === 'image') inserted.push(imageMarkdown(attachment));
      else if (attachment.kind === 'pdf') inserted.push(pdfMarkdown(attachment));
    }
    if (inserted.length > 0) onInsertMarkdown?.(inserted.join('\n\n'));
  } catch { window.alert('Upload failed.'); } finally { setBusy(false); }
};
```

- [ ] **Step 5: Replace the attachment `<li>` rendering**

Replace the `attachments.map(...)` list-item block (the `<li>` currently wrapping the `<a href=...>`) with:

```tsx
{attachments.map((a) => {
  const previewable = a.kind === 'image' || a.kind === 'pdf';
  const tokenUrl = addTokenToUrl(a.url);
  return (
    <li key={a.id} className="relative rounded-lg bg-white/5 p-2">
      {previewable ? (
        <button
          type="button"
          onClick={() => openPreview?.({ url: tokenUrl, name: a.name, kind: a.kind as 'image' | 'pdf' })}
          className="block w-full text-left text-sm hover:underline"
        >
          {a.kind === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tokenUrl} alt={a.name} className="mb-2 h-24 w-full rounded-md object-cover" />
          ) : (
            <PdfThumbnail url={tokenUrl} className="mb-2 h-24 w-full rounded-md object-cover" />
          )}
          <span className="block truncate pr-8">{a.name}</span>
        </button>
      ) : (
        <a
          href={tokenUrl}
          target="_blank"
          rel="noreferrer"
          className="flex min-w-0 items-center gap-2 pr-8 text-sm hover:underline"
        >
          <ExternalLink size={16} className="shrink-0" />
          <span className="truncate">{a.name}</span>
        </a>
      )}
      <button
        aria-label="Remove attachment"
        onClick={() => remove(a.id)}
        className="absolute right-2 top-2 rounded bg-black/30 p-1 hover:bg-white/10"
      >
        <Trash2 size={14} />
      </button>
    </li>
  );
})}
```

- [ ] **Step 6: Run the panel suite**

Run: `cd apps/frontend && npx vitest run components/AttachmentsPanel.test.tsx`
Expected: PASS (including the existing image-upload-insert test at line ~42, unchanged).

- [ ] **Step 7: Commit**

```bash
cd apps/frontend && git add components/AttachmentsPanel.tsx components/AttachmentsPanel.test.tsx
git commit -m "feat(attachments): in-app preview + pdf thumbnails + pdf auto-insert"
```

---

### Task 6: Inline preview inside notes

Make note images click-to-enlarge and render PDF-attachment links as clickable thumbnail cards, then provide the context at the topic page and thread attachments through the editor.

**Files:**
- Modify: `apps/frontend/components/editor/MarkdownView.tsx`
- Modify: `apps/frontend/components/editor/MarkdownView.test.tsx`
- Modify: `apps/frontend/components/editor/MarkdownEditor.tsx`
- Modify: `apps/frontend/app/topic/[id]/page.tsx`

**Interfaces:**
- Consumes: `usePreview` (Task 3), `PdfThumbnail` (Task 4), `addTokenToUrl` (Task 1), `PreviewProvider` (Task 3)
- `MarkdownView` new signature: `MarkdownView({ markdown, attachments }: { markdown: string; attachments?: Attachment[] })`

- [ ] **Step 1: Write the failing tests**

Append to `apps/frontend/components/editor/MarkdownView.test.tsx` (keep the existing tests — they render without a provider and stay green):

```tsx
import { fireEvent, screen } from '@testing-library/react';
import { PreviewProvider } from '@/components/preview/PreviewContext';
import type { Attachment } from '@revision-app/shared';

vi.mock('@/lib/files/pdf', () => ({ loadPdfFirstPageToCanvas: vi.fn().mockResolvedValue(undefined) }));

it('makes a note image clickable to open the preview', () => {
  render(<PreviewProvider><MarkdownView markdown={'![pic](/api/files/i1)'} /></PreviewProvider>);
  const img = screen.getByAltText('pic');
  expect(img.closest('button')).not.toBeNull();
  fireEvent.click(img);
  expect(screen.getAllByAltText('pic').length).toBeGreaterThan(1); // modal copy
});

it('renders a pdf-attachment link as a thumbnail card', () => {
  const attachments: Attachment[] = [
    { id: 'p1', name: 'doc.pdf', kind: 'pdf', url: '/api/files/p1', createdAt: 1 },
  ];
  render(
    <PreviewProvider>
      <MarkdownView markdown={'[doc.pdf](/api/files/p1)'} attachments={attachments} />
    </PreviewProvider>,
  );
  expect(screen.getByLabelText('PDF preview')).toBeTruthy();
});
```

> Note: the existing file mocks `getStoredFileToken` to return `'file-tok'`, so `urlTransform` tokenizes hrefs to `/api/files/p1?token=file-tok`. The `a` renderer strips the query before matching against `attachment.url` (`/api/files/p1`), so the lookup still succeeds.

- [ ] **Step 2: Run to verify the new tests fail**

Run: `cd apps/frontend && npx vitest run components/editor/MarkdownView.test.tsx`
Expected: FAIL — image is not wrapped in a button; the PDF link renders as a plain anchor.

- [ ] **Step 3: Update `MarkdownView.tsx`**

In `apps/frontend/components/editor/MarkdownView.tsx`:

(a) Add imports:

```ts
import type { Components } from 'react-markdown';
import type { Attachment } from '@revision-app/shared';
import { usePreview } from '@/components/preview/PreviewContext';
import { PdfThumbnail } from '@/components/preview/PdfThumbnail';
```

(b) Add this helper above the component:

```ts
function findPdfAttachment(href: string, attachments?: Attachment[]): Attachment | undefined {
  if (!href || !attachments) return undefined;
  const base = href.split('?')[0];
  return attachments.find((a) => a.kind === 'pdf' && a.url === base);
}
```

(c) Replace the `MarkdownView` function with:

```tsx
export function MarkdownView({ markdown, attachments }: { markdown: string; attachments?: Attachment[] }) {
  const { openPreview } = usePreview();

  let previewComponents: Components | undefined;
  if (openPreview) {
    const open = openPreview; // narrowed non-null
    previewComponents = {
      img: ({ src, alt }) => {
        const url = typeof src === 'string' ? src : '';
        return (
          <button type="button" onClick={() => open({ url, name: alt ?? '', kind: 'image' })} className="block cursor-zoom-in">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={alt ?? ''} className="max-w-full rounded-lg" />
          </button>
        );
      },
      a: ({ href, children }) => {
        const url = typeof href === 'string' ? href : '';
        const pdf = findPdfAttachment(url, attachments);
        if (pdf) {
          return (
            <button type="button" onClick={() => open({ url, name: pdf.name, kind: 'pdf' })} className="my-2 block w-40 cursor-zoom-in text-left">
              <PdfThumbnail url={url} className="h-28 w-full rounded-md object-cover" />
              <span className="mt-1 block truncate text-xs opacity-70">{pdf.name}</span>
            </button>
          );
        }
        return <a href={url} target="_blank" rel="noreferrer">{children}</a>;
      },
    };
  }

  return (
    <div className={PROSE}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkCallouts]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, schema], rehypeKatex, rehypeHighlight]}
        urlTransform={addTokenToUrl}
        components={previewComponents}
      >
        {markdown || '_Nothing yet._'}
      </ReactMarkdown>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify MarkdownView tests pass**

Run: `cd apps/frontend && npx vitest run components/editor/MarkdownView.test.tsx`
Expected: PASS (new and existing).

- [ ] **Step 5: Thread attachments through `MarkdownEditor.tsx`**

In `apps/frontend/components/editor/MarkdownEditor.tsx`:

(a) After `const addAttachment = useStore((s) => s.addAttachment);` add:

```ts
const attachments = useStore((s) => s.topics[topicId]?.attachments);
```

(b) Update the preview-pane render (currently `<MarkdownView markdown={value} />`) to:

```tsx
<MarkdownView markdown={value} attachments={attachments} />
```

- [ ] **Step 6: Provide the context at the topic page**

In `apps/frontend/app/topic/[id]/page.tsx`:

(a) Add the import:

```ts
import { PreviewProvider } from '@/components/preview/PreviewContext';
```

(b) Wrap the returned JSX. Change `return (` `<div className="mx-auto w-full max-w-5xl">` … `</div>` `);` so the outer element is `PreviewProvider`:

```tsx
return (
  <PreviewProvider>
    <div className="mx-auto w-full max-w-5xl">
      {/* …existing content unchanged… */}
    </div>
  </PreviewProvider>
);
```

- [ ] **Step 7: Run the editor + topic-adjacent suites and the full suite**

Run: `cd apps/frontend && npx vitest run components/editor/ components/AttachmentsPanel.test.tsx components/preview/`
Then the whole suite: `cd apps/frontend && npm test`
Expected: PASS (all).

- [ ] **Step 8: Typecheck / build sanity**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: no errors. (If `tsc` isn't wired, run `npm run build` instead and confirm it compiles.)

- [ ] **Step 9: Commit**

```bash
cd apps/frontend && git add components/editor/MarkdownView.tsx components/editor/MarkdownView.test.tsx components/editor/MarkdownEditor.tsx "app/topic/[id]/page.tsx"
git commit -m "feat(notes): inline in-app preview for images and pdf attachments"
```

---

## Manual Verification (after all tasks)

1. `cd apps/frontend && npm run dev`, open a topic.
2. Upload an image → it appears as a card thumbnail AND inline in the note preview; clicking either opens the in-app lightbox (no new tab); Esc / backdrop / X close it.
3. Upload a PDF → the card shows a real first-page thumbnail; the note preview shows a PDF thumbnail card; clicking either opens the PDF in the in-app modal (`<iframe>`), with an "Open" escape-hatch link.
4. A pasted external link still opens in a new tab (unchanged).

## Self-Review Notes (author)

- **Spec coverage:** in-app preview modal (Task 3) ✓; rich PDF cards (Tasks 2, 4, 5) ✓; photo + PDF auto-inline into notes (Tasks 5, 6) ✓; shared `addTokenToUrl` cleanup (Task 1) ✓; error/fallback handling (Task 4 icon fallback, Modal "Open" link) ✓; test plan (every task) ✓.
- **Type consistency:** `PreviewItem`/`PreviewKind` defined in Task 3 and consumed unchanged in Tasks 5–6; `loadPdfFirstPageToCanvas` signature identical across Tasks 2/4; `addTokenToUrl` signature identical across Tasks 1/5/6.
- **Token double-encoding avoided:** `PreviewModal`/`PdfThumbnail` never tokenize; callers pass final URLs (panel via `addTokenToUrl`, notes via `urlTransform`).
