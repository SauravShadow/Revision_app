import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ce-login-'));
  process.env.DATA_DIR = dir;
});
afterEach(async () => {
  delete process.env.DATA_DIR;
  await fs.rm(dir, { recursive: true, force: true });
});

describe('POST /api/auth/login', () => {
  it('returns a session token and a separately-scoped file token, and no Set-Cookie header', async () => {
    const { createUser } = await import('@/lib/auth/userStore');
    const { POST } = await import('./route');
    await createUser('alice', 'password123', 'civil-engineering');

    const req = new Request('http://test/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'alice', password: 'password123' }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(body.username).toBe('alice');
    expect(typeof body.token).toBe('string');
    expect(typeof body.fileToken).toBe('string');
    expect(body.token).not.toBe(body.fileToken);
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });

  it('rejects a wrong password', async () => {
    const { createUser } = await import('@/lib/auth/userStore');
    const { POST } = await import('./route');
    await createUser('alice', 'password123', 'civil-engineering');

    const req = new Request('http://test/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'alice', password: 'wrong' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});
