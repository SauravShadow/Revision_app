import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { StoreHydrator } from './StoreHydrator';
import { useStore } from '@/store/useStore';

let mockAuth: { session: { userId: string; username: string; domain: string } | null; loading: boolean; setSession: () => void };

vi.mock('@/components/AuthProvider', () => ({
  useAuth: () => mockAuth,
}));

beforeEach(() => {
  mockAuth = { session: null, loading: false, setSession: () => {} };
  useStore.setState({ subjects: {}, chapters: {}, topics: {}, subjectOrder: [] });
});

it('renders children immediately when there is no session (auth resolved, unauthenticated)', () => {
  mockAuth = { session: null, loading: false, setSession: () => {} };
  render(<StoreHydrator><div data-testid="child">content</div></StoreHydrator>);
  expect(screen.getByTestId('child')).toBeInTheDocument();
  expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
});

it('renders children immediately while auth is still resolving', () => {
  mockAuth = { session: null, loading: true, setSession: () => {} };
  render(<StoreHydrator><div data-testid="child">content</div></StoreHydrator>);
  expect(screen.getByTestId('child')).toBeInTheDocument();
  expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
});

it('hydrates and renders children once data is ready for a logged-in session', async () => {
  mockAuth = { session: { userId: 'u1', username: 'alice', domain: 'civil-engineering' }, loading: false, setSession: () => {} };
  render(<StoreHydrator><div data-testid="child">content</div></StoreHydrator>);
  await waitFor(() => expect(screen.getByTestId('child')).toBeInTheDocument());
});

it('re-hydrates when the logged-in user changes (account switch in the same tab)', async () => {
  const realHydrate = useStore.getState().hydrate;
  const hydrate = vi.fn(() => Promise.resolve());
  useStore.setState({ hydrate });
  try {
    // First account: a civil-engineering user.
    mockAuth = { session: { userId: 'u1', username: 'alice', domain: 'civil-engineering' }, loading: false, setSession: () => {} };
    const { rerender } = render(<StoreHydrator><div data-testid="child">content</div></StoreHydrator>);
    await waitFor(() => expect(hydrate).toHaveBeenCalledWith('civil-engineering'));

    // Switch to a second account with a different domain. The root layout (and
    // thus StoreHydrator) never unmounts across login/logout, so the store must
    // re-hydrate for the new user rather than keep the first account's data.
    mockAuth = { session: { userId: 'u2', username: 'saurav', domain: 'software-engineering' }, loading: false, setSession: () => {} };
    rerender(<StoreHydrator><div data-testid="child">content</div></StoreHydrator>);
    await waitFor(() => expect(hydrate).toHaveBeenCalledWith('software-engineering'));
    expect(hydrate).toHaveBeenCalledTimes(2);
  } finally {
    useStore.setState({ hydrate: realHydrate });
  }
});
