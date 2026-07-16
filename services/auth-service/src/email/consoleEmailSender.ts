import type { EmailSender } from './emailSender';

// Dev/smoke fallback when RESEND_API_KEY is unset: the verification/reset
// link is only reachable via these log lines (scripts/smoke-test.mjs greps
// them out of `docker logs`), so they must go to stdout via console.log.
export class ConsoleEmailSender implements EmailSender {
  async send(to: string, subject: string, html: string): Promise<void> {
    console.log(`[email] RESEND_API_KEY not set — NOT sending to ${to}: ${subject}`);
    console.log(`[email] body: ${html.replace(/\n/g, ' ')}`);
  }
}
