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
