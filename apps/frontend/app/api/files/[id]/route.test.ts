import { describe, it, expect } from 'vitest';
import { GET, DELETE } from './route';
import { signSession, signFileToken } from '@revision-app/shared/server';

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe('/api/files/[id] auth guard', () => {
  it('GET returns 401 with no auth', async () => {
    const res = await GET(new Request('http://test/api/files/abc123'), ctx('abc123'));
    expect(res.status).toBe(401);
  });

  it('DELETE returns 401 with no auth', async () => {
    const res = await DELETE(new Request('http://test/api/files/abc123'), ctx('abc123'));
    expect(res.status).toBe(401);
  });

  it('GET accepts a full session via Authorization header', async () => {
    const token = signSession({ userId: 'u1', username: 'alice', domain: 'civil-engineering' });
    const req = new Request('http://test/api/files/abc123', { headers: { Authorization: `Bearer ${token}` } });
    const res = await GET(req, ctx('abc123'));
    expect(res.status).toBe(404); // no such blob, but auth passed the guard
  });

  it('GET accepts a file-scoped token via the query string', async () => {
    const token = signFileToken('u1');
    const req = new Request(`http://test/api/files/abc123?token=${token}`);
    const res = await GET(req, ctx('abc123'));
    expect(res.status).toBe(404); // no such blob, but auth passed the guard
  });

  it('GET rejects a full session token presented via the query string', async () => {
    const token = signSession({ userId: 'u1', username: 'alice', domain: 'civil-engineering' });
    const req = new Request(`http://test/api/files/abc123?token=${token}`);
    const res = await GET(req, ctx('abc123'));
    expect(res.status).toBe(401);
  });
});

