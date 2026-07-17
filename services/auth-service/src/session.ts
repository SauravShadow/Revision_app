import type express from 'express';
import { verifySession } from '@revision-app/shared/server';

// Express's req.headers.authorization is a plain string, not a Fetch
// Request — getSessionFromRequest (Fetch-shaped) doesn't apply here.
export function sessionFrom(req: express.Request) {
  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  return token ? verifySession(token) : null;
}
