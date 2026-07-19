import { it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/serviceProxy', () => ({
  proxyRequest: vi.fn(() => new Response(null, { status: 200 })),
}));

import { proxyRequest } from '@/lib/serviceProxy';
import { GET, DELETE } from './route';

const proxyMock = vi.mocked(proxyRequest);
beforeEach(() => proxyMock.mockClear());

it('forwards the ?token= query string to files-service on GET', async () => {
  // <img>/<iframe> loads carry the token only as a query param (no header),
  // so the gateway must preserve it when proxying.
  const req = new Request('http://gw/api/files/abc?token=T123');
  await GET(req, { params: Promise.resolve({ id: 'abc' }) });
  expect(proxyMock).toHaveBeenCalledWith(req, expect.stringMatching(/\/abc\?token=T123$/));
});

it('proxies GET without a query string unchanged', async () => {
  const req = new Request('http://gw/api/files/abc');
  await GET(req, { params: Promise.resolve({ id: 'abc' }) });
  expect(proxyMock).toHaveBeenCalledWith(req, expect.stringMatching(/\/abc$/));
});

it('forwards the query string on DELETE too', async () => {
  const req = new Request('http://gw/api/files/abc?token=T123', { method: 'DELETE' });
  await DELETE(req, { params: Promise.resolve({ id: 'abc' }) });
  expect(proxyMock).toHaveBeenCalledWith(req, expect.stringMatching(/\/abc\?token=T123$/));
});
