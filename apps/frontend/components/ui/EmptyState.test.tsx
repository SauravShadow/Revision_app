import { it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from './EmptyState';

it('shows the title and optional hint', () => {
  render(<EmptyState title="No topics match" hint="Try clearing a filter." />);
  expect(screen.getByText('No topics match')).toBeInTheDocument();
  expect(screen.getByText('Try clearing a filter.')).toBeInTheDocument();
});

it('renders without a hint', () => {
  render(<EmptyState title="Nothing here" />);
  expect(screen.getByText('Nothing here')).toBeInTheDocument();
});
