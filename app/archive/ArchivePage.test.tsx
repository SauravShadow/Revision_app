import { it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ArchivePage from './page';
import { useStore } from '@/store/useStore';

beforeEach(() => useStore.setState({ subjects: {}, chapters: {}, topics: {}, subjectOrder: [] }));

it('lists archived items and shows an empty state otherwise', () => {
  const s = useStore.getState().addSubject('Archived Subject');
  useStore.getState().archiveSubject(s);
  render(<ArchivePage />);
  expect(screen.getByText('Archived Subject')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /restore/i })).toBeInTheDocument();
});
