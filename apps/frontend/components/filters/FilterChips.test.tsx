import { it, expect, vi, describe } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FilterChips } from './FilterChips';

const options = [
  { key: 'all', label: 'All', count: 5 },
  { key: 'overdue', label: 'Overdue', count: 2 },
  { key: 'due', label: 'Due', count: 0 },
];

describe('FilterChips', () => {
  it('renders each option with its live count and marks the active chip', () => {
    render(<FilterChips options={options} value="overdue" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /All 5/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /Overdue 2/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Due 0/ })).toBeInTheDocument();
  });

  it('calls onChange with the chosen key', () => {
    const onChange = vi.fn();
    render(<FilterChips options={options} value="all" onChange={onChange} />);
    screen.getByRole('button', { name: /Overdue 2/ }).click();
    expect(onChange).toHaveBeenCalledWith('overdue');
  });
});
