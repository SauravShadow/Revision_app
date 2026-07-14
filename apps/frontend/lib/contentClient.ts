// Thin wrapper so callers don't know whether app data comes from the local
// Postgres connection or (post-extraction) content-service over HTTP.
import type { AppData } from '@revision-app/shared';
import { readData, writeData } from './repository/fileStore';

export async function getAppData(userId: string): Promise<AppData | null> {
  return readData(userId);
}

export async function putAppData(userId: string, data: AppData): Promise<void> {
  await writeData(data, userId);
}
