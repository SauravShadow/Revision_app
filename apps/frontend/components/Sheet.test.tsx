import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sheet } from './Sheet';

it('renders into document.body, not the caller subtree', () => {
  // The header's backdrop-filter makes it a containing block for fixed
  // descendants, which clipped overlays rendered from it — the portal is what
  // keeps a sheet full-screen no matter who renders it.
  const { container } = render(
    <Sheet label="Plan" onClose={vi.fn()}>
      <p>body</p>
    </Sheet>,
  );
  expect(container).toBeEmptyDOMElement();
  expect(screen.getByRole('dialog', { name: 'Plan' })).toBeInTheDocument();
});

it('closes on Escape and on backdrop click, but not on content click', () => {
  const onClose = vi.fn();
  render(
    <Sheet label="Plan" onClose={onClose}>
      <button>inside</button>
    </Sheet>,
  );

  fireEvent.click(screen.getByRole('button', { name: 'inside' }));
  expect(onClose).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('dialog'));
  expect(onClose).toHaveBeenCalledTimes(1);

  fireEvent.keyDown(window, { key: 'Escape' });
  expect(onClose).toHaveBeenCalledTimes(2);
});

it('locks body scroll while open and restores it on unmount', () => {
  const { unmount } = render(
    <Sheet label="Plan" onClose={vi.fn()}>
      <p>body</p>
    </Sheet>,
  );
  expect(document.body.style.overflow).toBe('hidden');
  unmount();
  expect(document.body.style.overflow).toBe('');
});
