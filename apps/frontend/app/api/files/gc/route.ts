import { referencedBlobIds } from '@revision-app/shared';
import { getSessionFromRequest } from '@revision-app/shared/server';
import { getAppData } from '@/lib/contentClient';
import { PROXY_TIMEOUT_MS } from '@/lib/serviceProxy';

const FILES_SERVICE_URL = process.env.FILES_SERVICE_URL ?? 'http://127.0.0.1:4003';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const session = getSessionFromRequest(req);
  if (!session) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const data = await getAppData(session.userId);
  const referencedIds = Array.from(referencedBlobIds(data));

  let upstream: Response;
  try {
    upstream = await fetch(`${FILES_SERVICE_URL}/gc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: req.headers.get('Authorization') ?? '' },
      body: JSON.stringify({ referencedIds }),
      signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
    });
  } catch {
    return Response.json({ error: 'files-service unavailable' }, { status: 502 });
  }
  return new Response(await upstream.text(), { status: upstream.status });
}
