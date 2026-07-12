import { it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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

it('adds a flashcard which then appears', async () => {
  const { rerender } = render(<FlashcardsPanel topic={useStore.getState().topics[topicId]} />);
  await userEvent.type(screen.getByPlaceholderText(/front/i), 'What is 2+2?');
  await userEvent.type(screen.getByPlaceholderText(/back/i), '4');
  await userEvent.click(screen.getByRole('button', { name: /add card/i }));
  rerender(<FlashcardsPanel topic={useStore.getState().topics[topicId]} />);
  expect(screen.getByText('What is 2+2?')).toBeInTheDocument();
});
