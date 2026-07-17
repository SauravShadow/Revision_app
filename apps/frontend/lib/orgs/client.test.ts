import { it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ authFetch: vi.fn() }));
vi.mock('@/lib/auth/client', () => ({ authFetch: mocks.authFetch }));

import { fetchMemberships, joinWithCode, fetchCohortStudents } from './client';

beforeEach(() => vi.clearAllMocks());

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

it('fetchMemberships GETs /api/orgs/me', async () => {
  mocks.authFetch.mockResolvedValue(json({ memberships: [] }));
  expect(await fetchMemberships()).toEqual({ memberships: [] });
  expect(mocks.authFetch).toHaveBeenCalledWith('/api/orgs/me');
});

it('joinWithCode POSTs the code and surfaces server errors', async () => {
  mocks.authFetch.mockResolvedValue(json({ error: 'Invalid or expired code' }, 400));
  expect(await joinWithCode('NOPE-XXXX')).toEqual({ error: 'Invalid or expired code' });
  expect(mocks.authFetch).toHaveBeenCalledWith('/api/orgs/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'NOPE-XXXX' }),
  });
});

it('fetchCohortStudents passes page and sort through', async () => {
  mocks.authFetch.mockResolvedValue(json({ page: 2, pageSize: 50, totalMembers: 0, students: [] }));
  await fetchCohortStudents('g1', 2, 'overdue');
  expect(mocks.authFetch).toHaveBeenCalledWith('/api/cohort/groups/g1/students?page=2&sort=overdue');
});
