import { it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RevisionBadge } from './RevisionBadge';

it('renders human-readable labels for each state', () => {
  render(<RevisionBadge state="Overdue" />);
  expect(screen.getByText('Overdue')).toBeInTheDocument();
  render(<RevisionBadge state="DueToday" />);
  expect(screen.getByText('Due Today')).toBeInTheDocument();
});
