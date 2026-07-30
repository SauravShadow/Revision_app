import express from 'express';
import { findByUsername, findByEmail, findById, createUser, verifyPassword, markEmailVerified, setEmail, updatePassword } from './userStore';
import { issueToken, consumeVerificationToken, consumeResetToken } from './tokenStore';
import { createDefaultEmailSender, verificationEmail, passwordResetEmail } from './email';
import type { EmailSender } from './email';
import { DOMAIN_LABELS } from '@revision-app/shared';
import type { Domain } from '@revision-app/shared';
import { signSession, signFileToken } from '@revision-app/shared/server';
import { sessionFrom } from './session';
import { orgRouter } from './orgRoutes';
import { internalRouter } from './internalRoutes';

const ALLOW_REGISTRATION = process.env.ALLOW_REGISTRATION !== 'false';
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://127.0.0.1:3200';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

// ── credential-endpoint rate limit: sliding window, keyed by client + subject ─
// Guards /login and /forgot-password against brute force / credential stuffing.
// PBKDF2 at 310k iterations also makes unthrottled login a CPU-DoS lever.
// In-memory (per process) — same tradeoff as the org-join limiter; move to a
// shared store before running multiple auth-service replicas.
const CREDENTIAL_WINDOW_MS = 15 * 60 * 1000;
const CREDENTIAL_MAX_ATTEMPTS = 5;
const credentialAttempts = new Map<string, number[]>();

export function _resetLoginRateLimit(): void {
  credentialAttempts.clear();
}

function credentialAttemptAllowed(key: string): boolean {
  const now = Date.now();
  const recent = (credentialAttempts.get(key) ?? []).filter((t) => now - t < CREDENTIAL_WINDOW_MS);
  recent.push(now);
  credentialAttempts.set(key, recent);
  return recent.length <= CREDENTIAL_MAX_ATTEMPTS;
}

