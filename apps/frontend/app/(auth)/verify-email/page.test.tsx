import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  verifyEmail: vi.fn(),
  resendVerification: vi.fn(),
  searchParams: new URLSearchParams('token=abc123'),
}));
vi.mock('@/lib/auth/client', () => ({
  verifyEmail: mocks.verifyEmail,
  resendVerification: mocks.resendVerification,
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => mocks.searchParams,
}));

import VerifyEmailPage from './page';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.searchParams = new URLSearchParams('token=abc123');
});

it('verifies the token from the URL and shows success with a sign-in link', async () => {
  mocks.verifyEmail.mockResolvedValue({ message: 'Email verified — you can now sign in.' });
  render(<VerifyEmailPage />);
  await waitFor(() => expect(screen.getByText('Email verified — you can now sign in.')).toBeInTheDocument());
  expect(mocks.verifyEmail).toHaveBeenCalledWith('abc123');
  expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login');
});

it('shows the error state with a resend form for an expired token', async () => {
  mocks.verifyEmail.mockResolvedValue({ error: 'This link is invalid or has expired.' });
  render(<VerifyEmailPage />);
  await waitFor(() => expect(screen.getByText('This link is invalid or has expired.')).toBeInTheDocument());
  expect(screen.getByLabelText('Username or email')).toBeInTheDocument();
});
