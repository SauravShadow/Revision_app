import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getPool } from '@/lib/db/pool';

beforeEach(async () => {
  await getPool().query('TRUNCATE users CASCADE');
});

afterAll(() => getPool().end());

describe('POST /api/auth/register', () => {
  it('creates a user and returns a session token plus a separately-scoped file token, no Set-Cookie', async () => {
    const { POST } = await import('./route');
    const req = new Request('http://test/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username: 'registertest1', password: 'password123', domain: 'civil-engineering' }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.username).toBe('registertest1');
    expect(typeof body.token).toBe('string');
    expect(typeof body.fileToken).toBe('string');
    expect(body.token).not.toBe(body.fileToken);
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });

  it('rejects a duplicate username', async () => {
    const { POST } = await import('./route');
    const attempt = () => POST(new Request('http://test/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username: 'registerduptest', password: 'password123', domain: 'civil-engineering' }),
    }));
    await attempt();
    const res = await attempt();
    expect(res.status).toBe(409);
  });
});
