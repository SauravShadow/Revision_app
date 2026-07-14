import type { NextRequest } from 'next/server';
import type { AppData } from '@revision-app/shared';
import { getAppData, putAppData } from '@/lib/contentClient';
import { getSessionFromRequest } from '@revision-app/shared/server';
import { seedDataForDomain } from '@/lib/repository/seed';

// Reads/writes app data (local Postgres today; content-service over HTTP
// once extracted), so this route must never be statically cached.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const data = await getAppData(session.userId);
  if (!data) {
    // First-ever load for this user: seed their domain data and persist it.
    const seeded = seedDataForDomain(session.domain);
    await putAppData(session.userId, seeded);
    return Response.json(seeded);
  }
  return Response.json(data);
}

export async function PUT(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const body = (await req.json()) as AppData;
  await putAppData(session.userId, body);
  return new Response(null, { status: 204 });
}
