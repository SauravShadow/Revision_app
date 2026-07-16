import type { EmailSender } from './emailSender';
import { ResendEmailSender } from './resendEmailSender';
import { ConsoleEmailSender } from './consoleEmailSender';

export type { EmailSender } from './emailSender';
export { verificationEmail, passwordResetEmail } from './templates';

export function createDefaultEmailSender(): EmailSender {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return new ConsoleEmailSender();
  return new ResendEmailSender(apiKey, process.env.FROM_EMAIL ?? 'noreply@localhost');
}
