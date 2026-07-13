import { describe, it, expect, beforeEach } from 'vitest';
import { getPool } from '@/lib/db/pool';

beforeEach(async () => {
  await getPool().query('TRUNCATE users CASCADE');
});

describe('POST /api/auth/login', () => {
  it('returns a session token and a separately-scoped file token, and no Set-Cookie header', async () => {
    const { createUser } = await import('@/lib/auth/userStore');
    const { POST } = await import('./route');
    await createUser('logintest1', 'password123', 'civil-engineering');

    const req = new Request('http://test/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'logintest1', password: 'password123' }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(body.username).toBe('logintest1');
    expect(typeof body.token).toBe('string');
    expect(typeof body.fileToken).toBe('string');
    expect(body.token).not.toBe(body.fileToken);
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });

  it('rejects a wrong password', async () => {
    const { createUser } = await import('@/lib/auth/userStore');
    const { POST } = await import('./route');
    await createUser('logintest2', 'password123', 'civil-engineering');

    const req = new Request('http://test/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'logintest2', password: 'wrong' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});
