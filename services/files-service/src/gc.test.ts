import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeBlob } from './blobStore';
import { sweepUnreferenced } from './gc';

beforeEach(async () => {
  process.env.FILES_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'files-service-gc-'));
});

describe('sweepUnreferenced', () => {
  it('deletes unreferenced blobs older than the grace period', async () => {
    await writeBlob('old-blob', Buffer.from('x'), { name: 'x', mime: 'image/png', size: 1 }, 'user-1');
    const future = Date.now() + 25 * 60 * 60 * 1000; // past the 24h grace period
    const result = await sweepUnreferenced(new Set(), 'user-1', future);
    expect(result.deleted).toBe(1);
  });

  it('keeps referenced blobs regardless of age', async () => {
    await writeBlob('kept-blob', Buffer.from('x'), { name: 'x', mime: 'image/png', size: 1 }, 'user-1');
    const future = Date.now() + 25 * 60 * 60 * 1000;
    const result = await sweepUnreferenced(new Set(['kept-blob']), 'user-1', future);
    expect(result.deleted).toBe(0);
  });
});
