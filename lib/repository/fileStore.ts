import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AppData } from '@/lib/domain/types';

// Server-only snapshot store. One JSON blob on disk (Docker-volume friendly).
// Swap for a real DB later without touching the RevisionRepository contract.
export function dataFilePath(): string {
  return process.env.DATA_FILE || path.join(process.cwd(), 'data', 'appdata.json');
}

export async function readData(): Promise<AppData | null> {
  try {
    const raw = await fs.readFile(dataFilePath(), 'utf8');
    if (!raw) return null;
    return JSON.parse(raw) as AppData;
  } catch {
    // Missing file or malformed JSON -> treat as "no data yet".
    return null;
  }
}

export async function writeData(data: AppData): Promise<void> {
  const file = dataFilePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  // Atomic write: write to a temp file then rename, so a crash mid-write
  // never leaves a half-written snapshot.
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data), 'utf8');
  await fs.rename(tmp, file);
}
