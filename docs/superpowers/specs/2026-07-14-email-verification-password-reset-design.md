# Email Verification & Password Reset — Design

## Goal

Add a real email address to accounts, verified once, used for two things: gating new-account login on proof of email ownership, and letting users recover a forgotten password via an emailed link. This is Phase 1 of a two-phase plan — Phase 2 (later, separate spec) adds "Sign in with Google," which builds on the email field this phase introduces.

## Scope Decisions

- **Email is required for new signups**, verified before first login. Existing accounts (17 as of this writing) are grandfathered in with no email and keep working exactly as before; a settings page lets them add one later.
- **Email sending** goes through Resend (chosen for its free tier and simple API), but only via a small `EmailSender` interface — nothing else in the codebase talks to Resend directly, so switching providers later is a one-file change. Existing stored email addresses are provider-agnostic and unaffected by such a switch.
- **Password reset does not revoke other active sessions.** Session tokens are stateless HMAC (see `packages/shared/src/session.ts`) and aren't revocable without changing `SESSION_SECRET` for everyone. Fixing this would mean moving to a revocable session model — explicitly out of scope for this phase.
- **No real rate-limiting.** A per-account 60-second cooldown between verification/reset email requests guards against accidental double-clicks and basic spam. Not a defense against a determined attacker — accepted as proportionate to this app's personal scale.
- **Google OAuth is deferred to Phase 2.**

## Data Model

All changes live in `services/auth-service`'s own `revision_auth` database (which already owns `users`) — no other service is touched.

`db/migrations/0002_email.sql`:
```sql
ALTER TABLE users
  ADD COLUMN email text,
  ADD COLUMN email_lower text GENERATED ALWAYS AS (lower(email)) STORED,
  ADD COLUMN email_verified_at timestamptz;

CREATE UNIQUE INDEX users_email_lower_idx ON users (email_lower) WHERE email_lower IS NOT NULL;

CREATE TABLE email_verification_tokens (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE password_reset_tokens (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

`email` is nullable (grandfathered accounts have none). The partial unique index (`WHERE email_lower IS NOT NULL`) allows any number of `NULL` emails while still enforcing uniqueness among accounts that do have one. Both token tables store only a SHA-256 hash of the token — the raw token exists only in the emailed link, never at rest, so a database read can't be used to hijack a pending verification or reset.

## Email-Sending Abstraction

`services/auth-service/src/email/`:
```ts
// EmailSender.ts
export interface EmailSender {
  send(to: string, subject: string, html: string): Promise<void>;
}

// resendEmailSender.ts
export class ResendEmailSender implements EmailSender {
  async send(to: string, subject: string, html: string): Promise<void> {
    // POST to Resend's API using RESEND_API_KEY / FROM_EMAIL from env
  }
}
```
Two templates (plain functional HTML, not a design priority): verification link, password-reset link. New env vars on `auth-service`: `RESEND_API_KEY`, `FROM_EMAIL`, `FRONTEND_URL` (to build the links the emails point to, e.g. `${FRONTEND_URL}/verify-email?token=...`).

Tests use a fake `EmailSender` that records calls instead of hitting the network — this is the seam, not a mock of Resend's SDK.

## Flows & Endpoints (all on `auth-service`, proxied by the gateway per the existing `/api/auth/*` pattern)

**Registration:**
- `POST /register` now requires `email` (format-validated). Creates the user with `email_verified_at = null`, generates a verification token (random 32 bytes, hashed before storing, 1-hour expiry), emails the link, and returns "check your email" rather than an immediate session.
- `GET /verify-email?token=...` (new): hashes the incoming token, looks it up, checks expiry, sets `email_verified_at = now()`, deletes the token row. Expired/unknown tokens return a clear error.
- `POST /resend-verification` (new, body: `username` or `email`): re-issues a verification token if the account is unverified, subject to the 60-second cooldown.
- `POST /login`: if the account has an email and `email_verified_at IS NULL`, reject with "verify your email first." Accounts with no email at all (`email IS NULL`) skip this check entirely — this is exactly how the 17 grandfathered accounts keep working unmodified.

**Password reset:**
- `POST /forgot-password` (body: `email`): looks up the user by `email_lower`; if found, issues a reset token (30-minute expiry) and emails the link. Always returns the same generic "if that email exists, we sent a link" response regardless of whether the account exists, to avoid account enumeration.
- `POST /reset-password` (body: `token`, `newPassword`): hashes the incoming token, validates it's unexpired and unused, updates `password_hash`, marks the token used (or deletes it). Does not touch any other user's session — see the scope decision above.

## Frontend Changes (`apps/frontend`)

- `app/(auth)/register/page.tsx`: add an email field to the credentials step, basic client-side format validation. On successful registration, show a "check your email" confirmation screen instead of logging in immediately.
- `app/(auth)/verify-email/page.tsx` (new): reads `?token=` on mount, calls the verify endpoint, shows success/expired/invalid states with a path to log in or request a new link.
- `app/(auth)/forgot-password/page.tsx` (new): email input, calls `/forgot-password`, shows the generic confirmation.
- `app/(auth)/reset-password/page.tsx` (new): reads `?token=`, new-password + confirm form, calls `/reset-password`, success state links to `/login`.
- Login page: add a "Forgot password?" link to `/forgot-password`.
- `app/settings/page.tsx` (new — this app currently has no account/settings page at all): minimal, scoped to this feature only — shows current email status (none / unverified / verified) and a form to add + verify an email, for grandfathered accounts. Nothing else goes in this page for this phase.

Each new page is a thin, focused component following this project's existing auth-page patterns (see `app/(auth)/register/page.tsx`, `app/(auth)/login/page.tsx`).

## Testing

Following this project's established convention (real Postgres, never a mocked `pg` client):
- `services/auth-service`: new test coverage for token generation/hashing/expiry, the modified `/register` and `/login` flows (email required, verification-gated, grandfathered accounts unaffected), `/forgot-password` and `/reset-password`, `/resend-verification`'s cooldown — all against the real `revision_auth_test` database.
- Fake `EmailSender` in tests asserts "an email was sent to X with a link containing a token," without any network call.
- `apps/frontend`: component tests for the four new/modified pages, following the existing pattern for auth pages.

## Known Limitations (accepted, not fixed in this phase)

- Changing a password does not invalidate other active sessions for that account (stateless session tokens aren't revocable).
- No real rate-limiting — only a 60-second per-account cooldown on repeat email requests.
- Resend requires a verified sending domain for production-quality deliverability; using an unverified/shared domain initially may affect deliverability or carry sending limits until a domain is verified.
