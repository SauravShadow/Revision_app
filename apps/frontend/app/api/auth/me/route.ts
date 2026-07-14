import { getSessionFromRequest, signSession, signFileToken } from '@revision-app/shared';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const token = signSession(session);
  const fileToken = signFileToken(session.userId);
  return Response.json({ ...session, token, fileToken });
}
