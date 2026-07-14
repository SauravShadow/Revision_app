import { createUser } from '@/lib/auth/userStore';
import { signSession, signFileToken } from '@/lib/auth/session';
import type { Domain } from '@/lib/auth/types';
import { DOMAIN_LABELS } from '@/lib/auth/types';

const ALLOW_REGISTRATION = process.env.ALLOW_REGISTRATION !== 'false';

export async function POST(req: Request) {
  if (!ALLOW_REGISTRATION) {
    return Response.json({ error: 'Registration is disabled' }, { status: 403 });
  }

  let body: { username?: string; password?: string; domain?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { username, password, domain } = body;

  if (!username || typeof username !== 'string' || username.trim().length < 3) {
    return Response.json({ error: 'Username must be at least 3 characters' }, { status: 400 });
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    return Response.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
  }
  if (!domain || !(domain in DOMAIN_LABELS)) {
    return Response.json({ error: 'Invalid domain selected' }, { status: 400 });
  }
  // Sanitize username: alphanumeric + underscores only
  if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
    return Response.json(
      { error: 'Username may only contain letters, numbers, and underscores' },
      { status: 400 },
    );
  }

  try {
    const user = await createUser(username.trim(), password, domain as Domain);
    const session = { userId: user.id, username: user.username, domain: user.domain };
    const token = signSession(session);
    const fileToken = signFileToken(user.id);
    return Response.json({ ...session, token, fileToken }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === 'USERNAME_TAKEN') {
      return Response.json({ error: 'Username is already taken' }, { status: 409 });
    }
    console.error('[register]', err);
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}
