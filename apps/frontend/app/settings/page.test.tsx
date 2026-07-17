import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({
  getEmailStatus: vi.fn(),
  updateEmail: vi.fn(),
  useAuth: vi.fn(),
  fetchMemberships: vi.fn(),
}));
vi.mock('@/lib/auth/client', () => ({
  getEmailStatus: mocks.getEmailStatus,
  updateEmail: mocks.updateEmail,
}));
vi.mock('@/components/AuthProvider', () => ({ useAuth: mocks.useAuth }));
// SettingsPage renders <OrganisationCard>, which calls fetchMemberships on
// mount; mock it here too so it doesn't reach the real (unmocked) authFetch.
vi.mock('@/lib/orgs/client', () => ({
  fetchMemberships: mocks.fetchMemberships,
  createOrganisation: vi.fn(),
  joinWithCode: vi.fn(),
  createGroup: vi.fn(),
  listGroups: vi.fn(),
  createInviteCode: vi.fn(),
  assignHead: vi.fn(),
  leaveGroup: vi.fn(),
}));

import SettingsPage from './page';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useAuth.mockReturnValue({ session: { userId: 'u1', username: 'oldtimer', domain: 'civil-engineering' }, loading: false });
  mocks.fetchMemberships.mockResolvedValue({ memberships: [] });
});

it('lets a grandfathered account submit an email for verification', async () => {
  mocks.getEmailStatus.mockResolvedValue({ email: null, verified: false });
  mocks.updateEmail.mockResolvedValue({ message: 'Verification email sent — check your inbox.' });
  render(<SettingsPage />);
  await waitFor(() => expect(screen.getByText('No email on this account')).toBeInTheDocument());

  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email'), 'late@example.com');
  await user.click(screen.getByRole('button', { name: /send verification/i }));
  await waitFor(() => expect(screen.getByText('Verification email sent — check your inbox.')).toBeInTheDocument());
  expect(mocks.updateEmail).toHaveBeenCalledWith('late@example.com');
});

it('shows verified status without the form', async () => {
  mocks.getEmailStatus.mockResolvedValue({ email: 'done@example.com', verified: true });
  render(<SettingsPage />);
  // The status line interpolates several values into one <p>, so match the
  // paragraph's full text with a regex rather than an exact string.
  await waitFor(() => expect(screen.getByText(/done@example\.com — Verified/)).toBeInTheDocument());
  expect(screen.queryByRole('button', { name: /send verification/i })).toBeNull();
});
