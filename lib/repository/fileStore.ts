import path from 'node:path';
import type { AppData } from '@/lib/domain/types';
import { getPool } from '@/lib/db/pool';

// Snapshot data lives in the Postgres `app_data` table (see readData/writeData
// below). `dataFilePath` is kept only so lib/repository/fileBlobStore.ts can
// still derive the on-disk directory for uploaded file blobs, which remain
// on local disk in this phase — the path it returns is no longer read or
// written as a JSON file.
function dataRoot(): string {
  return process.env.DATA_DIR ?? path.join(process.cwd(), 'data');
}

export function dataFilePath(userId?: string): string {
  if (userId) {
    return path.join(dataRoot(), 'users', userId, 'appdata.json');
  }
  return process.env.DATA_FILE ?? path.join(dataRoot(), 'appdata.json');
}

export async function readData(userId?: string): Promise<AppData | null> {
  if (!userId) return null;
  const { rows } = await getPool().query<{ data: AppData }>(
    'SELECT data FROM app_data WHERE user_id = $1',
    [userId],
  );
  return rows[0]?.data ?? null;
}

export async function writeData(data: AppData, userId?: string): Promise<void> {
  if (!userId) throw new Error('writeData requires a userId');
  await getPool().query(
    `INSERT INTO app_data (user_id, data, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
    [userId, JSON.stringify(data)],
  );
}
