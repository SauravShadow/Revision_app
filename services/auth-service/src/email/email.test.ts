import { describe, it, expect, afterEach, vi } from 'vitest';
import { verificationEmail, passwordResetEmail } from './templates';
import { createDefaultEmailSender } from './index';
import { ResendEmailSender } from './resendEmailSender';
import { ConsoleEmailSender } from './consoleEmailSender';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('templates', () => {
  it('both templates embed the link and mention their expiry', () => {
    const v = verificationEmail('https://x/verify-email?token=abc');
    expect(v.subject).toContain('Verify');
    expect(v.html).toContain('href="https://x/verify-email?token=abc"');
    expect(v.html).toContain('1 hour');

    const r = passwordResetEmail('https://x/reset-password?token=abc');
    expect(r.subject.toLowerCase()).toContain('reset');
    expect(r.html).toContain('href="https://x/reset-password?token=abc"');
    expect(r.html).toContain('30 minutes');
  });
});

describe('createDefaultEmailSender', () => {
  it('falls back to the console sender when RESEND_API_KEY is unset', () => {
    vi.stubEnv('RESEND_API_KEY', '');
    expect(createDefaultEmailSender()).toBeInstanceOf(ConsoleEmailSender);
  });

  it('uses Resend when RESEND_API_KEY is set', () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_key');
    vi.stubEnv('FROM_EMAIL', 'noreply@example.com');
    expect(createDefaultEmailSender()).toBeInstanceOf(ResendEmailSender);
  });
});
