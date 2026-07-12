import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ce-blob-'));
  process.env.DATA_FILE = path.join(dir, 'appdata.json');
});
afterEach(async () => {
  delete process.env.DATA_FILE;
  await fs.rm(dir, { recursive: true, force: true });
});

describe('fileBlobStore', () => {
  it('filesDir sits beside the data file', async () => {
    const { filesDir } = await import('./fileBlobStore');
    expect(filesDir()).toBe(path.join(dir, 'files'));
  });

  it('returns null for a missing blob', async () => {
    const { readBlob } = await import('./fileBlobStore');
    expect(await readBlob('nope')).toBeNull();
  });

  it('round-trips bytes and meta, then deletes', async () => {
    const { writeBlob, readBlob, deleteBlob } = await import('./fileBlobStore');
    const bytes = Buffer.from('hello world');
    const meta = { name: 'note.txt', mime: 'text/plain', size: bytes.length };
    await writeBlob('b1', bytes, meta);
    const got = await readBlob('b1');
    expect(got!.bytes.equals(bytes)).toBe(true);
    expect(got!.meta).toEqual(meta);
    await deleteBlob('b1');
    expect(await readBlob('b1')).toBeNull();
  });
});