export function createApp(emailSender: EmailSender = createDefaultEmailSender()) {
  const app = express();
  app.use(express.json());

  async function sendVerification(userId: string, to: string): Promise<void> {
    const raw = await issueToken('verification', userId);
    const { subject, html } = verificationEmail(`${FRONTEND_URL}/verify-email?token=${raw}`);
    try {
      await emailSender.send(to, subject, html);
    } catch (err) {
      // The account/token are already in place — the user can hit
      // resend-verification once the mail provider recovers.
      console.error('[email] failed to send verification email', err);
    }
  }

  app.post('/register', async (req, res) => {
    if (!ALLOW_REGISTRATION) {
      return res.status(403).json({ error: 'Registration is disabled' });
    }
    const { username, password, domain, email } = req.body ?? {};
    if (!username || typeof username !== 'string' || username.trim().length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }
    if (!password || typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }
    if (!domain || !(domain in DOMAIN_LABELS)) {
      return res.status(400).json({ error: 'Invalid domain selected' });
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
      return res.status(400).json({ error: 'Username may only contain letters, numbers, and underscores' });
    }
    if (!email || typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      return res.status(400).json({ error: 'A valid email address is required' });
    }
    try {
      const user = await createUser(username.trim(), password, domain as Domain, email.trim());
      await sendVerification(user.id, user.email!);
      res.status(201).json({ message: 'Account created — check your email for a verification link.' });
    } catch (err) {
      if (err instanceof Error && err.message === 'USERNAME_TAKEN') {
        return res.status(409).json({ error: 'Username is already taken' });
      }
      if (err instanceof Error && err.message === 'EMAIL_TAKEN') {
        return res.status(409).json({ error: 'An account with that email already exists' });
      }
      console.error('[register]', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.get('/verify-email', async (req, res) => {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    if (!token) return res.status(400).json({ error: 'Missing token' });
    try {
      const userId = await consumeVerificationToken(token);
      if (!userId) {
        return res.status(400).json({ error: 'This link is invalid or has expired.', code: 'TOKEN_INVALID' });
      }
      await markEmailVerified(userId);
      res.json({ message: 'Email verified — you can now sign in.' });
    } catch (err) {
      console.error('[verify-email]', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/resend-verification', async (req, res) => {
    const { identifier } = req.body ?? {};
    const generic = { message: 'If that account exists and is unverified, a new verification email has been sent.' };
    if (!identifier || typeof identifier !== 'string') {
      return res.status(400).json({ error: 'Username or email is required' });
    }
    try {
      const user = (await findByUsername(identifier.trim())) ?? (await findByEmail(identifier.trim()));
      // Same generic answer whether the account is missing, has no email, or
      // is already verified — no account enumeration through this endpoint.
      if (!user?.email || user.emailVerifiedAt) return res.json(generic);
      await sendVerification(user.id, user.email);
      res.json(generic);
    } catch (err) {
      if (err instanceof Error && err.message === 'COOLDOWN') {
        return res.status(429).json({ error: 'Please wait a minute before requesting another email.' });
      }
      console.error('[resend-verification]', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/login', async (req, res) => {
    const { username, password } = req.body ?? {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    // Throttle by client IP + attempted username so guessing is bounded without
    // one attacker being able to lock out a victim from every other network.
    if (!credentialAttemptAllowed(`login:${req.ip}:${String(username).toLowerCase()}`)) {
      return res.status(429).json({ error: 'Too many login attempts — please wait a few minutes and try again.' });
    }
    const user = await findByUsername(username);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    // Grandfathered accounts (email IS NULL) skip this gate entirely.
    if (user.email && !user.emailVerifiedAt) {
      return res.status(403).json({ error: 'Please verify your email before signing in.', code: 'EMAIL_UNVERIFIED' });
    }
    const session = { userId: user.id, username: user.username, domain: user.domain };
    res.json({ ...session, token: signSession(session), fileToken: signFileToken(user.id) });
  });

  app.get('/me', (req, res) => {
    const session = sessionFrom(req);
    if (!session) return res.status(401).json({ error: 'Not authenticated' });
    res.json({ ...session, token: signSession(session), fileToken: signFileToken(session.userId) });
  });

  app.get('/email-status', async (req, res) => {
    const session = sessionFrom(req);
    if (!session) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const user = await findById(session.userId);
      if (!user) return res.status(401).json({ error: 'Not authenticated' });
      res.json({ email: user.email, verified: user.emailVerifiedAt !== null });
    } catch (err) {
      console.error('[email-status]', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/set-email', async (req, res) => {
    const session = sessionFrom(req);
    if (!session) return res.status(401).json({ error: 'Not authenticated' });
    const { email } = req.body ?? {};
    if (!email || typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      return res.status(400).json({ error: 'A valid email address is required' });
    }
    try {
      const user = await findById(session.userId);
      if (!user) return res.status(401).json({ error: 'Not authenticated' });
      if (user.email && user.emailVerifiedAt) {
        return res.status(409).json({ error: 'This account already has a verified email' });
      }
      await setEmail(user.id, email.trim());
      await sendVerification(user.id, email.trim());
      res.json({ message: 'Verification email sent — check your inbox.' });
    } catch (err) {
      if (err instanceof Error && err.message === 'EMAIL_TAKEN') {
        return res.status(409).json({ error: 'An account with that email already exists' });
      }
      if (err instanceof Error && err.message === 'COOLDOWN') {
        return res.status(429).json({ error: 'Please wait a minute before requesting another email.' });
      }
      console.error('[set-email]', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/forgot-password', async (req, res) => {
    const { email } = req.body ?? {};
    const generic = { message: 'If an account with that email exists, a password-reset link has been sent.' };
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email is required' });
    }
    if (!credentialAttemptAllowed(`forgot:${req.ip}:${email.trim().toLowerCase()}`)) {
      return res.status(429).json({ error: 'Too many requests — please wait a few minutes and try again.' });
    }
    try {
      const user = await findByEmail(email.trim());
      if (!user?.email) return res.json(generic); // same answer — no enumeration
      const raw = await issueToken('reset', user.id);
      const { subject, html } = passwordResetEmail(`${FRONTEND_URL}/reset-password?token=${raw}`);
      try {
        await emailSender.send(user.email, subject, html);
      } catch (err) {
        console.error('[email] failed to send reset email', err);
      }
      res.json(generic);
    } catch (err) {
      if (err instanceof Error && err.message === 'COOLDOWN') {
        return res.status(429).json({ error: 'Please wait a minute before requesting another email.' });
      }
      console.error('[forgot-password]', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/reset-password', async (req, res) => {
    const { token, newPassword } = req.body ?? {};
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Missing token' });
    }
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }
    try {
      const userId = await consumeResetToken(token);
      if (!userId) {
        return res.status(400).json({ error: 'This link is invalid or has expired.', code: 'TOKEN_INVALID' });
      }
      // Deliberately does NOT revoke existing sessions — stateless HMAC
      // tokens aren't revocable without rotating SESSION_SECRET (spec scope).
      await updatePassword(userId, newPassword);
      res.json({ message: 'Password updated — you can now sign in.' });
    } catch (err) {
      console.error('[reset-password]', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/logout', (_req, res) => {
    res.status(204).end();
  });

  // Mounted before orgRouter: its blanket auth-check middleware matches
  // every path that reaches it, so /internal/* (secret-authed, not
  // session-authed) must be handled first or it'd be wrongly 401'd.
  app.use(internalRouter());

  // Mounted last: the org router's blanket auth-check middleware would
  // otherwise intercept the public routes above (register, login, etc.)
  // before they ever run.
  app.use(orgRouter());

  return app;
}

if (process.env.NODE_ENV !== 'test') {
  createApp().listen(4001, () => console.log('auth-service listening on 4001'));
}
