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
