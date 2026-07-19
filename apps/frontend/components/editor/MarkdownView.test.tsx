import { it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { MarkdownView } from './MarkdownView';
import { PreviewProvider } from '@/components/preview/PreviewContext';
import type { Attachment } from '@revision-app/shared';

vi.mock('@/lib/auth/client', () => ({ getStoredFileToken: () => 'file-tok' }));
vi.mock('@/lib/files/pdf', () => ({ loadPdfFirstPageToCanvas: vi.fn().mockResolvedValue(undefined) }));

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

it('appends the stored file token to internal /api/files image URLs', () => {
  const { container } = render(<MarkdownView markdown={'![alt](/api/files/abc123)'} />);
  const img = container.querySelector('img');
  expect(img?.getAttribute('src')).toBe('/api/files/abc123?token=file-tok');
});

it('leaves external URLs untouched', () => {
  const { container } = render(<MarkdownView markdown={'[link](https://example.com)'} />);
  const a = container.querySelector('a');
  expect(a?.getAttribute('href')).toBe('https://example.com');
});

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
