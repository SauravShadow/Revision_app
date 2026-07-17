import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { signSession } from '@revision-app/shared/server';
import { getPool } from './db';
import { createUser } from './userStore';
import { createApp } from './server';
import { _resetJoinRateLimit } from './orgRoutes';

const app = createApp();

beforeEach(async () => {
  await getPool().query('TRUNCATE users CASCADE');
  _resetJoinRateLimit();
});
afterAll(() => getPool().end());

async function actor(name: string) {
  const u = await createUser(name, 'password123', 'civil-engineering');
  return { ...u, token: signSession({ userId: u.id, username: u.username, domain: u.domain }) };
}
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

async function coachedGroup() {
  const admin = await actor('admin1');
  const org = (await request(app).post('/orgs').set(auth(admin.token)).send({ name: 'XYZ Academy' })).body;
  const group = (await request(app).post(`/orgs/${org.id}/groups`).set(auth(admin.token)).send({ name: 'Batch A' })).body;
  const invite = (await request(app).post(`/groups/${group.id}/invite-codes`).set(auth(admin.token)).send({})).body;
  return { admin, org, group, invite };
}

describe('org routes', () => {
  it('401s every org endpoint without a token', async () => {
    for (const [method, path] of [
      ['post', '/orgs'], ['get', '/me/orgs'], ['post', '/orgs/join'],
    ] as const) {
      const res = await (request(app) as any)[method](path).send({});
      expect(res.status, `${method} ${path}`).toBe(401);
    }
  });

  it('creates an org, group, and invite; student joins by code', async () => {
    const { org, group, invite } = await coachedGroup();
    expect(invite.code).toMatch(/^BATCHA-/);
    const student = await actor('student1');
    const join = await request(app).post('/orgs/join').set(auth(student.token)).send({ code: invite.code });
    expect(join.status).toBe(200);
    expect(join.body.membership).toMatchObject({ orgId: org.id, groupId: group.id, role: 'member' });
    const me = await request(app).get('/me/orgs').set(auth(student.token));
    expect(me.body.memberships).toHaveLength(1);
  });

  it('enforces the authorization matrix on group management', async () => {
    const { org, group, invite } = await coachedGroup();
    const student = await actor('student1');
    await request(app).post('/orgs/join').set(auth(student.token)).send({ code: invite.code });
    const outsider = await actor('outsider');

    // students and outsiders cannot manage
    for (const t of [student.token, outsider.token]) {
      expect((await request(app).post(`/orgs/${org.id}/groups`).set(auth(t)).send({ name: 'B' })).status).toBe(403);
      expect((await request(app).get(`/orgs/${org.id}/groups`).set(auth(t))).status).toBe(403);
      expect((await request(app).post(`/groups/${group.id}/invite-codes`).set(auth(t)).send({})).status).toBe(403);
      expect((await request(app).post(`/groups/${group.id}/heads`).set(auth(t)).send({ username: 'student1' })).status).toBe(403);
    }
  });

  it('promotes an org member to head; head can then mint invite codes', async () => {
    const { admin, group, invite } = await coachedGroup();
    const coach = await actor('coach1');
    await request(app).post('/orgs/join').set(auth(coach.token)).send({ code: invite.code });
    const promote = await request(app).post(`/groups/${group.id}/heads`).set(auth(admin.token)).send({ username: 'coach1' });
    expect(promote.status).toBe(200);
    expect((await request(app).post(`/groups/${group.id}/invite-codes`).set(auth(coach.token)).send({})).status).toBe(201);
    // non-member cannot be promoted
    await actor('stranger');
    expect((await request(app).post(`/groups/${group.id}/heads`).set(auth(admin.token)).send({ username: 'stranger' })).status).toBe(400);
  });

  it('revokes an invite code, after which joining fails uniformly', async () => {
    const { admin, invite } = await coachedGroup();
    expect((await request(app).delete(`/invite-codes/${invite.code}`).set(auth(admin.token))).status).toBe(204);
    const student = await actor('student1');
    const join = await request(app).post('/orgs/join').set(auth(student.token)).send({ code: invite.code });
    expect(join.status).toBe(400);
    expect(join.body.error).toBe('Invalid or expired code');
  });

  it('lets a student leave and an admin remove, but not strangers', async () => {
    const { admin, group, invite } = await coachedGroup();
    const student = await actor('student1');
    await request(app).post('/orgs/join').set(auth(student.token)).send({ code: invite.code });
    const outsider = await actor('outsider');
    expect((await request(app).delete(`/groups/${group.id}/members/${student.id}`).set(auth(outsider.token))).status).toBe(403);
    expect((await request(app).delete(`/groups/${group.id}/members/${student.id}`).set(auth(student.token))).status).toBe(204);
    // re-join, then admin removes
    await request(app).post('/orgs/join').set(auth(student.token)).send({ code: invite.code });
    expect((await request(app).delete(`/groups/${group.id}/members/${student.id}`).set(auth(admin.token))).status).toBe(204);
    expect((await request(app).delete(`/groups/${group.id}/members/${student.id}`).set(auth(admin.token))).status).toBe(404);
  });

  it('rate-limits join attempts to 10/minute per user', async () => {
    const student = await actor('student1');
    for (let i = 0; i < 10; i++) {
      await request(app).post('/orgs/join').set(auth(student.token)).send({ code: 'WRONG-XXXX' });
    }
    const eleventh = await request(app).post('/orgs/join').set(auth(student.token)).send({ code: 'WRONG-XXXX' });
    expect(eleventh.status).toBe(429);
  });
});
