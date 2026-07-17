import { authFetch } from '@/lib/auth/client';
import type { CohortStudentRow, CohortSummary, MembershipSummary, StudentDrilldown } from '@revision-app/shared';

async function parse<T>(res: Response): Promise<T | { error: string }> {
  if (res.status === 204) return { ok: true } as T;
  const body = await res.json().catch(() => ({ error: 'Unexpected server response' }));
  if (!res.ok) return { error: (body as { error?: string }).error ?? 'Request failed' };
  return body as T;
}

const post = (url: string, body: unknown) =>
  authFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export function fetchMemberships() {
  return authFetch('/api/orgs/me').then((r) => parse<{ memberships: MembershipSummary[] }>(r));
}
export function createOrganisation(name: string) {
  return post('/api/orgs', { name }).then((r) => parse<{ id: string; name: string }>(r));
}
export function joinWithCode(code: string) {
  return post('/api/orgs/join', { code }).then((r) => parse<{ membership: MembershipSummary }>(r));
}
export function createGroup(orgId: string, name: string) {
  return post(`/api/orgs/${orgId}/groups`, { name }).then((r) => parse<{ id: string; name: string }>(r));
}
export function listGroups(orgId: string) {
  return authFetch(`/api/orgs/${orgId}/groups`).then((r) => parse<{ groups: { id: string; name: string }[] }>(r));
}
export function createInviteCode(groupId: string) {
  return post(`/api/groups/${groupId}/invite-codes`, {}).then((r) => parse<{ code: string }>(r));
}
export function assignHead(groupId: string, username: string) {
  return post(`/api/groups/${groupId}/heads`, { username }).then((r) => parse<{ message: string }>(r));
}
export function leaveGroup(groupId: string, userId: string) {
  return authFetch(`/api/groups/${groupId}/members/${userId}`, { method: 'DELETE' }).then((r) => parse<{ ok: true }>(r));
}
export function fetchCohortSummary(groupId: string) {
  return authFetch(`/api/cohort/groups/${groupId}/summary`).then((r) => parse<CohortSummary>(r));
}
export function fetchCohortStudents(groupId: string, page: number, sort: 'completion' | 'overdue') {
  return authFetch(`/api/cohort/groups/${groupId}/students?page=${page}&sort=${sort}`)
    .then((r) => parse<{ page: number; pageSize: number; totalMembers: number; students: CohortStudentRow[] }>(r));
}
export function fetchStudentDrilldown(groupId: string, userId: string) {
  return authFetch(`/api/cohort/groups/${groupId}/students/${userId}`).then((r) => parse<StudentDrilldown>(r));
}
