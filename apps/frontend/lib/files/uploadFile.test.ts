import { it, expect, vi, afterEach, beforeEach } from 'vitest';
import { uploadFile, mimeToKind } from './uploadFile';
import { setStoredToken } from '@/lib/auth/client';

beforeEach(() => window.sessionStorage.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

it('mimeToKind maps pdf and images', () => {
  expect(mimeToKind('application/pdf')).toBe('pdf');
  expect(mimeToKind('image/png')).toBe('image');
});

it('uploadFile maps the server response to an Attachment', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(
    JSON.stringify({ id: 'x1', url: '/api/files/x1', name: 'p.png', mime: 'image/png', size: 12 }),
    { status: 200 },
  )));
  const file = { name: 'p.png', type: 'image/png', size: 12 } as unknown as File;
  const att = await uploadFile(file);
  expect(att).toMatchObject({ id: 'x1', kind: 'image', url: '/api/files/x1', name: 'p.png', mime: 'image/png', size: 12 });
  expect(att.createdAt).toBeTypeOf('number');
});

it('uploadFile throws on a failed upload', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('bad', { status: 400 })));
  const file = { name: 'p.png', type: 'image/png', size: 12 } as unknown as File;
  await expect(uploadFile(file)).rejects.toThrow();
});

it('uploadFile sends the stored session token as a Bearer Authorization header', async () => {
  setStoredToken('tok789');
  const fetchMock = vi.fn<typeof fetch>(async () => new Response(
    JSON.stringify({ id: 'x1', url: '/api/files/x1', name: 'p.png', mime: 'image/png', size: 12 }),
    { status: 200 },
  ));
  vi.stubGlobal('fetch', fetchMock);
  const file = { name: 'p.png', type: 'image/png', size: 12 } as unknown as File;
  await uploadFile(file);
  const headers = fetchMock.mock.calls[0][1]?.headers as Headers;
  expect(headers.get('Authorization')).toBe('Bearer tok789');
});
