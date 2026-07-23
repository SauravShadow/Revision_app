// Branded, email-safe HTML (inline styles, single column). The mark is an
// absolute-URL <img> (the frontend serves it at /icons/icon-192.png) paired with
// an HTML wordmark — email clients strip data: URIs, and this mirrors the app
// header while avoiding any baked-in logo background.

function originOf(link: string): string {
  try {
    return new URL(link).origin;
  } catch {
    return '';
  }
}

function shell(origin: string, title: string, bodyHtml: string): string {
  const mark = origin
    ? `<img src="${origin}/icons/icon-192.png" alt="" width="34" height="34" style="display:block;border:0;">`
    : '';
  const logo = `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        ${mark ? `<td style="vertical-align:middle;padding-right:12px;">${mark}</td>` : ''}
        <td style="vertical-align:middle;font-size:22px;letter-spacing:-.5px;color:#3f6b1a;">Revision<span style="font-weight:800;">Works</span></td>
      </tr></table>`;
  return `<div style="margin:0;padding:24px;background:#f4f2ea;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2b2a24;">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e7e2d4;border-radius:12px;overflow:hidden;">
    <div style="padding:24px 28px 12px;">${logo}</div>
    <div style="height:3px;background:linear-gradient(90deg,#4a7a1f,transparent);"></div>
    <div style="padding:22px 28px 28px;font-size:15px;line-height:1.6;">
      <h1 style="font-size:18px;margin:0 0 12px;color:#2b2a24;">${title}</h1>
      ${bodyHtml}
    </div>
    <div style="padding:16px 28px;background:#faf7ef;border-top:1px solid #e7e2d4;font-size:12px;color:#8b8776;">RevisionWorks · spaced-repetition exam revision</div>
  </div>
</div>`;
}

const button = (link: string, label: string) =>
  `<p style="margin:0 0 20px;"><a href="${link}" style="display:inline-block;background:#4a7a1f;color:#ffffff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:600;">${label}</a></p>`;

export function verificationEmail(link: string): { subject: string; html: string } {
  return {
    subject: 'Verify your email — RevisionWorks',
    html: shell(
      originOf(link),
      'Verify your email',
      `<p style="margin:0 0 16px;">Welcome to RevisionWorks! Confirm your email address to activate your account.</p>
      ${button(link, 'Verify email address')}
      <p style="margin:0;color:#5b584c;font-size:13px;">This link expires in 1 hour. If you didn't create this account, you can ignore this email.</p>`,
    ),
  };
}

export function passwordResetEmail(link: string): { subject: string; html: string } {
  return {
    subject: 'Reset your password — RevisionWorks',
    html: shell(
      originOf(link),
      'Reset your password',
      `<p style="margin:0 0 16px;">We received a request to reset your RevisionWorks password.</p>
      ${button(link, 'Reset password')}
      <p style="margin:0;color:#5b584c;font-size:13px;">This link expires in 30 minutes and can be used once. If you didn't request this, you can ignore this email — your password is unchanged.</p>`,
    ),
  };
}
