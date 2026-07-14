import { referencedBlobIds } from '@revision-app/shared';
import { getSessionFromRequest } from '@revision-app/shared/server';
import { getAppData } from '@/lib/contentClient';
import { sweepUnreferenced } from '@/lib/repository/gc';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const session = getSessionFromRequest(req);
  if (!session) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const data = await getAppData(session.userId);
  const result = await sweepUnreferenced(referencedBlobIds(data), Date.now(), session.userId);
  return Response.json(result);
}
