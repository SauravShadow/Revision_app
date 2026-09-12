import { getPool } from './db';

export function dailyLimit(): number {
  const raw = process.env.AI_DAILY_QUOTA;
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 10;
}

/** UTC calendar day as YYYY-MM-DD. Quota resets at UTC midnight. */
export function todayUtc(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export async function readQuota(
  userId: string,
  today: string,
): Promise<{ used: number; limit: number; remaining: number }> {
  const limit = dailyLimit();
  const { rows } = await getPool().query<{ used: number }>(
    'SELECT used FROM ai_quota WHERE user_id = $1 AND day = $2',
    [userId, today],
  );
  const used = rows[0]?.used ?? 0;
  return { used, limit, remaining: Math.max(0, limit - used) };
}

/**
 * Atomically claim one unit of today's quota. The conditional UPDATE means two
 * concurrent requests can never push `used` past the limit.
 * Returns false when the user is already at the cap.
 */
export async function consumeQuota(userId: string, today: string): Promise<boolean> {
  const limit = dailyLimit();
  const { rowCount } = await getPool().query(
    `INSERT INTO ai_quota (user_id, day, used) VALUES ($1, $2, 1)
     ON CONFLICT (user_id, day) DO UPDATE SET used = ai_quota.used + 1
     WHERE ai_quota.used < $3`,
    [userId, today, limit],
  );
  return rowCount === 1;
}
