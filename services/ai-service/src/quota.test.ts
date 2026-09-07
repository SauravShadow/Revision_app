import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { getPool } from './db';
import { consumeQuota, readQuota, todayUtc, dailyLimit } from './quota';

const USER = '22222222-2222-2222-2222-222222222222';
const DAY = '2026-09-04';

let originalQuota: string | undefined;

beforeAll(() => {
  originalQuota = process.env.AI_DAILY_QUOTA;
});

beforeEach(async () => {
  await getPool().query('TRUNCATE ai_quota');
  process.env.AI_DAILY_QUOTA = '3';
});

afterAll(async () => {
  process.env.AI_DAILY_QUOTA = originalQuota;
  await getPool().end();
});

describe('quota', () => {
  describe('dailyLimit', () => {
    it.each([
      [undefined, 10, 'unset'],
      ['', 10, 'empty string'],
      ['abc', 10, 'non-numeric'],
      ['0', 10, 'zero'],
      ['-5', 10, 'negative'],
      ['3', 3, 'valid positive'],
      ['42', 42, 'valid large'],
    ])('returns %d when AI_DAILY_QUOTA is %s (%s)', (value, expected, _label) => {
      if (value === undefined) {
        delete process.env.AI_DAILY_QUOTA;
      } else {
        process.env.AI_DAILY_QUOTA = value;
      }
      expect(dailyLimit()).toBe(expected);
    });
  });

  it('starts a fresh user at zero used', async () => {
    expect(await readQuota(USER, DAY)).toEqual({ used: 0, limit: 3, remaining: 3 });
  });

  it('consumes up to the limit then refuses', async () => {
    expect(await consumeQuota(USER, DAY)).toBe(true);
    expect(await consumeQuota(USER, DAY)).toBe(true);
    expect(await consumeQuota(USER, DAY)).toBe(true);
    expect(await consumeQuota(USER, DAY)).toBe(false);
    expect(await readQuota(USER, DAY)).toEqual({ used: 3, limit: 3, remaining: 0 });
  });

  it('tracks days independently', async () => {
    await consumeQuota(USER, DAY);
    await consumeQuota(USER, DAY);
    await consumeQuota(USER, DAY);
    expect(await consumeQuota(USER, '2026-09-05')).toBe(true);
  });

  it('formats today as YYYY-MM-DD in UTC', () => {
    expect(todayUtc(Date.UTC(2026, 8, 4, 23, 30))).toBe('2026-09-04');
  });
});
