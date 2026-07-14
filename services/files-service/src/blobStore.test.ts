import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeBlob, readBlob, deleteBlob } from './blobStore';

beforeEach(async () => {
  process.env.FILES_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'files-service-'));
});

describe('blobStore', () => {
  it('round-trips a blob and its metadata for a user', async () => {
    await writeBlob('abc123', Buffer.from('hello'), { name: 'x.png', mime: 'image/png', size: 5 }, 'user-1');
    const result = await readBlob('abc123', 'user-1');
    expect(result?.bytes.toString()).toBe('hello');
    expect(result?.meta.name).toBe('x.png');
  });

  it('isolates blobs per user', async () => {
    await writeBlob('abc123', Buffer.from('hello'), { name: 'x.png', mime: 'image/png', size: 5 }, 'user-1');
    expect(await readBlob('abc123', 'user-2')).toBeNull();
  });

  it('deletes a blob and its metadata', async () => {
    await writeBlob('abc123', Buffer.from('hello'), { name: 'x.png', mime: 'image/png', size: 5 }, 'user-1');
    await deleteBlob('abc123', 'user-1');
    expect(await readBlob('abc123', 'user-1')).toBeNull();
  });
});
