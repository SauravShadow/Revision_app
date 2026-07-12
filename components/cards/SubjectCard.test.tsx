import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SubjectCard } from './SubjectCard';
import { useStore } from '@/store/useStore';

beforeEach(() => {
  useStore.setState({ subjects: {}, chapters: {}, topics: {}, subjectOrder: [] });
});

it('renders the subject name and a progress value', () => {
  const id = useStore.getState().addSubject('Fluid Mechanics');
  render(<SubjectCard subject={useStore.getState().subjects[id]} />);
  expect(screen.getByText('Fluid Mechanics')).toBeInTheDocument();
  expect(screen.getByText(/%/)).toBeInTheDocument();
});
