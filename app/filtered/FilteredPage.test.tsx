import { it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import FilteredPage from './page';
import { useStore } from '@/store/useStore';
import { useFilters } from '@/store/useFilters';

beforeEach(() => {
  useStore.setState({ subjects: {}, chapters: {}, topics: {}, subjectOrder: [], tags: {}, tagOrder: [] });
  useFilters.getState().clear();
});

it('lists topics matching an active status filter', () => {
  const s = useStore.getState().addSubject('S');
  const c = useStore.getState().addChapter(s, 'C');
  const t = useStore.getState().addTopic(c, 'Bernoulli');
  useStore.getState().toggleBookmark(t);
  useFilters.getState().toggleStatus('bookmarked');
  render(<FilteredPage />);
  expect(screen.getByText('Bernoulli')).toBeInTheDocument();
});
