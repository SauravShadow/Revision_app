import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  fetchMemberships: vi.fn(),
  listGroups: vi.fn(),
  fetchCohortSummary: vi.fn(),
  fetchCohortStudents: vi.fn(),
}));
vi.mock('@/components/AuthProvider', () => ({ useAuth: mocks.useAuth }));
vi.mock('@/lib/orgs/client', () => ({
  fetchMemberships: mocks.fetchMemberships,
  listGroups: mocks.listGroups,
  fetchCohortSummary: mocks.fetchCohortSummary,
  fetchCohortStudents: mocks.fetchCohortStudents,
}));

import CoachingPage from './page';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useAuth.mockReturnValue({ session: { userId: 'coach', username: 'coach', domain: 'civil-engineering' }, loading: false });
  mocks.fetchMemberships.mockResolvedValue({
    memberships: [{ orgId: 'o1', orgName: 'XYZ', groupId: 'g1', groupName: 'Batch A', role: 'head' }],
  });
  mocks.fetchCohortSummary.mockResolvedValue({
    group: { id: 'g1', name: 'Batch A', orgName: 'XYZ' },
    totals: { members: 2, completionPct: 68, dueToday: 12, overdue: 5 },
    activity: [{ day: '2026-07-15', revisions: 9 }],
  });
  mocks.fetchCohortStudents.mockResolvedValue({
    page: 1, pageSize: 50, totalMembers: 2,
    students: [
      { userId: 'u1', username: 'sharma', hasData: true, totalTopics: 100, completedTopics: 82, completionPct: 82, streakDays: 12, dueToday: 1, overdue: 0, subjectCoverage: [{ subject: 'Soil', total: 50, revised: 41 }] },
      { userId: 'u2', username: 'nair', hasData: false, totalTopics: 0, completedTopics: 0, completionPct: 0, streakDays: 0, dueToday: 0, overdue: 0, subjectCoverage: [] },
    ],
  });
});

it('renders rollup tiles, the student table, and a no-data row', async () => {
  render(<CoachingPage />);
  await waitFor(() => expect(mocks.fetchCohortSummary).toHaveBeenCalledWith('g1'));
  expect(await screen.findByText('68%')).toBeInTheDocument();   // completion tile
  expect(screen.getByText('12')).toBeInTheDocument();           // due today tile
  expect(screen.getByText('sharma')).toBeInTheDocument();
  expect(screen.getByText('No data yet')).toBeInTheDocument();  // u2 row
});

it('shows a friendly message for non-coaches', async () => {
  mocks.fetchMemberships.mockResolvedValue({ memberships: [] });
  render(<CoachingPage />);
  expect(await screen.findByText(/You are not a head of any group/)).toBeInTheDocument();
});
