import { it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import CalendarPage from './page';
import { useStore } from '@/store/useStore';

beforeEach(() => useStore.setState({ subjects: {}, chapters: {}, topics: {}, subjectOrder: [], tags: {}, tagOrder: [] }));

it('renders the current month heading', () => {
  render(<CalendarPage />);
  const monthName = new Date().toLocaleString('en-US', { month: 'long' });
  expect(screen.getAllByText(new RegExp(monthName, 'i')).length).toBeGreaterThan(0);
});

it('lists a topic revised today under the default-selected today cell', () => {
  const s = useStore.getState().addSubject('S');
  const c = useStore.getState().addChapter(s, 'C');
  const t = useStore.getState().addTopic(c, 'Bernoulli');
  useStore.getState().markTopicRevised(t); // recorded now -> completed today
  render(<CalendarPage />);
  expect(screen.getByText('Bernoulli')).toBeInTheDocument();
});
