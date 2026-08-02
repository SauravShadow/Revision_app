import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { RowActions } from './RowActions';

it('rename and delete carry the touch-target floor', () => {
  render(<RowActions onRename={() => {}} onDelete={() => {}} />);
  for (const name of ['Rename', 'Delete']) {
    expect(screen.getByRole('button', { name }).className).toContain('touch-target');
  }
});

it('three adjacent actions grow for real rather than overlapping hit boxes', () => {
  render(<RowActions onRename={() => {}} onDelete={() => {}} onDuplicate={vi.fn()} />);
  // gap-1 (4px) between 31px buttons: 44px ::after boxes would overlap by ~9px.
  expect(screen.getByRole('button', { name: 'Rename' }).className).toContain('min-h-11');
});

it('duplicate only renders when a handler is supplied', () => {
  const { rerender } = render(<RowActions onRename={() => {}} onDelete={() => {}} />);
  expect(screen.queryByRole('button', { name: 'Duplicate' })).toBeNull();
  rerender(<RowActions onRename={() => {}} onDelete={() => {}} onDuplicate={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Duplicate' })).toBeInTheDocument();
});

it('suppresses the parent link navigation when an action is pressed', () => {
  const onRename = vi.fn();
  render(<RowActions onRename={onRename} onDelete={() => {}} />);
  const evt = new MouseEvent('click', { bubbles: true, cancelable: true });
  fireEvent(screen.getByRole('button', { name: 'Rename' }), evt);
  expect(onRename).toHaveBeenCalledOnce();
  expect(evt.defaultPrevented).toBe(true);
});

it('offers a single overflow button for phones, so the row keeps its width for the title', () => {
  render(<RowActions onRename={() => {}} onDelete={() => {}} onDuplicate={vi.fn()} />);
  const more = screen.getByRole('button', { name: 'More actions' });
  // Desktop keeps the inline row; the overflow button is the phone affordance.
  expect(more.className).toContain('md:hidden');
});

it('the overflow sheet exposes every action and suppresses row navigation', async () => {
  const onRename = vi.fn();
  render(<RowActions onRename={onRename} onDelete={() => {}} onDuplicate={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'More actions' }));

  const dialog = await screen.findByRole('dialog');
  expect(dialog).toBeInTheDocument();
  const renameInSheet = within(dialog).getByRole('button', { name: /Rename/ });

  const evt = new MouseEvent('click', { bubbles: true, cancelable: true });
  fireEvent(renameInSheet, evt);
  expect(onRename).toHaveBeenCalledOnce();
  expect(evt.defaultPrevented).toBe(true);
});
