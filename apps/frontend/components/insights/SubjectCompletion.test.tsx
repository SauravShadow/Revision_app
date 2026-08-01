import { it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SubjectCompletion } from './SubjectCompletion';
import { useStore } from '@/store/useStore';

it('subject rows carry the touch-target hit-area floor', () => {
  useStore.setState({ subjects: {}, chapters: {}, topics: {}, subjectOrder: [] });
  useStore.getState().addSubject('Hydrology');
  const data = useStore.getState();
  render(<SubjectCompletion data={data} now={Date.now()} />);
  expect(screen.getByRole('link', { name: /Hydrology/ }).className).toContain('touch-target');
});
