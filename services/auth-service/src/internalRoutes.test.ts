import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { getPool } from './db';
import { createUser } from './userStore';
import { createOrganisation, createGroup, addMembership } from './orgStore';
import { createApp } from './server';

const app = createApp();

beforeEach(async () => {
  process.env.SERVICE_SECRET = 'test-secret';
  await getPool().query('TRUNCATE users CASCADE');
});
afterAll(() => getPool().end());

async function fixture() {
  const admin = await createUser('admin1', 'password123', 'civil-engineering');
  const head = await createUser('coach1', 'password123', 'civil-engineering');
  const student = await createUser('student1', 'password123', 'civil-engineering');
  const org = await createOrganisation('XYZ', admin.id);
  const group = await createGroup(org.id, 'Batch A');
  await addMembership(org.id, group.id, head.id, 'head');
  await addMembership(org.id, group.id, student.id, 'member');
  return { admin, head, student, org, group };
}

describe('internal roster endpoint', () => {
  it('fails closed without configuration or secret', async () => {
    const { group, head } = await fixture();
    delete process.env.SERVICE_SECRET;
    expect((await request(app).get(`/internal/groups/${group.id}/members?requester=${head.id}`)
      .set('x-service-secret', 'anything')).status).toBe(503);
    process.env.SERVICE_SECRET = 'test-secret';
    expect((await request(app).get(`/internal/groups/${group.id}/members?requester=${head.id}`)
      .set('x-service-secret', 'wrong')).status).toBe(401);
    expect((await request(app).get(`/internal/groups/${group.id}/members?requester=${head.id}`)).status).toBe(401);
  });

  it('returns the roster with the requester role resolved', async () => {
    const { group, head, student, admin } = await fixture();
    const get = (requester: string) =>
      request(app).get(`/internal/groups/${group.id}/members?requester=${requester}`).set('x-service-secret', 'test-secret');

    const asHead = await get(head.id);
    expect(asHead.status).toBe(200);
    expect(asHead.body).toEqual({
      requesterRole: 'head',
      group: { id: group.id, name: 'Batch A', orgName: 'XYZ' },
      members: [{ userId: student.id, username: 'student1' }],
    });
    expect((await get(admin.id)).body.requesterRole).toBe('admin');
    expect((await get(student.id)).body.requesterRole).toBeNull(); // members can't coach
  });

  it('404s an unknown group and 400s a missing requester', async () => {
    const { head } = await fixture();
    const missing = await request(app)
      .get(`/internal/groups/00000000-0000-0000-0000-000000000000/members?requester=${head.id}`)
      .set('x-service-secret', 'test-secret');
    expect(missing.status).toBe(404);
    const noRequester = await request(app)
      .get('/internal/groups/00000000-0000-0000-0000-000000000000/members')
      .set('x-service-secret', 'test-secret');
    expect(noRequester.status).toBe(400);
  });
});
