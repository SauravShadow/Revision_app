import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InlineEditable } from './InlineEditable';

it('commits a trimmed value on Enter', async () => {
  const onCommit = vi.fn();
  const onEditingChange = vi.fn();
  render(<InlineEditable value="Old" editing onEditingChange={onEditingChange} onCommit={onCommit} />);
  const input = screen.getByRole('textbox');
  await userEvent.clear(input);
  await userEvent.type(input, '  New Name  {Enter}');
  expect(onCommit).toHaveBeenCalledWith('New Name');
  expect(onEditingChange).toHaveBeenCalledWith(false);
});

it('cancels on Escape without committing', async () => {
  const onCommit = vi.fn();
  const onEditingChange = vi.fn();
  render(<InlineEditable value="Old" editing onEditingChange={onEditingChange} onCommit={onCommit} />);
  await userEvent.type(screen.getByRole('textbox'), 'x{Escape}');
  expect(onCommit).not.toHaveBeenCalled();
  expect(onEditingChange).toHaveBeenCalledWith(false);
});

it('does not commit an empty value', async () => {
  const onCommit = vi.fn();
  render(<InlineEditable value="Old" editing onEditingChange={() => {}} onCommit={onCommit} />);
  const input = screen.getByRole('textbox');
  await userEvent.clear(input);
  await userEvent.type(input, '{Enter}');
  expect(onCommit).not.toHaveBeenCalled();
});

it('renders plain text when not editing', () => {
  render(<InlineEditable value="Shown" editing={false} onEditingChange={() => {}} onCommit={() => {}} />);
  expect(screen.getByText('Shown')).toBeInTheDocument();
  expect(screen.queryByRole('textbox')).toBeNull();
});
