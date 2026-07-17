import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { DAY_MS } from '@revision-app/shared';
import type { AppData } from '@revision-app/shared';
import { getPool } from './db';
import { writeData } from './appDataStore';
import { recomputeAllStats } from './statsStore';

const NOW = Date.UTC(2026, 6, 16, 12);
const USER = '11111111-1111-1111-1111-111111111111';

function blob(revisedDaysAgo: number[]): AppData {
  return {
    subjects: { s1: { id: 's1', name: 'Soil', color: '', icon: '', order: 0, chapterIds: ['c1'] } },
    chapters: { c1: { id: 'c1', subjectId: 's1', name: 'Ch1', order: 0, difficulty: 'Easy', priority: 'Low', topicIds: ['t1'] } },
    topics: {
      t1: {
        id: 't1', chapterId: 'c1', title: 'T1', notes: '', order: 0, difficulty: 'Easy', priority: 'Low',
        revisionHistory: revisedDaysAgo.map((d, i) => ({ id: `r${i}`, timestamp: NOW - d * DAY_MS })),
        createdAt: 0, updatedAt: 0,
      },
    },
    subjectOrder: ['s1'], tags: {}, tagOrder: [],
  };
}

beforeEach(async () => {
  await getPool().query('TRUNCATE app_data, user_stats, user_activity');
});
afterAll(() => getPool().end());

describe('statsStore', () => {
  it('writeData upserts app_data, user_stats, and user_activity together', async () => {
    await writeData(USER, blob([1, 0]), NOW);
    const stats = await getPool().query('SELECT * FROM user_stats WHERE user_id = $1', [USER]);
    expect(stats.rows).toHaveLength(1);
    expect(stats.rows[0].total_topics).toBe(1);
    expect(stats.rows[0].completed_topics).toBe(1);
    const activity = await getPool().query(
      `SELECT to_char(day, 'YYYY-MM-DD') AS day, revisions FROM user_activity WHERE user_id = $1 ORDER BY day`,
      [USER],
    );
    expect(activity.rows).toEqual([
      { day: '2026-07-15', revisions: 1 },
      { day: '2026-07-16', revisions: 1 },
    ]);
  });

  it('rewrites activity on every save (deleted revisions disappear)', async () => {
    await writeData(USER, blob([1, 0]), NOW);
    await writeData(USER, blob([0]), NOW); // the day-old revision was deleted in the app
    const activity = await getPool().query(
      `SELECT to_char(day, 'YYYY-MM-DD') AS day FROM user_activity WHERE user_id = $1`,
      [USER],
    );
    expect(activity.rows).toEqual([{ day: '2026-07-16' }]);
  });

  it('recomputeAllStats backfills users that predate the stats tables', async () => {
    // Simulate a legacy row written before stats existed.
    await getPool().query(
      `INSERT INTO app_data (user_id, data, updated_at) VALUES ($1, $2, now())`,
      [USER, JSON.stringify(blob([2]))],
    );
    expect(await recomputeAllStats(NOW)).toBe(1);
    const stats = await getPool().query('SELECT total_topics FROM user_stats WHERE user_id = $1', [USER]);
    expect(stats.rows[0].total_topics).toBe(1);
  });
});
