// Content-service's only outbound dependency: asks auth-service who is in a
// group and whether the requester may see it. Cached briefly so one
// dashboard session doesn't hammer auth-service.
import type { GroupRoster } from '@revision-app/shared';

export class AuthServiceError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; roster: GroupRoster }>();

export function _clearRosterCache(): void {
  cache.clear();
}

export async function fetchGroupRoster(groupId: string, requesterId: string): Promise<GroupRoster> {
  const key = `${groupId}:${requesterId}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.roster;

  const secret = process.env.SERVICE_SECRET;
  if (!secret) throw new AuthServiceError('SERVICE_SECRET is not configured', 502);
  const base = process.env.AUTH_SERVICE_URL ?? 'http://127.0.0.1:4001';

  let res: Response;
  try {
    res = await fetch(`${base}/internal/groups/${encodeURIComponent(groupId)}/members?requester=${encodeURIComponent(requesterId)}`, {
      headers: { 'x-service-secret': secret },
    });
  } catch {
    throw new AuthServiceError('authorization service unavailable', 502);
  }
  if (res.status === 404) throw new AuthServiceError('Group not found', 404);
  if (!res.ok) throw new AuthServiceError('authorization service unavailable', 502);

  const roster = (await res.json()) as GroupRoster;
  cache.set(key, { at: Date.now(), roster });
  return roster;
}
