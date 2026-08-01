import { it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HeaderControls } from './HeaderControls';

it('undo and redo carry the touch-target hit-area floor', () => {
  render(<HeaderControls />);
  for (const name of ['Undo', 'Redo']) {
    expect(screen.getByRole('button', { name }).className).toContain('touch-target');
  }
});

it('undo and redo keep their disabled state when there is no history', () => {
  render(<HeaderControls />);
  expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
});
