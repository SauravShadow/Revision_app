import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { signSession } from '@revision-app/shared/server';

const USER_1_ID = '11111111-1111-1111-1111-111111111111';
const USER_2_ID = '22222222-2222-2222-2222-222222222222';

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
    await writeBlob('u1-blob', Buffer.from('a'), meta, USER_1_ID);
    await writeBlob('u2-blob', Buffer.from('b'), meta, USER_2_ID);
    const old = new Date(Date.now() - GC_GRACE_MS - 60_000);
    await fs.utimes(path.join(dir, 'users', USER_1_ID, 'files', 'u1-blob'), old, old);
    await fs.utimes(path.join(dir, 'users', USER_2_ID, 'files', 'u2-blob'), old, old);

    const token = signSession({ userId: USER_1_ID, username: 'alice', domain: 'civil-engineering' });
    const req = new Request('http://test/api/files/gc', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const res = await POST(req);
    expect(await res.json()).toEqual({ scanned: 1, deleted: 1 });
    expect(await readBlob('u1-blob', USER_1_ID)).toBeNull();
    expect(await readBlob('u2-blob', USER_2_ID)).not.toBeNull();
  });
});
