// Service-to-service API. Auth: shared static secret, checked per request so
// tests (and rotations) can change it without rebuilding the app.
import crypto from 'node:crypto';
import express from 'express';
import { getGroup, getGroupRole, listGroupMembers } from './orgStore';

function secretMatches(given: string | undefined): boolean {
  const expected = process.env.SERVICE_SECRET;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function internalRouter(): express.Router {
  const router = express.Router();

  router.use('/internal', (req, res, next) => {
    if (!process.env.SERVICE_SECRET) {
      return res.status(503).json({ error: 'SERVICE_SECRET is not configured' });
    }
    if (!secretMatches(req.headers['x-service-secret'] as string | undefined)) {
      return res.status(401).json({ error: 'Bad service secret' });
    }
    next();
  });

  router.get('/internal/groups/:id/members', async (req, res) => {
    const requester = typeof req.query.requester === 'string' ? req.query.requester : '';
    if (!requester) return res.status(400).json({ error: 'requester query param is required' });
    try {
      const group = await getGroup(req.params.id);
      if (!group) return res.status(404).json({ error: 'Group not found' });
      const role = await getGroupRole(req.params.id, requester);
      res.json({
        requesterRole: role === 'admin' || role === 'head' ? role : null,
        group: { id: group.id, name: group.name, orgName: group.orgName },
        members: await listGroupMembers(req.params.id),
      });
    } catch (err) {
      console.error('[internal roster]', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  return router;
}
