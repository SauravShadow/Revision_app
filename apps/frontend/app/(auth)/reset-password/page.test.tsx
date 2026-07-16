import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({
  resetPassword: vi.fn(),
  searchParams: new URLSearchParams('token=tok123'),
}));
vi.mock('@/lib/auth/client', () => ({ resetPassword: mocks.resetPassword }));
vi.mock('next/navigation', () => ({ useSearchParams: () => mocks.searchParams }));

import ResetPasswordPage from './page';

beforeEach(() => vi.clearAllMocks());

it('submits matching passwords and shows success with a sign-in link', async () => {
  mocks.resetPassword.mockResolvedValue({ message: 'Password updated — you can now sign in.' });
  render(<ResetPasswordPage />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('New password'), 'newpassword1');
  await user.type(screen.getByLabelText('Confirm new password'), 'newpassword1');
  await user.click(screen.getByRole('button', { name: /reset password/i }));
  await waitFor(() => expect(screen.getByText('Password updated — you can now sign in.')).toBeInTheDocument());
  expect(mocks.resetPassword).toHaveBeenCalledWith('tok123', 'newpassword1');
  expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login');
});

it('blocks mismatched passwords client-side', async () => {
  render(<ResetPasswordPage />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('New password'), 'newpassword1');
  await user.type(screen.getByLabelText('Confirm new password'), 'different1');
  await user.click(screen.getByRole('button', { name: /reset password/i }));
  expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
  expect(mocks.resetPassword).not.toHaveBeenCalled();
});
