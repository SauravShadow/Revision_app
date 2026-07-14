import { it, expect, beforeEach } from 'vitest';
import { useFilters } from './useFilters';

beforeEach(() => useFilters.getState().clear());

it('toggles tags and statuses and clears', () => {
  useFilters.getState().toggleTag('a');
  useFilters.getState().toggleStatus('has-attachments');
  expect(useFilters.getState().tagIds).toEqual(['a']);
  expect(useFilters.getState().statuses).toEqual(['has-attachments']);
  useFilters.getState().toggleTag('a'); // off
  expect(useFilters.getState().tagIds).toEqual([]);
  useFilters.getState().clear();
  expect(useFilters.getState().statuses).toEqual([]);
});
