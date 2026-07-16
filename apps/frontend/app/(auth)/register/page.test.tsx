import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({
  register: vi.fn(),
  resendVerification: vi.fn(),
}));
vi.mock('@/lib/auth/client', () => ({
  register: mocks.register,
  resendVerification: mocks.resendVerification,
}));

import RegisterPage from './page';

beforeEach(() => {
  vi.clearAllMocks();
});

async function fillCredentials(email: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Username'), 'newuser');
  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), 'password123');
  await user.type(screen.getByLabelText('Confirm Password'), 'password123');
  await user.click(screen.getByRole('button', { name: /continue/i }));
  return user;
}

it('rejects an invalid email before advancing to domain selection', async () => {
  render(<RegisterPage />);
  await fillCredentials('not-an-email');
  expect(screen.getByText('Enter a valid email address')).toBeInTheDocument();
});

it('shows the check-your-email panel after successful registration', async () => {
  mocks.register.mockResolvedValue({ message: 'Account created — check your email for a verification link.' });
  render(<RegisterPage />);
  const user = await fillCredentials('newuser@example.com');
  await user.click(screen.getByText('Civil Engineering'));
  await user.click(screen.getByRole('button', { name: /create account/i }));
  await waitFor(() => expect(screen.getByText('Check your email')).toBeInTheDocument());
  expect(mocks.register).toHaveBeenCalledWith('newuser', 'password123', 'civil-engineering', 'newuser@example.com');
});
