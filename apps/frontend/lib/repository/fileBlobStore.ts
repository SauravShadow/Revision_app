import { promises as fs } from 'node:fs';
import path from 'node:path';
import { dataFilePath } from './fileStore';

export interface BlobMeta {
  name: string;
  mime: string;
  size: number;
}

// Ids come from makeId(): UUIDs or a base36 fallback. Anything outside this
// charset (dots, slashes, backslashes) never reaches the filesystem.
const BLOB_ID_RE = /^[A-Za-z0-9-]{1,64}$/;

export function isValidBlobId(id: string): boolean {
  return BLOB_ID_RE.test(id);
}

export function filesDir(userId?: string): string {
  // With a userId, files live alongside the user's appdata.json
  if (userId) return path.join(path.dirname(dataFilePath(userId)), 'files');
  // Legacy: derive from the single-user data file path
  return path.join(path.dirname(dataFilePath()), 'files');
}

export async function writeBlob(id: string, bytes: Buffer, meta: BlobMeta, userId?: string): Promise<void> {
  const dir = filesDir(userId);
  await fs.mkdir(dir, { recursive: true });
  // Atomic-ish: write bytes then meta.
  await fs.writeFile(path.join(dir, id), bytes);
  await fs.writeFile(path.join(dir, `${id}.json`), JSON.stringify(meta), 'utf8');
}

export async function readBlob(id: string, userId?: string): Promise<{ bytes: Buffer; meta: BlobMeta } | null> {
  if (!isValidBlobId(id)) return null;
  const dir = filesDir(userId);
  try {
    const bytes = await fs.readFile(path.join(dir, id));
    const meta = JSON.parse(await fs.readFile(path.join(dir, `${id}.json`), 'utf8')) as BlobMeta;
    return { bytes, meta };
  } catch {
    return null;
  }
}

export async function deleteBlob(id: string, userId?: string): Promise<void> {
  if (!isValidBlobId(id)) return;
  const dir = filesDir(userId);
  await fs.rm(path.join(dir, id), { force: true });
  await fs.rm(path.join(dir, `${id}.json`), { force: true });
}

export const GC_GRACE_MS = 24 * 60 * 60 * 1000;
