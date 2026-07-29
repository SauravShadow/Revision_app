import { it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CalendarPage from './page';
import { useStore } from '@/store/useStore';

beforeEach(() => useStore.setState({ subjects: {}, chapters: {}, topics: {}, subjectOrder: [], tags: {}, tagOrder: [] }));

it('defaults to the agenda view', () => {
  render(<CalendarPage />);
  expect(screen.getByRole('button', { name: 'Agenda' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Month' })).toHaveAttribute('aria-pressed', 'false');
});

it('shows a due topic in the default agenda view', () => {
  const s = useStore.getState().addSubject('S');
  const c = useStore.getState().addChapter(s, 'C');
  const t = useStore.getState().addTopic(c, 'Bernoulli');
  useStore.getState().markTopicRevised(t);
  useStore.getState().planTopic(t, Date.now() + 86_400_000); // planned tomorrow -> appears in the agenda horizon
  render(<CalendarPage />);
  expect(screen.getByText('Bernoulli')).toBeInTheDocument();
});

it('renders the current month heading in the month view', async () => {
  render(<CalendarPage />);
  await userEvent.click(screen.getByRole('button', { name: 'Month' }));
  const monthName = new Date().toLocaleString('en-US', { month: 'long' });
  expect(screen.getAllByText(new RegExp(monthName, 'i')).length).toBeGreaterThan(0);
});

it('keeps a day panel visible after navigating to another month (re-anchors selection)', async () => {
  render(<CalendarPage />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Month' }));
  // Jump two months ahead so the originally-selected "today" is not in the visible grid.
  await user.click(screen.getByLabelText('Next month'));
  await user.click(screen.getByLabelText('Next month'));
  expect(screen.getByText(/nothing scheduled or completed on this day/i)).toBeInTheDocument();
});
