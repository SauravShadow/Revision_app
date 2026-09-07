import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import { signSession } from '@revision-app/shared/server';
import { getPool } from './db';
import { createApp } from './server';
import * as providerModule from './provider';
import { ProviderError } from './provider';
import { reset as resetBreaker } from './breaker';

const app = createApp();
const token = signSession({
  userId: '33333333-3333-3333-3333-333333333333',
  username: 'alice',
  domain: 'civil-engineering',
});

const body = { topicId: 't1', title: 'Limit State Design', notes: 'Partial safety factors apply.', count: 3 };

function stubProvider(impl: () => Promise<unknown>) {
  vi.spyOn(providerModule, 'getProvider').mockReturnValue({
    name: 'gemini',
    generateFlashcards: impl as never,
  });
}

beforeEach(async () => {
  await getPool().query('TRUNCATE ai_quota');
  await getPool().query('TRUNCATE ai_usage');
  process.env.AI_DAILY_QUOTA = '2';
  resetBreaker();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await getPool().end();
});

describe('POST /flashcards', () => {
  it('401s without a session', async () => {
    const res = await request(app).post('/flashcards').send(body);
    expect(res.status).toBe(401);
  });

  it('400s on a malformed body', async () => {
    const res = await request(app).post('/flashcards')
      .set('Authorization', `Bearer ${token}`).send({ title: '' });
    expect(res.status).toBe(400);
  });

  it('returns generated cards and logs usage', async () => {
    stubProvider(async () => ({
      cards: [{ front: 'Q1', back: 'A1' }], inputTokens: 100, outputTokens: 20, model: 'gemini-2.5-flash',
    }));
    const res = await request(app).post('/flashcards')
      .set('Authorization', `Bearer ${token}`).send(body);

    expect(res.status).toBe(200);
    expect(res.body.cards).toEqual([{ front: 'Q1', back: 'A1' }]);
    expect(typeof res.body.usageId).toBe('number');

    const { rows } = await getPool().query('SELECT outcome, input_tokens, cards_proposed FROM ai_usage');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ outcome: 'ok', input_tokens: 100, cards_proposed: 1 });
  });

  it('429s once the daily quota is spent, without calling the provider', async () => {
    const gen = vi.fn(async () => ({ cards: [{ front: 'Q', back: 'A' }], model: 'gemini-2.5-flash' }));
    stubProvider(gen);
    const send = () => request(app).post('/flashcards').set('Authorization', `Bearer ${token}`).send(body);

    expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(200);
    const third = await send();

    expect(third.status).toBe(429);
    expect(gen).toHaveBeenCalledTimes(2);
    const { rows } = await getPool().query(`SELECT outcome FROM ai_usage WHERE outcome = 'quota'`);
    expect(rows).toHaveLength(1);
  });

  it('503s when the provider is rate limited, and does not spend quota', async () => {
    stubProvider(async () => { throw new ProviderError('rate_limited', 'nope'); });
    const res = await request(app).post('/flashcards').set('Authorization', `Bearer ${token}`).send(body);

    expect(res.status).toBe(503);
    expect(res.body.error).not.toContain('nope');
    const { rows } = await getPool().query('SELECT used FROM ai_quota');
    expect(rows[0].used).toBe(0);
  });

  it('502s on bad provider output', async () => {
    stubProvider(async () => { throw new ProviderError('bad_output', 'garbage'); });
    const res = await request(app).post('/flashcards').set('Authorization', `Bearer ${token}`).send(body);
    expect(res.status).toBe(502);
  });

  it('refuses locally while the breaker is open, without calling the provider', async () => {
    const gen = vi.fn(async () => { throw new ProviderError('rate_limited', 'nope'); });
    stubProvider(gen);
    const send = () => request(app).post('/flashcards').set('Authorization', `Bearer ${token}`).send(body);

    expect((await send()).status).toBe(503);   // trips the breaker
    expect((await send()).status).toBe(503);   // refused locally
    expect(gen).toHaveBeenCalledTimes(1);
  });
});
