import { it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useStore } from '@/store/useStore';
import { PlanNextDialog } from './PlanNextDialog';

let topicId: string;

beforeEach(() => {
  useStore.setState({ subjects: {}, chapters: {}, topics: {}, subjectOrder: [], tags: {}, tagOrder: [] });
  const s = useStore.getState().addSubject('S');
  const c = useStore.getState().addChapter(s, 'C');
  topicId = useStore.getState().addTopic(c, 'Bernoulli');
});

it('planning +1d stamps tomorrow start-of-day and closes', () => {
  const onClose = vi.fn();
  render(<PlanNextDialog topicId={topicId} onClose={onClose} />);
  fireEvent.click(screen.getByRole('button', { name: '+1d' }));
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(0, 0, 0, 0);
  expect(useStore.getState().topics[topicId].plannedAt).toBe(tomorrow.getTime());
  expect(onClose).toHaveBeenCalled();
});

it('skip leaves the topic unplanned', () => {
  const onClose = vi.fn();
  render(<PlanNextDialog topicId={topicId} onClose={onClose} />);
  fireEvent.click(screen.getByRole('button', { name: /skip/i }));
  expect(useStore.getState().topics[topicId].plannedAt ?? null).toBeNull();
  expect(onClose).toHaveBeenCalled();
});

it('highlights the ladder suggestion after a revision', () => {
  useStore.getState().markTopicRevised(topicId);
  render(<PlanNextDialog topicId={topicId} onClose={vi.fn()} />);
  const suggested = screen.getByRole('button', { name: /^Suggested ·/ });
  fireEvent.click(suggested);
  // 1 revision -> ladder +1 day from the revision timestamp
  expect(useStore.getState().topics[topicId].plannedAt).toBeGreaterThan(Date.now() - 1);
});
