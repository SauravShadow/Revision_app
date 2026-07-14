import type { AppData } from '@revision-app/shared';
import { getPool } from './db';

export async function readData(userId: string): Promise<AppData | null> {
  const { rows } = await getPool().query<{ data: AppData }>(
    'SELECT data FROM app_data WHERE user_id = $1',
    [userId],
  );
  return rows[0]?.data ?? null;
}

export async function writeData(userId: string, data: AppData): Promise<void> {
  await getPool().query(
    `INSERT INTO app_data (user_id, data, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
    [userId, JSON.stringify(data)],
  );
}
