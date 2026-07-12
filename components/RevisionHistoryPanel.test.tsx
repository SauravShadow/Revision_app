import { it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RevisionHistoryPanel } from './RevisionHistoryPanel';
import { useStore } from '@/store/useStore';

beforeEach(() => useStore.setState({ subjects: {}, chapters: {}, topics: {}, subjectOrder: [] }));

it('shows total revisions and one row per revision', () => {
  const s = useStore.getState().addSubject('S');
  const c = useStore.getState().addChapter(s, 'C');
  const t = useStore.getState().addTopic(c, 'T');
  useStore.getState().markTopicRevised(t);
  useStore.getState().markTopicRevised(t);
  render(<RevisionHistoryPanel topic={useStore.getState().topics[t]} />);
  expect(screen.getByText(/Total Revisions:\s*2/)).toBeInTheDocument();
  expect(screen.getByText('Revision 1')).toBeInTheDocument();
  expect(screen.getByText('Revision 2')).toBeInTheDocument();
});
