// Plain functional HTML — deliberately not a design priority (see spec).
export function verificationEmail(link: string): { subject: string; html: string } {
  return {
    subject: 'Verify your email — RevisionOS',
    html: `<p>Welcome to RevisionOS!</p>
<p><a href="${link}">Click here to verify your email address</a>. This link expires in 1 hour.</p>
<p>If you didn't create this account, you can ignore this email.</p>`,
  };
}

export function passwordResetEmail(link: string): { subject: string; html: string } {
  return {
    subject: 'Reset your password — RevisionOS',
    html: `<p><a href="${link}">Click here to reset your password</a>. This link expires in 30 minutes and can be used once.</p>
<p>If you didn't request this, you can ignore this email — your password is unchanged.</p>`,
  };
}
