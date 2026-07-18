import { it, expect, describe } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CountBadge } from './CountBadge';

describe('CountBadge', () => {
  it('shows the count with an accessible label', () => {
    render(<CountBadge count={7} label="7 due" />);
    const el = screen.getByText('7');
    expect(el).toBeInTheDocument();
    expect(screen.getByLabelText('7 due')).toBeInTheDocument();
  });

  it('still renders when zero', () => {
    render(<CountBadge count={0} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});
