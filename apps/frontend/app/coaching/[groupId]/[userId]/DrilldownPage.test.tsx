import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useParams: vi.fn(),
  fetchStudentDrilldown: vi.fn(),
}));
vi.mock('@/components/AuthProvider', () => ({ useAuth: mocks.useAuth }));
vi.mock('next/navigation', () => ({ useParams: mocks.useParams }));
vi.mock('@/lib/orgs/client', () => ({ fetchStudentDrilldown: mocks.fetchStudentDrilldown }));

import DrilldownPage from './page';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useAuth.mockReturnValue({ session: { userId: 'coach', username: 'coach', domain: 'civil-engineering' }, loading: false });
  mocks.useParams.mockReturnValue({ groupId: 'g1', userId: 'u1' });
});

it('renders the student topic tree with badge states', async () => {
  mocks.fetchStudentDrilldown.mockResolvedValue({
    userId: 'u1', username: 'sharma',
    activity: [{ day: '2026-07-15', revisions: 3 }],
    subjects: [{
      id: 's1', name: 'Soil Mechanics',
      chapters: [{ id: 'c1', name: 'Bearing Capacity', topics: [
        { id: 't1', title: 'Terzaghi theory', state: 'Overdue', revisionCount: 2, lastRevisedAt: 1, nextDueAt: 2 },
      ] }],
    }],
  });
  render(<DrilldownPage />);
  expect(await screen.findByText('sharma')).toBeInTheDocument();
  expect(screen.getByText('Soil Mechanics')).toBeInTheDocument();
  expect(screen.getByText('Terzaghi theory')).toBeInTheDocument();
  expect(screen.getByText('Overdue')).toBeInTheDocument();
});

it('shows the API error when access is denied', async () => {
  mocks.fetchStudentDrilldown.mockResolvedValue({ error: 'You are not a head of this group' });
  render(<DrilldownPage />);
  expect(await screen.findByText('You are not a head of this group')).toBeInTheDocument();
});
