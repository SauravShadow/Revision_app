import type { NextRequest } from 'next/server';
import type { AppData } from '@revision-app/shared';
import { getAppData, putAppData, ContentServiceError } from '@/lib/contentClient';
import { getSessionFromRequest } from '@revision-app/shared/server';
import { seedDataForDomain } from '@/lib/repository/seed';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const authHeader = req.headers.get('Authorization') ?? '';
  try {
    const data = await getAppData(session.userId, authHeader);
    if (!data) {
      const seeded = seedDataForDomain(session.domain);
      await putAppData(seeded, authHeader);
      return Response.json(seeded);
    }
    return Response.json(data);
  } catch (err) {
    if (err instanceof ContentServiceError) return Response.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

export async function PUT(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const authHeader = req.headers.get('Authorization') ?? '';
  const body = (await req.json()) as AppData;
  try {
    await putAppData(body, authHeader);
    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof ContentServiceError) return Response.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
