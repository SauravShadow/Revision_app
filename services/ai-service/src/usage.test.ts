import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getPool } from './db';
import { recordUsage, recordKept } from './usage';

const USER = '44444444-4444-4444-4444-444444444444';
const OTHER = '55555555-5555-5555-5555-555555555555';

beforeEach(async () => { await getPool().query('TRUNCATE ai_usage'); });
afterAll(async () => { await getPool().end(); });

describe('usage log', () => {
  it('inserts a row and returns its id', async () => {
    const id = await recordUsage({
      userId: USER, provider: 'gemini', model: 'gemini-2.5-flash',
      operation: 'flashcards', outcome: 'ok', cardsProposed: 4,
    });
    expect(id).toBeGreaterThan(0);
  });

  it('records kept cards for the owning user', async () => {
    const id = await recordUsage({
      userId: USER, provider: 'gemini', model: 'gemini-2.5-flash',
      operation: 'flashcards', outcome: 'ok', cardsProposed: 4,
    });
    expect(await recordKept(id, USER, 3)).toBe(true);
    const { rows } = await getPool().query('SELECT cards_kept FROM ai_usage WHERE id = $1', [id]);
    expect(rows[0].cards_kept).toBe(3);
  });

  it('refuses to record kept cards for another user', async () => {
    const id = await recordUsage({
      userId: USER, provider: 'gemini', model: 'gemini-2.5-flash',
      operation: 'flashcards', outcome: 'ok', cardsProposed: 4,
    });
    expect(await recordKept(id, OTHER, 99)).toBe(false);
  });
});
