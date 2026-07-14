import express from 'express';
import { findByUsername, createUser, verifyPassword } from './userStore';
import { signSession, signFileToken, verifySession, DOMAIN_LABELS } from '@revision-app/shared';
import type { Domain } from '@revision-app/shared';

const ALLOW_REGISTRATION = process.env.ALLOW_REGISTRATION !== 'false';

export function createApp() {
  const app = express();
  app.use(express.json());

  app.post('/register', async (req, res) => {
    if (!ALLOW_REGISTRATION) {
      return res.status(403).json({ error: 'Registration is disabled' });
    }
    const { username, password, domain } = req.body ?? {};
    if (!username || typeof username !== 'string' || username.trim().length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    if (!domain || !(domain in DOMAIN_LABELS)) {
      return res.status(400).json({ error: 'Invalid domain selected' });
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
      return res.status(400).json({ error: 'Username may only contain letters, numbers, and underscores' });
    }
    try {
      const user = await createUser(username.trim(), password, domain as Domain);
      const session = { userId: user.id, username: user.username, domain: user.domain };
      res.status(201).json({ ...session, token: signSession(session), fileToken: signFileToken(user.id) });
    } catch (err) {
      if (err instanceof Error && err.message === 'USERNAME_TAKEN') {
        return res.status(409).json({ error: 'Username is already taken' });
      }
      console.error('[register]', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/login', async (req, res) => {
    const { username, password } = req.body ?? {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    const user = await findByUsername(username);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    const session = { userId: user.id, username: user.username, domain: user.domain };
    res.json({ ...session, token: signSession(session), fileToken: signFileToken(user.id) });
  });

  app.get('/me', (req, res) => {
    // Express's req.headers.authorization is a plain string, not a Fetch
    // Request — getSessionFromRequest (Fetch-shaped) doesn't apply here, so
    // this reads the header directly and calls verifySession itself.
    const authHeader = req.headers.authorization ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    const session = token ? verifySession(token) : null;
    if (!session) return res.status(401).json({ error: 'Not authenticated' });
    res.json({ ...session, token: signSession(session), fileToken: signFileToken(session.userId) });
  });

  app.post('/logout', (_req, res) => {
    res.status(204).end();
  });

  return app;
}

if (process.env.NODE_ENV !== 'test') {
  createApp().listen(4001, () => console.log('auth-service listening on 4001'));
}
