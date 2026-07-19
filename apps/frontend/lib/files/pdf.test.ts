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
