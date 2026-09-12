import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import { signSession } from '@revision-app/shared/server';
import { getPool } from './db';
import { createApp } from './server';
import * as providerModule from './provider';
import { ProviderError } from './provider';
import { isOpen, reset as resetBreaker } from './breaker';
import * as usageModule from './usage';

const app = createApp();
const USER_ID = '33333333-3333-3333-3333-333333333333';
const OTHER_USER_ID = '66666666-6666-6666-6666-666666666666';
const token = signSession({
  userId: USER_ID,
  username: 'alice',
  domain: 'civil-engineering',
});
const otherToken = signSession({
  userId: OTHER_USER_ID,
  username: 'bob',
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
      cards: [{ front: 'Q1', back: 'A1' }], inputTokens: 100, outputTokens: 20, model: 'gemini-3.6-flash',
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
    const gen = vi.fn(async () => ({ cards: [{ front: 'Q', back: 'A' }], model: 'gemini-3.6-flash' }));
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

  it('502s on bad provider output, leaves the breaker closed, and charges quota', async () => {
    stubProvider(async () => { throw new ProviderError('bad_output', 'garbage'); });
    const res = await request(app).post('/flashcards').set('Authorization', `Bearer ${token}`).send(body);
    expect(res.status).toBe(502);
    expect(isOpen()).toBe(false);
    // The model ran and billed tokens, so this failure costs a quota unit.
    // Refunding it would let a request engineered to produce garbage loop
    // forever against the shared free-tier pool.
    const { rows } = await getPool().query('SELECT used FROM ai_quota');
    expect(rows[0].used).toBe(1);
  });

  it('503s on a provider timeout and charges quota, since the model was generating', async () => {
    stubProvider(async () => { throw new ProviderError('timeout', 'took too long'); });
    const res = await request(app).post('/flashcards').set('Authorization', `Bearer ${token}`).send(body);

    expect(res.status).toBe(503);
    // Same copy as any other unavailability — a timeout is not new user-facing state.
    expect(res.body.error).toBe('AI is unavailable right now — try again shortly.');
    const { rows } = await getPool().query('SELECT used FROM ai_quota');
    expect(rows[0].used).toBe(1);
  });

  it('refunds quota when the request never reached the provider', async () => {
    stubProvider(async () => { throw new ProviderError('unavailable', 'ECONNREFUSED'); });
    const res = await request(app).post('/flashcards').set('Authorization', `Bearer ${token}`).send(body);

    expect(res.status).toBe(503);
    const { rows } = await getPool().query('SELECT used FROM ai_quota');
    expect(rows[0].used).toBe(0);
  });

  it('truncates a runaway provider response to the requested count', async () => {
    // A prompt injection inside `notes` can talk the model past `count`;
    // responseSchema constrains shape, not length.
    stubProvider(async () => ({
      cards: Array.from({ length: 40 }, (_, i) => ({ front: `Q${i}`, back: `A${i}` })),
      model: 'gemini-3.6-flash',
    }));
    const res = await request(app).post('/flashcards')
      .set('Authorization', `Bearer ${token}`).send({ ...body, count: 3 });

    expect(res.status).toBe(200);
    expect(res.body.cards).toHaveLength(3);
    expect(res.body.cards[0]).toEqual({ front: 'Q0', back: 'A0' });
    const { rows } = await getPool().query('SELECT cards_proposed FROM ai_usage');
    expect(rows[0].cards_proposed).toBe(3);
  });

  it('still returns the cards, with a null usageId, when usage logging fails', async () => {
    stubProvider(async () => ({
      cards: [{ front: 'Q1', back: 'A1' }], model: 'gemini-3.6-flash',
    }));
    vi.spyOn(usageModule, 'recordUsage').mockRejectedValueOnce(new Error('DB down'));

    const res = await request(app).post('/flashcards')
      .set('Authorization', `Bearer ${token}`).send(body);

    // The generation completed and the tokens were billed; a failed INSERT
    // must not throw the cards away or hand back a refund.
    expect(res.status).toBe(200);
    expect(res.body.cards).toEqual([{ front: 'Q1', back: 'A1' }]);
    expect(res.body.usageId).toBeNull();
    const { rows } = await getPool().query('SELECT used FROM ai_quota');
    expect(rows[0].used).toBe(1);
  });

  it('refuses locally while the breaker is open, without calling the provider', async () => {
    const gen = vi.fn(async () => { throw new ProviderError('rate_limited', 'nope'); });
    stubProvider(gen);
    const send = () => request(app).post('/flashcards').set('Authorization', `Bearer ${token}`).send(body);

    expect((await send()).status).toBe(503);   // trips the breaker
    expect((await send()).status).toBe(503);   // refused locally
    expect(gen).toHaveBeenCalledTimes(1);
  });

  it('500s and never claims quota when getProvider() fails (deployment misconfiguration)', async () => {
    vi.spyOn(providerModule, 'getProvider').mockImplementation(() => {
      throw new Error('GEMINI_API_KEY_REVISION env var must be set');
    });
    const res = await request(app).post('/flashcards').set('Authorization', `Bearer ${token}`).send(body);

    expect(res.status).toBe(500);
    const { rows } = await getPool().query('SELECT used FROM ai_quota');
    expect(rows[0]?.used ?? 0).toBe(0);
  });
});

describe('POST /flashcards/kept', () => {
  it('401s without a session', async () => {
    const res = await request(app).post('/flashcards/kept').send({ usageId: 1, kept: 1 });
    expect(res.status).toBe(401);
  });

  it('400s on a malformed body', async () => {
    const res = await request(app).post('/flashcards/kept')
      .set('Authorization', `Bearer ${token}`).send({ usageId: 'nope' });
    expect(res.status).toBe(400);
  });

  it('204s and records kept cards for the owning user', async () => {
    const usageId = await usageModule.recordUsage({
      userId: USER_ID, provider: 'gemini', model: 'gemini-3.6-flash',
      operation: 'flashcards', outcome: 'ok', cardsProposed: 3,
    });
    const res = await request(app).post('/flashcards/kept')
      .set('Authorization', `Bearer ${token}`).send({ usageId, kept: 2 });

    expect(res.status).toBe(204);
    const { rows } = await getPool().query('SELECT cards_kept FROM ai_usage WHERE id = $1', [usageId]);
    expect(rows[0].cards_kept).toBe(2);
  });

  it("does not let a second user overwrite another user's usage row", async () => {
    const usageId = await usageModule.recordUsage({
      userId: USER_ID, provider: 'gemini', model: 'gemini-3.6-flash',
      operation: 'flashcards', outcome: 'ok', cardsProposed: 3,
    });
    await request(app).post('/flashcards/kept')
      .set('Authorization', `Bearer ${otherToken}`).send({ usageId, kept: 40 });

    const { rows } = await getPool().query('SELECT cards_kept FROM ai_usage WHERE id = $1', [usageId]);
    expect(rows[0].cards_kept).toBeNull();
  });
});
