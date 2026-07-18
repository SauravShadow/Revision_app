import { it, expect, vi, describe, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { InlineSearch } from './InlineSearch';

describe('InlineSearch', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('debounces typing before emitting the query', () => {
    const onChange = vi.fn();
    render(<InlineSearch onChange={onChange} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'soil' } });
    expect(onChange).not.toHaveBeenCalledWith('soil');
    act(() => vi.advanceTimersByTime(200));
    expect(onChange).toHaveBeenCalledWith('soil');
  });

  it('clears immediately and emits an empty query', () => {
    const onChange = vi.fn();
    render(<InlineSearch onChange={onChange} />);
    const input = screen.getByRole('searchbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'x' } });
    act(() => vi.advanceTimersByTime(200));
    fireEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(input.value).toBe('');
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('focuses the field when "/" is pressed outside an input', () => {
    render(<InlineSearch onChange={() => {}} />);
    const input = screen.getByRole('searchbox');
    expect(input).not.toHaveFocus();
    act(() => fireEvent.keyDown(document, { key: '/' }));
    expect(input).toHaveFocus();
  });
});
