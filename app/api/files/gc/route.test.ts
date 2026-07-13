import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { signSession } from '@/lib/auth/session';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ce-gc-route-'));
  process.env.DATA_DIR = dir;
});
afterEach(async () => {
  delete process.env.DATA_DIR;
  await fs.rm(dir, { recursive: true, force: true });
});

describe('POST /api/files/gc', () => {
  it('returns 401 with no session', async () => {
    const { POST } = await import('./route');
    const res = await POST(new Request('http://test/api/files/gc', { method: 'POST' }));
    expect(res.status).toBe(401);
  });

  it('only sweeps the authenticated user\'s files', async () => {
    const { writeBlob, readBlob, GC_GRACE_MS } = await import('@/lib/repository/fileBlobStore');
    const { POST } = await import('./route');
    const meta = { name: 'f', mime: 'image/png', size: 1 };
    await writeBlob('u1-blob', Buffer.from('a'), meta, 'user-1');
    await writeBlob('u2-blob', Buffer.from('b'), meta, 'user-2');
    const old = new Date(Date.now() - GC_GRACE_MS - 60_000);
    await fs.utimes(path.join(dir, 'users', 'user-1', 'files', 'u1-blob'), old, old);
    await fs.utimes(path.join(dir, 'users', 'user-2', 'files', 'u2-blob'), old, old);

    const token = signSession({ userId: 'user-1', username: 'alice', domain: 'civil-engineering' });
    const req = new Request('http://test/api/files/gc', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const res = await POST(req);
    expect(await res.json()).toEqual({ scanned: 1, deleted: 1 });
    expect(await readBlob('u1-blob', 'user-1')).toBeNull();
    expect(await readBlob('u2-blob', 'user-2')).not.toBeNull();
  });
});
