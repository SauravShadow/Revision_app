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

it('forwards className to its root element', () => {
  loadMock.mockResolvedValueOnce(undefined);
  const { container } = render(<PdfThumbnail url="/x" className="sentinel-cls" />);
  expect(container.querySelector('.sentinel-cls')).toBeTruthy();
});

it('retries loading when the url changes after a failure', async () => {
  loadMock.mockRejectedValueOnce(new Error('boom'));
  const { rerender } = render(<PdfThumbnail url="/a" />);
  await waitFor(() => expect(screen.getByLabelText('PDF')).toBeTruthy());

  loadMock.mockResolvedValueOnce(undefined);
  rerender(<PdfThumbnail url="/b" />);
  await waitFor(() => expect(loadMock).toHaveBeenLastCalledWith('/b', expect.any(HTMLCanvasElement)));
});
