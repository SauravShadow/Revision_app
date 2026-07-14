import { it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import BookmarksPage from './page';
import { useStore } from '@/store/useStore';

beforeEach(() => useStore.setState({ subjects: {}, chapters: {}, topics: {}, subjectOrder: [] }));

it('lists bookmarked topics and shows an empty state otherwise', () => {
  const s = useStore.getState().addSubject('S');
  const c = useStore.getState().addChapter(s, 'C');
  const t = useStore.getState().addTopic(c, 'Bernoulli');
  useStore.getState().toggleBookmark(t);
  render(<BookmarksPage />);
  expect(screen.getByText('Bernoulli')).toBeInTheDocument();
});
