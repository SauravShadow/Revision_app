import { readData } from '@/lib/repository/fileStore';
import { referencedBlobIds, sweepUnreferenced } from '@/lib/repository/gc';
import { getSessionFromRequest } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const session = getSessionFromRequest(req);
  if (!session) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const data = await readData(session.userId);
  const result = await sweepUnreferenced(referencedBlobIds(data), Date.now(), session.userId);
  return Response.json(result);
}
