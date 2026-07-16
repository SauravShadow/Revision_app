// The seam everything else talks to — nothing outside this directory may
// reference Resend directly, so switching providers is a one-file change.
export interface EmailSender {
  send(to: string, subject: string, html: string): Promise<void>;
}
