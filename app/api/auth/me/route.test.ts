import { describe, it, expect } from 'vitest';
import { GET } from './route';
import { signSession } from '@/lib/auth/session';

describe('GET /api/auth/me', () => {
  it('returns the session plus a fresh token and fileToken for a valid Authorization header', async () => {
    const session = { userId: 'u1', username: 'alice', domain: 'civil-engineering' as const };
    const token = signSession(session);
    const req = new Request('http://test/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
    const res = await GET(req);
    const body = await res.json();
    expect(body).toMatchObject(session);
    expect(typeof body.token).toBe('string');
    expect(typeof body.fileToken).toBe('string');
  });

  it('returns 401 with no Authorization header', async () => {
    const res = await GET(new Request('http://test/api/auth/me'));
    expect(res.status).toBe(401);
  });
});
