import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchGroupRoster, AuthServiceError, _clearRosterCache } from './authClient';

const ROSTER = {
  requesterRole: 'head',
  group: { id: 'g1', name: 'Batch A', orgName: 'XYZ' },
  members: [{ userId: 'u1', username: 'student1' }],
};

beforeEach(() => {
  process.env.AUTH_SERVICE_URL = 'http://127.0.0.1:4001';
  process.env.SERVICE_SECRET = 'test-secret';
  _clearRosterCache();
});
afterEach(() => vi.unstubAllGlobals());

describe('fetchGroupRoster', () => {
  it('calls the internal endpoint with the secret and caches for 60s', async () => {
    const mock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(ROSTER), { status: 200 }))
    );
    vi.stubGlobal('fetch', mock);
    const first = await fetchGroupRoster('g1', 'coach');
    expect(first).toEqual(ROSTER);
    expect(mock).toHaveBeenCalledWith(
      'http://127.0.0.1:4001/internal/groups/g1/members?requester=coach',
      { headers: { 'x-service-secret': 'test-secret' } },
    );
    await fetchGroupRoster('g1', 'coach'); // served from cache
    expect(mock).toHaveBeenCalledTimes(1);
    await fetchGroupRoster('g1', 'other-coach'); // different requester → new call
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it('percent-encodes ids so they cannot break out of the URL', async () => {
    const mock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(ROSTER), { status: 200 }))
    );
    vi.stubGlobal('fetch', mock);
    await fetchGroupRoster('g/1', 'coach x');
    expect(mock).toHaveBeenCalledWith(
      'http://127.0.0.1:4001/internal/groups/g%2F1/members?requester=coach%20x',
      { headers: { 'x-service-secret': 'test-secret' } },
    );
  });

  it('maps auth-service failures to AuthServiceError with the right status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
      Promise.resolve(new Response('{}', { status: 404 }))
    ));
    await expect(fetchGroupRoster('gX', 'coach')).rejects.toMatchObject({ status: 404 });

    _clearRosterCache();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    await expect(fetchGroupRoster('gY', 'coach')).rejects.toMatchObject({ status: 502 });
  });

  it('fails closed when SERVICE_SECRET is missing', async () => {
    delete process.env.SERVICE_SECRET;
    await expect(fetchGroupRoster('g1', 'coach')).rejects.toBeInstanceOf(AuthServiceError);
  });
});
