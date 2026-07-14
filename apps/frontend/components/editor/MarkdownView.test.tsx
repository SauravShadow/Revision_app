import { it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MarkdownView } from './MarkdownView';

vi.mock('@/lib/auth/client', () => ({ getStoredFileToken: () => 'file-tok' }));

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
