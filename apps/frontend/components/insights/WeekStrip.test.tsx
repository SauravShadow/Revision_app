import { it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WeekStrip } from './WeekStrip';

const noLoads = new Map();
const now = Date.parse('2026-08-01T10:00:00Z');

it('week nav buttons are real 44px targets — their hit boxes would otherwise overlap Today', () => {
  render(<WeekStrip loads={noLoads} now={now} />);
  for (const name of ['Previous week', 'Next week']) {
    expect(screen.getByRole('button', { name }).className).toContain('h-11');
  }
  expect(screen.getByRole('button', { name: 'Today' }).className).toContain('min-h-11');
});

it('still renders seven day buttons', () => {
  render(<WeekStrip loads={noLoads} now={now} />);
  const days = screen
    .getAllByRole('button')
    .filter((b) => /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) \d+/.test(b.getAttribute('aria-label') ?? ''));
  expect(days).toHaveLength(7);
});
