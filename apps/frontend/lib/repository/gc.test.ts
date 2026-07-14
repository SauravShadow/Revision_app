import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { AppData, Topic } from '@/lib/domain/types';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ce-gc-'));
  process.env.DATA_FILE = path.join(dir, 'appdata.json');
  process.env.DATA_DIR = dir;
});
afterEach(async () => {
  delete process.env.DATA_FILE;
  delete process.env.DATA_DIR;
  await fs.rm(dir, { recursive: true, force: true });
});

function topicWithUpload(blobId: string): Topic {
  return {
    id: 't1', chapterId: 'c1', title: 'T', notes: '', order: 0,
    difficulty: 'Medium', priority: 'Medium', revisionHistory: [],
    createdAt: 1, updatedAt: 1,
    attachments: [
      { id: blobId, name: 'f.png', kind: 'image', url: `/api/files/${blobId}`, createdAt: 1 },
      { id: 'ext', name: 'site', kind: 'link', url: 'https://example.com', createdAt: 1 },
    ],
  };
}

function appData(topics: Topic[]): AppData {
  return {
    subjects: {}, chapters: {}, subjectOrder: [], tags: {}, tagOrder: [],
    topics: Object.fromEntries(topics.map((t) => [t.id, t])),
  };
}

describe('referencedBlobIds', () => {
  it('collects upload ids and ignores external links', async () => {
    const { referencedBlobIds } = await import('./gc');
    const ids = referencedBlobIds(appData([topicWithUpload('blob-a')]));
    expect(ids).toEqual(new Set(['blob-a']));
  });

  it('returns an empty set for null data', async () => {
    const { referencedBlobIds } = await import('./gc');
    expect(referencedBlobIds(null).size).toBe(0);
  });
});

describe('sweepUnreferenced', () => {
  it('deletes old unreferenced blobs, keeps referenced and young ones', async () => {
    const { writeBlob, readBlob, GC_GRACE_MS } = await import('./fileBlobStore');
    const { sweepUnreferenced } = await import('./gc');
    const meta = { name: 'f', mime: 'image/png', size: 1 };
    await writeBlob('kept-ref', Buffer.from('a'), meta);
    await writeBlob('kept-young', Buffer.from('b'), meta);
    await writeBlob('gone-old', Buffer.from('c'), meta);
    // Age the old one past the grace period via mtime.
    const old = new Date(Date.now() - GC_GRACE_MS - 60_000);
    await fs.utimes(path.join(dir, 'files', 'gone-old'), old, old);

    const result = await sweepUnreferenced(new Set(['kept-ref']));
    expect(result).toEqual({ scanned: 3, deleted: 1 });
    expect(await readBlob('kept-ref')).not.toBeNull();
    expect(await readBlob('kept-young')).not.toBeNull();
    expect(await readBlob('gone-old')).toBeNull();
    // Meta sidecar removed too.
    await expect(fs.stat(path.join(dir, 'files', 'gone-old.json'))).rejects.toThrow();
  });

  it('returns zeros when the files dir does not exist', async () => {
    const { sweepUnreferenced } = await import('./gc');
    expect(await sweepUnreferenced(new Set())).toEqual({ scanned: 0, deleted: 0 });
  });
});

describe('sweepUnreferenced with a userId', () => {
  it('only touches that user\'s files directory', async () => {
    const { writeBlob, readBlob, GC_GRACE_MS } = await import('./fileBlobStore');
    const { sweepUnreferenced } = await import('./gc');
    const meta = { name: 'f', mime: 'image/png', size: 1 };
    await writeBlob('u1-blob', Buffer.from('a'), meta, 'user-1');
    await writeBlob('u2-blob', Buffer.from('b'), meta, 'user-2');
    const old = new Date(Date.now() - GC_GRACE_MS - 60_000);
    await fs.utimes(path.join(dir, 'users', 'user-1', 'files', 'u1-blob'), old, old);
    await fs.utimes(path.join(dir, 'users', 'user-2', 'files', 'u2-blob'), old, old);

    const result = await sweepUnreferenced(new Set(), Date.now(), 'user-1');
    expect(result).toEqual({ scanned: 1, deleted: 1 });
    expect(await readBlob('u1-blob', 'user-1')).toBeNull();
    expect(await readBlob('u2-blob', 'user-2')).not.toBeNull();
  });
});
