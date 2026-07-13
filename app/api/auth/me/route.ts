import type { NextRequest } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }
  return Response.json(session);
}
