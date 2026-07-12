import { promises as fs } from 'node:fs';
import path from 'node:path';
import { dataFilePath } from './fileStore';

export interface BlobMeta {
  name: string;
  mime: string;
  size: number;
}

export function filesDir(): string {
  return path.join(path.dirname(dataFilePath()), 'files');
}

export async function writeBlob(id: string, bytes: Buffer, meta: BlobMeta): Promise<void> {
  const dir = filesDir();
  await fs.mkdir(dir, { recursive: true });
  // Atomic-ish: write bytes then meta.
  await fs.writeFile(path.join(dir, id), bytes);
  await fs.writeFile(path.join(dir, `${id}.json`), JSON.stringify(meta), 'utf8');
}

export async function readBlob(id: string): Promise<{ bytes: Buffer; meta: BlobMeta } | null> {
  const dir = filesDir();
  try {
    const bytes = await fs.readFile(path.join(dir, id));
    const meta = JSON.parse(await fs.readFile(path.join(dir, `${id}.json`), 'utf8')) as BlobMeta;
    return { bytes, meta };
  } catch {
    return null;
  }
}

export async function deleteBlob(id: string): Promise<void> {
  const dir = filesDir();
  await fs.rm(path.join(dir, id), { force: true });
  await fs.rm(path.join(dir, `${id}.json`), { force: true });
}
