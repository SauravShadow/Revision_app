import type { PoolClient } from 'pg';
import type { AppData } from '@revision-app/shared';
import { getPool } from './db';
import { deriveStats, deriveActivity } from './stats';

export async function writeStatsInTx(client: PoolClient, userId: string, data: AppData, now: number): Promise<void> {
  const stats = deriveStats(data, now);
  await client.query(
    `INSERT INTO user_stats (user_id, total_topics, completed_topics, streak_days, due_histogram, subject_coverage, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (user_id) DO UPDATE SET
       total_topics = EXCLUDED.total_topics,
       completed_topics = EXCLUDED.completed_topics,
       streak_days = EXCLUDED.streak_days,
       due_histogram = EXCLUDED.due_histogram,
       subject_coverage = EXCLUDED.subject_coverage,
       updated_at = EXCLUDED.updated_at`,
    [userId, stats.totalTopics, stats.completedTopics, stats.streakDays,
     JSON.stringify(stats.dueHistogram), JSON.stringify(stats.subjectCoverage)],
  );
  // Activity is fully derivable from the blob (revision timestamps can be
  // edited or deleted in the app), so replace rather than increment.
  const activity = deriveActivity(data);
  await client.query('DELETE FROM user_activity WHERE user_id = $1', [userId]);
  const days = Object.keys(activity);
  if (days.length > 0) {
    await client.query(
      `INSERT INTO user_activity (user_id, day, revisions)
       SELECT $1, d::date, r FROM unnest($2::text[], $3::int[]) AS t(d, r)`,
      [userId, days, days.map((d) => activity[d])],
    );
  }
}

export async function recomputeAllStats(now = Date.now()): Promise<number> {
  const { rows } = await getPool().query<{ user_id: string; data: AppData }>(
    'SELECT user_id, data FROM app_data',
  );
  for (const row of rows) {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await writeStatsInTx(client, row.user_id, row.data, now);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
  return rows.length;
}
