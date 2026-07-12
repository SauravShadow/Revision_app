import { describe, it, expect, vi, afterEach } from 'vitest';
import { ApiRepository, DATA_ENDPOINT } from './ApiRepository';
import { seedData } from './seed';

afterEach(() => vi.unstubAllGlobals());

describe('ApiRepository', () => {
  it('load returns parsed AppData from the endpoint', async () => {
    const data = seedData();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(data), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const repo = new ApiRepository();
    expect(await repo.load()).toEqual(data);
    expect(fetchMock).toHaveBeenCalledWith(DATA_ENDPOINT, { cache: 'no-store' });
  });

  it('load returns null when the server has no data (null body)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('null', { status: 200 })));
    expect(await new ApiRepository().load()).toBeNull();
  });

  it('load returns null on network error (store will seed)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await new ApiRepository().load()).toBeNull();
  });

  it('save PUTs the data as JSON', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const data = seedData();
    await new ApiRepository().save(data);
    expect(fetchMock).toHaveBeenCalledWith(DATA_ENDPOINT, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    });
  });

  it('save swallows network errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(new ApiRepository().save(seedData())).resolves.toBeUndefined();
  });
});
