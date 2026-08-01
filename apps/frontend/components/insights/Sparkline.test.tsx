import { it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sparkline } from './Sparkline';

const points = [
  { day: '2026-07-01', revisions: 2 },
  { day: '2026-07-02', revisions: 0 },
  { day: '2026-07-03', revisions: 5 },
];

it('exposes one accessible image with the caller label', () => {
  render(<Sparkline points={points} label="Cohort revision activity" />);
  expect(screen.getByRole('img', { name: /Cohort revision activity/ })).toBeInTheDocument();
});

it('summarises the range in the accessible name so it is not an empty image', () => {
  render(<Sparkline points={points} label="Activity" />);
  const el = screen.getByRole('img');
  expect(el.getAttribute('aria-label')).toMatch(/7 revisions/);
});

it('emphasises the final point', () => {
  const { container } = render(<Sparkline points={points} label="Activity" />);
  expect(container.querySelectorAll('[data-endpoint="true"]')).toHaveLength(1);
});

it('renders one bar per point', () => {
  const { container } = render(<Sparkline points={points} label="Activity" />);
  expect(container.querySelectorAll('[data-bar]')).toHaveLength(3);
});

it('survives an all-zero series without dividing by zero', () => {
  const { container } = render(
    <Sparkline points={[{ day: 'a', revisions: 0 }, { day: 'b', revisions: 0 }]} label="Activity" />,
  );
  expect(container.querySelectorAll('[data-bar]')).toHaveLength(2);
});

it('renders nothing for an empty series', () => {
  const { container } = render(<Sparkline points={[]} label="Activity" />);
  expect(container.querySelector('[data-bar]')).toBeNull();
});
