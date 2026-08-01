import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IconButton } from './IconButton';

it('exposes label as the accessible name and as a tooltip', () => {
  render(<IconButton label="Clear plan"><span aria-hidden>x</span></IconButton>);
  const btn = screen.getByRole('button', { name: 'Clear plan' });
  expect(btn).toHaveAttribute('title', 'Clear plan');
});

it('applies the touch-target hit-area class', () => {
  render(<IconButton label="Undo"><span aria-hidden>u</span></IconButton>);
  expect(screen.getByRole('button', { name: 'Undo' }).className).toContain('touch-target');
});

it('compact keeps the drawn box small, regular floors it at 44px', () => {
  const { rerender } = render(<IconButton label="A"><span /></IconButton>);
  expect(screen.getByRole('button', { name: 'A' }).className).not.toContain('min-h-11');
  rerender(<IconButton label="A" size="regular"><span /></IconButton>);
  expect(screen.getByRole('button', { name: 'A' }).className).toContain('min-h-11');
});

it('defaults to type=button so it never submits a surrounding form', () => {
  render(<IconButton label="Delete"><span /></IconButton>);
  expect(screen.getByRole('button', { name: 'Delete' })).toHaveAttribute('type', 'button');
});

it('forwards clicks and extra props', async () => {
  const onClick = vi.fn();
  render(<IconButton label="Redo" onClick={onClick} disabled={false} data-testid="redo"><span /></IconButton>);
  await userEvent.click(screen.getByTestId('redo'));
  expect(onClick).toHaveBeenCalledOnce();
});
