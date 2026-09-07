import type { NextRequest } from 'next/server';
import { getSessionFromRequest } from '@revision-app/shared/server';
import { recordKept } from '@/lib/aiClient';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const authHeader = req.headers.get('Authorization') ?? '';
  const body = (await req.json()) as { usageId: number; kept: number };
  await recordKept(body, authHeader);
  return new Response(null, { status: 204 });
}
