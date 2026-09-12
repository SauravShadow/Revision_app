import type { NextRequest } from 'next/server';
import { getSessionFromRequest } from '@revision-app/shared/server';
import { generateFlashcards, AiServiceError, type GenerateBody } from '@/lib/aiClient';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const authHeader = req.headers.get('Authorization') ?? '';
  const body = (await req.json()) as GenerateBody;
  try {
    return Response.json(await generateFlashcards(body, authHeader));
  } catch (err) {
    if (err instanceof AiServiceError) return Response.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
