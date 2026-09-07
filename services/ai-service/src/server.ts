import express from 'express';
import { sessionUserId } from './session';
import { readQuota, todayUtc } from './quota';

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '256kb' }));

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.get('/quota', async (req, res) => {
    const session = sessionUserId(req);
    if (!session) return res.status(401).json({ error: 'Not authenticated' });
    res.json(await readQuota(session.userId, todayUtc()));
  });

  return app;
}

if (process.env.NODE_ENV !== 'test') {
  createApp().listen(4004, () => console.log('ai-service listening on 4004'));
}
