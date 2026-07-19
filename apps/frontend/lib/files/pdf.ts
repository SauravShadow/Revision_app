import * as pdfjs from 'pdfjs-dist';

// Configure the worker once. The worker file is copied into public/ by
// scripts/copy-pdf-worker.mjs (wired into predev/prebuild), and served as a
// static asset. This avoids bundler-dependent `new URL(..., import.meta.url)`
// resolution, which is not guaranteed to work across Next.js versions/config.
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

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
