import { findByUsername, verifyPassword } from '@/lib/auth/userStore';
import { signSession, signFileToken } from '@revision-app/shared';

export async function POST(req: Request) {
  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { username, password } = body;
  if (!username || !password) {
    return Response.json({ error: 'Username and password are required' }, { status: 400 });
  }

  const user = await findByUsername(username);
  if (!user) {
    // Return same error for invalid username or wrong password (prevents enumeration)
    return Response.json({ error: 'Invalid username or password' }, { status: 401 });
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return Response.json({ error: 'Invalid username or password' }, { status: 401 });
  }

  const session = { userId: user.id, username: user.username, domain: user.domain };
  const token = signSession(session);
  const fileToken = signFileToken(user.id);
  return Response.json({ ...session, token, fileToken });
}
