import { it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TopicCard } from './TopicCard';
import { useStore } from '@/store/useStore';

beforeEach(() => useStore.setState({ subjects: {}, chapters: {}, topics: {}, subjectOrder: [], hydrated: true }));

function seedTopic() {
  const s = useStore.getState().addSubject('S');
  const c = useStore.getState().addChapter(s, 'C');
  return useStore.getState().addTopic(c, 'Bernoulli');
}

it('offers a one-tap revise action on the row', () => {
  const id = seedTopic();
  render(<TopicCard topic={useStore.getState().topics[id]} />);
  expect(screen.getByRole('button', { name: 'Mark revised' })).toBeInTheDocument();
});

it('marks the topic revised in place, without following the row link', () => {
  const id = seedTopic();
  render(<TopicCard topic={useStore.getState().topics[id]} />);
  expect(useStore.getState().topics[id].revisionHistory).toHaveLength(0);

  const evt = new MouseEvent('click', { bubbles: true, cancelable: true });
  fireEvent(screen.getByRole('button', { name: 'Mark revised' }), evt);

  expect(useStore.getState().topics[id].revisionHistory).toHaveLength(1);
  // The whole row is a Link; without preventDefault the tap would navigate away.
  expect(evt.defaultPrevented).toBe(true);
});
