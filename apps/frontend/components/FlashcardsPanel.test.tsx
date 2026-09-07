import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FlashcardsPanel } from './FlashcardsPanel';
import { useStore } from '@/store/useStore';

let topicId = '';
beforeEach(() => {
  useStore.setState({ subjects: {}, chapters: {}, topics: {}, subjectOrder: [] });
  const s = useStore.getState().addSubject('S');
  const c = useStore.getState().addChapter(s, 'C');
  topicId = useStore.getState().addTopic(c, 'T');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('adds a flashcard which then appears', async () => {
  const { rerender } = render(<FlashcardsPanel topic={useStore.getState().topics[topicId]} />);
  await userEvent.type(screen.getByPlaceholderText(/front/i), 'What is 2+2?');
  await userEvent.type(screen.getByPlaceholderText(/back/i), '4');
  await userEvent.click(screen.getByRole('button', { name: /add card/i }));
  rerender(<FlashcardsPanel topic={useStore.getState().topics[topicId]} />);
  expect(screen.getByText('What is 2+2?')).toBeInTheDocument();
});

it('shows generated cards for review and saves only the kept ones', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({
      usageId: 1,
      cards: [{ front: 'Q1', back: 'A1' }, { front: 'Q2', back: 'A2' }],
    }), { status: 200 }),
  );
  useStore.getState().updateTopicNotes(topicId, 'Some notes');

  const { rerender } = render(<FlashcardsPanel topic={useStore.getState().topics[topicId]} />);
  fireEvent.click(screen.getByRole('button', { name: /generate/i }));

  await waitFor(() => expect(screen.getByText('Q1')).toBeInTheDocument());
  fireEvent.click(screen.getByLabelText('Discard Q2'));
  fireEvent.click(screen.getByRole('button', { name: /save 1 card/i }));

  await waitFor(() => {
    rerender(<FlashcardsPanel topic={useStore.getState().topics[topicId]} />);
    expect(useStore.getState().topics[topicId].flashcards).toHaveLength(1);
  });
  const saved = useStore.getState().topics[topicId].flashcards ?? [];
  expect(saved[0]).toMatchObject({ front: 'Q1', back: 'A1', source: 'generated' });
  expect(saved.some((c) => c.front === 'Q2')).toBe(false);
});

it('surfaces a quota message without saving anything', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ error: "You've used today's 10 generations — resets at midnight UTC." }), { status: 429 }),
  );
  useStore.getState().updateTopicNotes(topicId, 'Some notes');

  render(<FlashcardsPanel topic={useStore.getState().topics[topicId]} />);
  fireEvent.click(screen.getByRole('button', { name: /generate/i }));

  await waitFor(() => expect(screen.getByText(/used today's 10 generations/i)).toBeInTheDocument());
  expect(useStore.getState().topics[topicId].flashcards ?? []).toHaveLength(0);
});

it('disables Generate until the topic has notes', () => {
  render(<FlashcardsPanel topic={useStore.getState().topics[topicId]} />);
  expect(screen.getByRole('button', { name: /generate/i })).toBeDisabled();
});
