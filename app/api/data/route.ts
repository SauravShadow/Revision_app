import type { NextRequest } from 'next/server';
import type { AppData } from '@/lib/domain/types';
import { readData, writeData } from '@/lib/repository/fileStore';
import { getSessionFromRequest } from '@/lib/auth/session';
import { seedDataForDomain } from '@/lib/repository/seed';

// Reads/writes a file on disk, so this route must never be statically cached.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const data = await readData(session.userId);
  if (!data) {
    // First-ever load for this user: seed their domain data and persist it.
    const seeded = seedDataForDomain(session.domain);
    await writeData(seeded, session.userId);
    return Response.json(seeded);
  }
  return Response.json(data);
}

export async function PUT(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const body = (await req.json()) as AppData;
  await writeData(body, session.userId);
  return new Response(null, { status: 204 });
}

