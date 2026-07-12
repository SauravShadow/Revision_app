import { it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MarkdownView } from './MarkdownView';

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
