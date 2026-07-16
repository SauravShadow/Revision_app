import { it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

it('keeps a day panel visible after navigating to another month (re-anchors selection)', async () => {
  render(<CalendarPage />);
  // Jump two months ahead so the originally-selected "today" is not in the visible grid.
  await userEvent.click(screen.getByLabelText('Next month'));
  await userEvent.click(screen.getByLabelText('Next month'));
  // The selected-day panel must still render (re-anchored to a day in the viewed month),
  // showing the empty-day message rather than silently disappearing.
  expect(screen.getByText(/nothing scheduled or completed on this day/i)).toBeInTheDocument();
});
