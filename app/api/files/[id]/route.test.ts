import { describe, it, expect } from 'vitest';
import { GET, DELETE } from './route';

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe('/api/files/[id] auth guard', () => {
  it('GET returns 401 when no session cookie', async () => {
    const res = await GET(new Request('http://test/api/files/abc123'), ctx('abc123'));
    expect(res.status).toBe(401);
  });

  it('DELETE returns 401 when no session cookie', async () => {
    const res = await DELETE(new Request('http://test/api/files/abc123'), ctx('abc123'));
    expect(res.status).toBe(401);
  });
});

