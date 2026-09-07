import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getPool } from './db';
import { consumeQuota, readQuota, todayUtc, dailyLimit } from './quota';

const USER = '22222222-2222-2222-2222-222222222222';
const DAY = '2026-09-04';

beforeEach(async () => {
  await getPool().query('TRUNCATE ai_quota');
  process.env.AI_DAILY_QUOTA = '3';
});

afterAll(async () => {
  await getPool().end();
});

describe('quota', () => {
  it('defaults the limit to 10 when unset', () => {
    delete process.env.AI_DAILY_QUOTA;
    expect(dailyLimit()).toBe(10);
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
