import express from 'express';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { sessionUserId } from './session';
import { readQuota, todayUtc } from './quota';

/**
 * Express 4 does not catch rejections from async handlers, so an unhandled
 * rejection would terminate the process. Wrap every async route in this.
 */
function asyncRoute(
  fn: (req: Request, res: Response) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
}

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '256kb' }));

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.get('/quota', asyncRoute(async (req, res) => {
    const session = sessionUserId(req);
    if (!session) return res.status(401).json({ error: 'Not authenticated' });
    res.json(await readQuota(session.userId, todayUtc()));
  }));

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('ai-service error:', err);
    res.status(500).json({ error: 'Internal error' });
  });

  return app;
}

if (process.env.NODE_ENV !== 'test') {
  createApp().listen(4004, () => console.log('ai-service listening on 4004'));
}
