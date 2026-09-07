import express from 'express';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { z } from 'zod';
import { sessionUserId } from './session';
import { consumeQuota, readQuota, todayUtc } from './quota';
import { getProvider, ProviderError } from './provider';
import { recordUsage, recordKept } from './usage';
import { isOpen, trip } from './breaker';
import { getPool } from './db';

const generateSchema = z.object({
  topicId: z.string().min(1),
  title: z.string().min(1).max(300),
  notes: z.string().max(20_000),
  count: z.number().int().min(1).max(20).default(8),
});

const keptSchema = z.object({
  usageId: z.number().int().positive(),
  kept: z.number().int().min(0).max(50),
});

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

  app.post('/flashcards', asyncRoute(async (req, res) => {
    const session = sessionUserId(req);
    if (!session) return res.status(401).json({ error: 'Not authenticated' });

    const parsed = generateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid request' });

    const provider = getProvider();
    const today = todayUtc();

    // Breaker check comes before the quota claim: a locally-refused request
    // must not cost the student a generation.
    if (isOpen()) {
      return res.status(503).json({ error: 'AI is busy right now — try again in a minute.' });
    }

    if (!(await consumeQuota(session.userId, today))) {
      const { limit } = await readQuota(session.userId, today);
      await recordUsage({
        userId: session.userId, provider: provider.name, model: 'n/a',
        operation: 'flashcards', outcome: 'quota',
      });
      return res.status(429).json({
        error: `You've used today's ${limit} generations — resets at midnight UTC.`,
      });
    }

    const startedAt = Date.now();
    try {
      const result = await provider.generateFlashcards({
        title: parsed.data.title, notes: parsed.data.notes, count: parsed.data.count,
      });
      const usageId = await recordUsage({
        userId: session.userId, provider: provider.name, model: result.model,
        operation: 'flashcards', inputTokens: result.inputTokens, outputTokens: result.outputTokens,
        latencyMs: Date.now() - startedAt, outcome: 'ok', cardsProposed: result.cards.length,
      });
      return res.json({ usageId, cards: result.cards });
    } catch (err) {
      // A failed generation must not cost the student a quota unit.
      await getPool().query(
        'UPDATE ai_quota SET used = GREATEST(0, used - 1) WHERE user_id = $1 AND day = $2',
        [session.userId, today],
      );
      const kind = err instanceof ProviderError ? err.kind : 'unavailable';
      await recordUsage({
        userId: session.userId, provider: provider.name, model: 'n/a',
        operation: 'flashcards', latencyMs: Date.now() - startedAt,
        outcome: kind === 'rate_limited' ? 'rate_limited' : 'error',
      });
      if (kind === 'rate_limited') {
        trip();
        return res.status(503).json({ error: 'AI is busy right now — try again in a minute.' });
      }
      if (kind === 'bad_output') {
        return res.status(502).json({ error: "Couldn't generate cards for this topic." });
      }
      return res.status(503).json({ error: 'AI is unavailable right now — try again shortly.' });
    }
  }));

  app.post('/flashcards/kept', asyncRoute(async (req, res) => {
    const session = sessionUserId(req);
    if (!session) return res.status(401).json({ error: 'Not authenticated' });
    const parsed = keptSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid request' });
    await recordKept(parsed.data.usageId, session.userId, parsed.data.kept);
    return res.status(204).end();
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
