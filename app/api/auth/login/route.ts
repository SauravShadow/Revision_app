import type { NextRequest } from 'next/server';
import { findByUsername, verifyPassword } from '@/lib/auth/userStore';
import { signSession, sessionCookieHeader } from '@/lib/auth/session';

export async function POST(req: NextRequest) {
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
  return Response.json(session, {
    headers: { 'Set-Cookie': sessionCookieHeader(token) },
  });
}
