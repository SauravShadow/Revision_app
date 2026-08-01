import { it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StreakCard } from './StreakCard';
import { useStore } from '@/store/useStore';

beforeEach(() => useStore.setState({ subjects: {}, chapters: {}, topics: {}, subjectOrder: [], hydrated: true }));

it('renders nothing at a zero streak — a "0 day streak" badge is a reprimand', () => {
  const { container } = render(<StreakCard />);
  expect(container.firstChild).toBeNull();
});

it('shows the current streak once a topic has been revised today', () => {
  const s = useStore.getState().addSubject('S');
  const c = useStore.getState().addChapter(s, 'C');
  const t = useStore.getState().addTopic(c, 'T');
  useStore.getState().markTopicRevised(t);
  render(<StreakCard />);
  expect(screen.getByText('1')).toBeInTheDocument();
  expect(screen.getByText(/day in a row/)).toBeInTheDocument();
});
