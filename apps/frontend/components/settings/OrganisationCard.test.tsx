import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({
  fetchMemberships: vi.fn(),
  createOrganisation: vi.fn(),
  joinWithCode: vi.fn(),
  createGroup: vi.fn(),
  listGroups: vi.fn(),
  createInviteCode: vi.fn(),
  assignHead: vi.fn(),
  leaveGroup: vi.fn(),
  useAuth: vi.fn(),
}));
vi.mock('@/lib/orgs/client', () => ({
  fetchMemberships: mocks.fetchMemberships,
  createOrganisation: mocks.createOrganisation,
  joinWithCode: mocks.joinWithCode,
  createGroup: mocks.createGroup,
  listGroups: mocks.listGroups,
  createInviteCode: mocks.createInviteCode,
  assignHead: mocks.assignHead,
  leaveGroup: mocks.leaveGroup,
}));
vi.mock('@/components/AuthProvider', () => ({ useAuth: mocks.useAuth }));

import { OrganisationCard } from './OrganisationCard';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useAuth.mockReturnValue({ session: { userId: 'u1', username: 'alice', domain: 'civil-engineering' }, loading: false });
  mocks.listGroups.mockResolvedValue({ groups: [] });
});

it('lets a solo user join with a code', async () => {
  mocks.fetchMemberships.mockResolvedValue({ memberships: [] });
  mocks.joinWithCode.mockResolvedValue({ membership: { orgId: 'o1', orgName: 'XYZ', groupId: 'g1', groupName: 'Batch A', role: 'member' } });
  render(<OrganisationCard />);
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Join with code'), 'BATCHA-7F3K');
  await user.click(screen.getByRole('button', { name: 'Join' }));
  await waitFor(() => expect(mocks.joinWithCode).toHaveBeenCalledWith('BATCHA-7F3K'));
  expect(mocks.fetchMemberships).toHaveBeenCalledTimes(2); // mount + after join
});

it('shows memberships and a leave button for group rows', async () => {
  mocks.fetchMemberships.mockResolvedValue({
    memberships: [{ orgId: 'o1', orgName: 'XYZ', groupId: 'g1', groupName: 'Batch A', role: 'member' }],
  });
  mocks.leaveGroup.mockResolvedValue({ ok: true });
  render(<OrganisationCard />);
  expect(await screen.findByText(/XYZ \/ Batch A/)).toBeInTheDocument();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Leave' }));
  await waitFor(() => expect(mocks.leaveGroup).toHaveBeenCalledWith('g1', 'u1'));
});

it('shows the admin panel with invite-code generation for org admins', async () => {
  mocks.fetchMemberships.mockResolvedValue({
    memberships: [{ orgId: 'o1', orgName: 'XYZ', groupId: null, groupName: null, role: 'admin' }],
  });
  mocks.listGroups.mockResolvedValue({ groups: [{ id: 'g1', name: 'Batch A' }] });
  mocks.createInviteCode.mockResolvedValue({ code: 'BATCHA-7F3K' });
  render(<OrganisationCard />);
  expect(await screen.findByText('Batch A')).toBeInTheDocument();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'New invite code' }));
  expect(await screen.findByText('BATCHA-7F3K')).toBeInTheDocument();
});

it('surfaces join errors', async () => {
  mocks.fetchMemberships.mockResolvedValue({ memberships: [] });
  mocks.joinWithCode.mockResolvedValue({ error: 'Invalid or expired code' });
  render(<OrganisationCard />);
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Join with code'), 'BAD-CODE');
  await user.click(screen.getByRole('button', { name: 'Join' }));
  expect(await screen.findByText('Invalid or expired code')).toBeInTheDocument();
});
