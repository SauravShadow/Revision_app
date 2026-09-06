import type express from 'express';
import { verifySession } from '@revision-app/shared/server';

export function sessionUserId(req: express.Request): { userId: string; domain: string } | null {
  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  if (!token) return null;
  const session = verifySession(token);
  return session ? { userId: session.userId, domain: session.domain } : null;
}
