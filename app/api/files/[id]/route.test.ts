import { describe, it, expect } from 'vitest';
import { GET, DELETE } from './route';

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe('/api/files/[id] traversal guard', () => {
  it('GET returns 400 for a traversal id', async () => {
    const res = await GET(new Request('http://test/api/files/x'), ctx('../appdata.json'));
    expect(res.status).toBe(400);
  });

  it('DELETE returns 400 for a traversal id', async () => {
    const res = await DELETE(new Request('http://test/api/files/x'), ctx('../appdata.json'));
    expect(res.status).toBe(400);
  });
});
