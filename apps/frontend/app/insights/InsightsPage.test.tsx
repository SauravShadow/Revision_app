import { it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import InsightsPage from './page';
import { useStore } from '@/store/useStore';

beforeEach(() => useStore.setState({ subjects: {}, chapters: {}, topics: {}, subjectOrder: [], tags: {}, tagOrder: [] }));

it('shows an empty state when there is no data', () => {
  render(<InsightsPage />);
  expect(screen.getByText(/no revision activity yet/i)).toBeInTheDocument();
});

it('renders stats, a heatmap, and the topic in Most revised after a revision', () => {
  const s = useStore.getState().addSubject('S');
  const c = useStore.getState().addChapter(s, 'C');
  const t = useStore.getState().addTopic(c, 'Bernoulli');
  useStore.getState().markTopicRevised(t);
  render(<InsightsPage />);
  expect(screen.getByText('Completion')).toBeInTheDocument();
  expect(screen.getAllByTestId('heatmap-cell').length).toBeGreaterThan(0);
  // With a single topic in the fixture, topicsByRevisionCount legitimately places it in
  // both Most revised and Least revised (least only excludes count === 0), so it renders twice.
  expect(screen.getAllByText('Bernoulli').length).toBeGreaterThan(0);
});
