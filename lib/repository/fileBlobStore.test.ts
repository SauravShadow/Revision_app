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

  it('isValidBlobId accepts generated ids and rejects traversal', async () => {
    const { isValidBlobId } = await import('./fileBlobStore');
    expect(isValidBlobId('4f1c2d3e-1111-4222-8333-444455556666')).toBe(true);
    expect(isValidBlobId('lx2m0abc-k3j9d8e2')).toBe(true); // base36 fallback shape
    expect(isValidBlobId('../appdata.json')).toBe(false);
    expect(isValidBlobId('..')).toBe(false);
    expect(isValidBlobId('a/b')).toBe(false);
    expect(isValidBlobId('a\\b')).toBe(false);
    expect(isValidBlobId('')).toBe(false);
    expect(isValidBlobId('a'.repeat(65))).toBe(false);
  });

  it('readBlob and deleteBlob refuse traversal ids without touching the fs', async () => {
    const { writeBlob, readBlob, deleteBlob } = await import('./fileBlobStore');
    await writeBlob('safe1', Buffer.from('x'), { name: 'x', mime: 'text/plain', size: 1 });
    expect(await readBlob('../files/safe1')).toBeNull();
    await deleteBlob('../files/safe1'); // must be a no-op
    expect(await readBlob('safe1')).not.toBeNull();
  });
});
