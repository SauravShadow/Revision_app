import type { AppData } from '@revision-app/shared';
import { getPool } from './db';
import { writeStatsInTx } from './statsStore';

export async function readData(userId: string): Promise<AppData | null> {
  const { rows } = await getPool().query<{ data: AppData }>(
    'SELECT data FROM app_data WHERE user_id = $1',
    [userId],
  );
  return rows[0]?.data ?? null;
}

export async function writeData(userId: string, data: AppData, now = Date.now()): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO app_data (user_id, data, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
      [userId, JSON.stringify(data)],
    );
    await writeStatsInTx(client, userId, data, now);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
