import express from 'express';
import { sessionFrom } from './session';
import {
  createOrganisation, createGroup, getGroup, listGroups, addMembership,
  getOrgRole, getGroupRole, hasOrgMembership, listMembershipsForUser, removeMembership,
} from './orgStore';
import { createInviteCode, revokeInviteCode, joinByCode, getInviteCodeGroup } from './inviteStore';
import { findByUsername } from './userStore';

// ── join rate limit: 10 attempts / user / minute, in-memory ────────────────
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 10;
const joinAttempts = new Map<string, number[]>();
export function _resetJoinRateLimit(): void {
  joinAttempts.clear();
}
function joinAllowed(userId: string): boolean {
  const now = Date.now();
  const recent = (joinAttempts.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  joinAttempts.set(userId, recent);
  return recent.length <= MAX_ATTEMPTS;
}

export function orgRouter(): express.Router {
  const router = express.Router();

  // Every route here requires a session.
  router.use((req, res, next) => {
    const session = sessionFrom(req);
    if (!session) return res.status(401).json({ error: 'Not authenticated' });
    res.locals.session = session;
    next();
  });

  const wrap = (fn: express.RequestHandler): express.RequestHandler =>
    async (req, res, next) => {
      try {
        await fn(req, res, next);
      } catch (err) {
        console.error(`[org] ${req.method} ${req.path}`, err);
        res.status(500).json({ error: 'Server error' });
      }
    };

  router.post('/orgs', wrap(async (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (name.length < 3) return res.status(400).json({ error: 'Organisation name must be at least 3 characters' });
    const org = await createOrganisation(name, res.locals.session.userId);
    res.status(201).json(org);
  }));

  router.get('/me/orgs', wrap(async (_req, res) => {
    res.json({ memberships: await listMembershipsForUser(res.locals.session.userId) });
  }));

  router.post('/orgs/:id/groups', wrap(async (req, res) => {
    if (!(await getOrgRole(req.params.id, res.locals.session.userId))) {
      return res.status(403).json({ error: 'Only an organisation admin can do that' });
    }
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (name.length < 1) return res.status(400).json({ error: 'Group name is required' });
    try {
      const group = await createGroup(req.params.id, name);
      res.status(201).json({ id: group.id, name: group.name });
    } catch (err) {
      if (err instanceof Error && err.message === 'GROUP_NAME_TAKEN') {
        return res.status(409).json({ error: 'A group with that name already exists' });
      }
      throw err;
    }
  }));

  router.get('/orgs/:id/groups', wrap(async (req, res) => {
    if (!(await getOrgRole(req.params.id, res.locals.session.userId))) {
      return res.status(403).json({ error: 'Only an organisation admin can do that' });
    }
    res.json({ groups: await listGroups(req.params.id) });
  }));

  router.post('/groups/:id/heads', wrap(async (req, res) => {
    const group = await getGroup(req.params.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    if (!(await getOrgRole(group.orgId, res.locals.session.userId))) {
      return res.status(403).json({ error: 'Only an organisation admin can do that' });
    }
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const target = username ? await findByUsername(username) : null;
    if (!target) return res.status(404).json({ error: 'No such user' });
    if (!(await hasOrgMembership(group.orgId, target.id))) {
      return res.status(400).json({ error: 'User is not a member of this organisation' });
    }
    await addMembership(group.orgId, group.id, target.id, 'head');
    res.json({ message: `${target.username} is now a head of ${group.name}` });
  }));

  router.post('/groups/:id/invite-codes', wrap(async (req, res) => {
    const role = await getGroupRole(req.params.id, res.locals.session.userId);
    if (role !== 'admin' && role !== 'head') {
      return res.status(403).json({ error: 'Only a group head or organisation admin can do that' });
    }
    const days = typeof req.body?.expiresInDays === 'number' ? req.body.expiresInDays : null;
    const expiresAt = days && days > 0 ? Date.now() + days * 24 * 60 * 60 * 1000 : null;
    const code = await createInviteCode(req.params.id, res.locals.session.userId, expiresAt);
    res.status(201).json({ code, expiresAt });
  }));

  router.delete('/invite-codes/:code', wrap(async (req, res) => {
    const groupId = await getInviteCodeGroup(req.params.code);
    if (!groupId) return res.status(404).json({ error: 'No such code' });
    const role = await getGroupRole(groupId, res.locals.session.userId);
    if (role !== 'admin' && role !== 'head') {
      return res.status(403).json({ error: 'Only a group head or organisation admin can do that' });
    }
    await revokeInviteCode(req.params.code);
    res.status(204).end();
  }));

  router.post('/orgs/join', wrap(async (req, res) => {
    const userId = res.locals.session.userId;
    if (!joinAllowed(userId)) {
      return res.status(429).json({ error: 'Too many join attempts — try again in a minute' });
    }
    const code = typeof req.body?.code === 'string' ? req.body.code.trim().toUpperCase() : '';
    if (!code) return res.status(400).json({ error: 'Invite code is required' });
    try {
      const membership = await joinByCode(code, userId);
      res.json({ membership });
    } catch (err) {
      if (err instanceof Error && err.message === 'CODE_INVALID') {
        return res.status(400).json({ error: 'Invalid or expired code' });
      }
      throw err;
    }
  }));

  router.delete('/groups/:gid/members/:uid', wrap(async (req, res) => {
    const requester = res.locals.session.userId;
    if (requester !== req.params.uid) {
      const role = await getGroupRole(req.params.gid, requester);
      if (role !== 'admin' && role !== 'head') {
        return res.status(403).json({ error: 'Only a group head or organisation admin can do that' });
      }
    }
    const removed = await removeMembership(req.params.gid, req.params.uid);
    if (!removed) return res.status(404).json({ error: 'No such membership' });
    res.status(204).end();
  }));

  return router;
}
