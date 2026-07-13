import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { StoreHydrator } from './StoreHydrator';
import { useStore } from '@/store/useStore';

let mockAuth: { session: { userId: string; username: string; domain: string } | null; loading: boolean };

vi.mock('@/components/AuthProvider', () => ({
  useAuth: () => mockAuth,
}));

beforeEach(() => {
  mockAuth = { session: null, loading: false };
  useStore.setState({ subjects: {}, chapters: {}, topics: {}, subjectOrder: [] });
});

it('renders children immediately when there is no session (auth resolved, unauthenticated)', () => {
  mockAuth = { session: null, loading: false };
  render(<StoreHydrator><div data-testid="child">content</div></StoreHydrator>);
  expect(screen.getByTestId('child')).toBeInTheDocument();
  expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
});

it('renders children immediately while auth is still resolving', () => {
  mockAuth = { session: null, loading: true };
  render(<StoreHydrator><div data-testid="child">content</div></StoreHydrator>);
  expect(screen.getByTestId('child')).toBeInTheDocument();
  expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
});

it('hydrates and renders children once data is ready for a logged-in session', async () => {
  mockAuth = { session: { userId: 'u1', username: 'alice', domain: 'civil-engineering' }, loading: false };
  render(<StoreHydrator><div data-testid="child">content</div></StoreHydrator>);
  await waitFor(() => expect(screen.getByTestId('child')).toBeInTheDocument());
});
