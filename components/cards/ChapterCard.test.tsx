import { it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChapterCard } from './ChapterCard';
import { useStore } from '@/store/useStore';

beforeEach(() => useStore.setState({ subjects: {}, chapters: {}, topics: {}, subjectOrder: [] }));

it('renders chapter name and topic count', () => {
  const s = useStore.getState().addSubject('S');
  const c = useStore.getState().addChapter(s, 'Flow through Pipes');
  useStore.getState().addTopic(c, 'Bernoulli');
  render(<ChapterCard chapter={useStore.getState().chapters[c]} />);
  expect(screen.getByText('Flow through Pipes')).toBeInTheDocument();
  expect(screen.getByText(/1 topic/)).toBeInTheDocument();
});
