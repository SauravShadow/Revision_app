import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AppData } from '@/lib/domain/types';

// Server-only snapshot store. JSON blob(s) on disk (Docker-volume friendly).
// Per-user: data/users/<userId>/appdata.json
// Legacy single-user (no userId): uses DATA_FILE env or data/appdata.json
function dataRoot(): string {
  return process.env.DATA_DIR ?? path.join(process.cwd(), 'data');
}

export function dataFilePath(userId?: string): string {
  if (userId) {
    return path.join(dataRoot(), 'users', userId, 'appdata.json');
  }
  // Backwards-compat: honours DATA_FILE env or falls back to data/appdata.json
  return process.env.DATA_FILE ?? path.join(dataRoot(), 'appdata.json');
}

export async function readData(userId?: string): Promise<AppData | null> {
  try {
    const raw = await fs.readFile(dataFilePath(userId), 'utf8');
    if (!raw) return null;
    return JSON.parse(raw) as AppData;
  } catch {
    // Missing file or malformed JSON -> treat as "no data yet".
    return null;
  }
}

export async function writeData(data: AppData, userId?: string): Promise<void> {
  const file = dataFilePath(userId);
  await fs.mkdir(path.dirname(file), { recursive: true });
  // Atomic write: write to a temp file then rename, so a crash mid-write
  // never leaves a half-written snapshot.
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data), 'utf8');
  await fs.rename(tmp, file);
}
