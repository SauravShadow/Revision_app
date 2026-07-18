import { it, expect, beforeEach } from 'vitest';
import { useQuickFilter } from './useQuickFilter';

beforeEach(() => useQuickFilter.getState().reset());

it('defaults every list to "all"', () => {
  expect(useQuickFilter.getState().get('home')).toBe('all');
  expect(useQuickFilter.getState().get('chapter:c1')).toBe('all');
});

it('remembers a selection per list key, independently', () => {
  useQuickFilter.getState().set('home', 'overdue');
  useQuickFilter.getState().set('chapter:c1', 'bookmarked');
  expect(useQuickFilter.getState().get('home')).toBe('overdue');
  expect(useQuickFilter.getState().get('chapter:c1')).toBe('bookmarked');
  expect(useQuickFilter.getState().get('chapter:c2')).toBe('all');
});
