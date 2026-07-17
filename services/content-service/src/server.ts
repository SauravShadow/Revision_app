import express from 'express';
import { appDataSchema } from '@revision-app/shared';
import { readData, writeData } from './appDataStore';
import { sessionUserId } from './session';
import { cohortRouter } from './cohort';

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use(cohortRouter());

  app.get('/app-data', async (req, res) => {
    const session = sessionUserId(req);
    if (!session) return res.status(401).json({ error: 'Not authenticated' });
    const data = await readData(session.userId);
    if (!data) return res.status(404).json({ error: 'No data yet' });
    res.json(data);
  });

  app.put('/app-data', async (req, res) => {
    const session = sessionUserId(req);
    if (!session) return res.status(401).json({ error: 'Not authenticated' });
    const parsed = appDataSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid AppData', issues: parsed.error.issues });
    }
    await writeData(session.userId, parsed.data);
    res.status(204).end();
  });

  return app;
}

if (process.env.NODE_ENV !== 'test') {
  createApp().listen(4002, () => console.log('content-service listening on 4002'));
}
