import { it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useStore } from '@/store/useStore';
import { PlanSubjectDialog } from './PlanSubjectDialog';

let subjectId: string;
let newTopicId: string;
let plannedTopicId: string;

beforeEach(() => {
  useStore.setState({ subjects: {}, chapters: {}, topics: {}, subjectOrder: [], tags: {}, tagOrder: [] });
  subjectId = useStore.getState().addSubject('S');
  const c = useStore.getState().addChapter(subjectId, 'C');
  newTopicId = useStore.getState().addTopic(c, 'Fresh topic');
  plannedTopicId = useStore.getState().addTopic(c, 'Already planned');
  useStore.getState().planTopic(plannedTopicId, Date.now() + 86_400_000);
});

it('defaults unplanned/never-revised topics checked and plans them on confirm', () => {
  render(<PlanSubjectDialog subjectId={subjectId} onClose={vi.fn()} />);
  expect(screen.getByRole('checkbox', { name: 'Fresh topic' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Already planned' })).not.toBeChecked();
  const date = new Date(); date.setDate(date.getDate() + 2);
  const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  fireEvent.change(screen.getByLabelText('Revision date'), { target: { value: iso } });
  fireEvent.click(screen.getByRole('button', { name: /plan 1 topic/i }));
  date.setHours(0, 0, 0, 0);
  expect(useStore.getState().topics[newTopicId].plannedAt).toBe(date.getTime());
});

it('confirm plans every checked topic, leaving unchecked ones alone', () => {
  render(<PlanSubjectDialog subjectId={subjectId} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Already planned' }));
  fireEvent.click(screen.getByRole('button', { name: /plan 2 topics/i }));
  const state = useStore.getState();
  expect(state.topics[newTopicId].plannedAt).toBeDefined();
  expect(state.topics[newTopicId].plannedAt).toBe(state.topics[plannedTopicId].plannedAt);
});
