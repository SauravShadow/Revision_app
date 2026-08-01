import { it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

it('delete button removes a revision after confirm', () => {
  const s = useStore.getState().addSubject('S');
  const c = useStore.getState().addChapter(s, 'C');
  const t = useStore.getState().addTopic(c, 'T');
  useStore.getState().markTopicRevised(t);
  useStore.getState().markTopicRevised(t);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  render(<RevisionHistoryPanel topic={useStore.getState().topics[t]} />);
  fireEvent.click(screen.getAllByLabelText('Delete revision')[0]);
  expect(useStore.getState().topics[t].revisionHistory).toHaveLength(1);
  vi.restoreAllMocks();
});

it('confirm=false leaves history untouched', () => {
  const s = useStore.getState().addSubject('S');
  const c = useStore.getState().addChapter(s, 'C');
  const t = useStore.getState().addTopic(c, 'T');
  useStore.getState().markTopicRevised(t);
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  render(<RevisionHistoryPanel topic={useStore.getState().topics[t]} />);
  fireEvent.click(screen.getByLabelText('Delete revision'));
  expect(useStore.getState().topics[t].revisionHistory).toHaveLength(1);
  vi.restoreAllMocks();
});

it('editing a timestamp commits through the store', () => {
  const s = useStore.getState().addSubject('S');
  const c = useStore.getState().addChapter(s, 'C');
  const t = useStore.getState().addTopic(c, 'T');
  useStore.getState().markTopicRevised(t);
  render(<RevisionHistoryPanel topic={useStore.getState().topics[t]} />);
  fireEvent.click(screen.getByLabelText('Edit revision time'));
  const input = screen.getByLabelText('Revision timestamp');
  fireEvent.change(input, { target: { value: '2026-07-10T09:30' } });
  fireEvent.blur(input);
  const ts = useStore.getState().topics[t].revisionHistory[0].timestamp;
  expect(new Date(ts).getFullYear()).toBe(2026);
  expect(new Date(ts).getMonth()).toBe(6); // July (0-indexed), local time
});

it('row actions are always visible on touch, not hover-gated', () => {
  const s = useStore.getState().addSubject('S');
  const c = useStore.getState().addChapter(s, 'C');
  const t = useStore.getState().addTopic(c, 'T');
  useStore.getState().markTopicRevised(t);
  render(<RevisionHistoryPanel topic={useStore.getState().topics[t]} />);
  const edit = screen.getAllByLabelText('Edit revision time')[0];
  // opacity-0 + group-hover:opacity-100 makes the control unreachable on a
  // device with no hover. It must be visible by default and merely dim, with
  // the hover reveal kept for desktop only (md:).
  expect(edit.className).not.toMatch(/(^|\s)opacity-0(\s|$)/);
  expect(edit.className).toContain('touch-target');
});
