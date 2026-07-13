import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ce-register-'));
  process.env.DATA_DIR = dir;
});
afterEach(async () => {
  delete process.env.DATA_DIR;
  await fs.rm(dir, { recursive: true, force: true });
});

describe('POST /api/auth/register', () => {
  it('creates a user and returns a session token plus a separately-scoped file token, no Set-Cookie', async () => {
    const { POST } = await import('./route');
    const req = new Request('http://test/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username: 'bob', password: 'password123', domain: 'civil-engineering' }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.username).toBe('bob');
    expect(typeof body.token).toBe('string');
    expect(typeof body.fileToken).toBe('string');
    expect(body.token).not.toBe(body.fileToken);
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });

  it('rejects a duplicate username', async () => {
    const { POST } = await import('./route');
    const attempt = () => POST(new Request('http://test/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username: 'bob', password: 'password123', domain: 'civil-engineering' }),
    }));
    await attempt();
    const res = await attempt();
    expect(res.status).toBe(409);
  });
});
