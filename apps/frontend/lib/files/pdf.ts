/**
 * Renders the first page of the PDF at `url` into `canvas`, fitting `width` px.
 *
 * pdf.js is imported DYNAMICALLY inside this function (never at module top) so it
 * is only ever evaluated in the browser. A static top-level `import 'pdfjs-dist'`
 * pulls pdf.js into the Next.js server-render graph, where pdfjs-dist v4's use of
 * `Promise.withResolvers` throws on Node < 22 and 500s the whole topic page.
 * This function only runs from a client effect, so the dynamic import never
 * executes during SSR.
 */
export async function loadPdfFirstPageToCanvas(
  url: string,
  canvas: HTMLCanvasElement,
  opts: { width?: number } = {},
): Promise<void> {
  // Defense-in-depth: pdfjs-dist v4 needs Promise.withResolvers, which is absent
  // in older browsers (and Node < 22). Polyfill it before loading pdf.js.
  ensurePromiseWithResolvers();

  const pdfjs = await import('pdfjs-dist');
  // The worker is served as a static asset, copied into public/ by
  // scripts/copy-pdf-worker.mjs (wired into predev/prebuild). Assigning per call
  // is idempotent and cheap, and avoids a module-load side effect.
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

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

/** Adds a minimal Promise.withResolvers polyfill when the runtime lacks it. */
function ensurePromiseWithResolvers(): void {
  const P = Promise as unknown as { withResolvers?: () => unknown };
  if (typeof P.withResolvers === 'function') return;
  P.withResolvers = function withResolvers<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}
