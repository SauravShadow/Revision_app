import { it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Skeleton } from './Skeleton';

it('is hidden from assistive tech — it conveys no information', () => {
  const { container } = render(<Skeleton />);
  expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
});

it('carries the skeleton class and merges caller sizing', () => {
  const { container } = render(<Skeleton className="h-4 w-32" />);
  const el = container.firstChild as HTMLElement;
  expect(el.className).toContain('skeleton');
  expect(el.className).toContain('h-4');
  expect(el.className).toContain('w-32');
});
