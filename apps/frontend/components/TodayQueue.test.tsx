import { it, expect, beforeEach, describe } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { useStore } from '@/store/useStore';
import { TodayQueue } from './TodayQueue';

const DAY = 86_400_000;

function seedOverdueTopic(): string {
  useStore.setState({ subjects: {}, chapters: {}, topics: {}, subjectOrder: [] });
  const s = useStore.getState().addSubject('Structures');
  const c = useStore.getState().addChapter(s, 'Beams');
  const t = useStore.getState().addTopic(c, 'Bending');
  useStore.setState((st) => ({
    topics: { ...st.topics, [t]: { ...st.topics[t], revisionHistory: [{ id: 'r', timestamp: Date.now() - 3 * DAY }] } },
  }));
  return t;
}

describe('TodayQueue', () => {
  beforeEach(() => seedOverdueTopic());

  it('lists an overdue topic with its context and badge', () => {
    render(<TodayQueue />);
    expect(screen.getByText('Bending')).toBeInTheDocument();
    expect(screen.getByText(/Structures · Beams/)).toBeInTheDocument();
    expect(screen.getByText('OVERDUE')).toBeInTheDocument();
  });

  it('marking a topic revised removes it from the queue', async () => {
    render(<TodayQueue />);
    act(() => screen.getByRole('button', { name: /Mark Bending revised/i }).click());
    await waitFor(() => expect(screen.queryByText('Bending')).not.toBeInTheDocument());
  });
});
