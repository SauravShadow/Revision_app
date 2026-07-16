import { it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({ forgotPassword: vi.fn() }));
vi.mock('@/lib/auth/client', () => ({ forgotPassword: mocks.forgotPassword }));

import ForgotPasswordPage from './page';

it('submits the email and shows the generic confirmation', async () => {
  mocks.forgotPassword.mockResolvedValue({ message: 'If an account with that email exists, a password-reset link has been sent.' });
  render(<ForgotPasswordPage />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email'), 'me@example.com');
  await user.click(screen.getByRole('button', { name: /send reset link/i }));
  await waitFor(() =>
    expect(screen.getByText('If an account with that email exists, a password-reset link has been sent.')).toBeInTheDocument(),
  );
  expect(mocks.forgotPassword).toHaveBeenCalledWith('me@example.com');
});
