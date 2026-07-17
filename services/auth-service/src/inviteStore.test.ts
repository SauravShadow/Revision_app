import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getPool } from './db';
import { createUser } from './userStore';
import { createOrganisation, createGroup, listGroupMembers } from './orgStore';
import { createInviteCode, revokeInviteCode, joinByCode } from './inviteStore';

beforeEach(async () => {
  await getPool().query('TRUNCATE users CASCADE');
});
afterAll(() => getPool().end());

async function setup() {
  const admin = await createUser('admin1', 'password123', 'civil-engineering');
  const org = await createOrganisation('XYZ Academy', admin.id);
  const group = await createGroup(org.id, 'Batch A!');
  return { admin, org, group };
}

describe('inviteStore', () => {
  it('generates a readable prefixed code and joins a student through it', async () => {
    const { admin, org, group } = await setup();
    const student = await createUser('student1', 'password123', 'civil-engineering');
    const code = await createInviteCode(group.id, admin.id);
    expect(code).toMatch(/^BATCHA-[A-Z2-9]{4}$/); // name sanitized, unambiguous alphabet
    const membership = await joinByCode(code, student.id);
    expect(membership).toEqual({
      orgId: org.id, orgName: 'XYZ Academy', groupId: group.id, groupName: 'Batch A!', role: 'member',
    });
    expect(await listGroupMembers(group.id)).toEqual([{ userId: student.id, username: 'student1' }]);
  });

  it('joining twice is a no-op returning the same membership', async () => {
    const { admin, group } = await setup();
    const student = await createUser('student1', 'password123', 'civil-engineering');
    const code = await createInviteCode(group.id, admin.id);
    await joinByCode(code, student.id);
    await joinByCode(code, student.id); // no throw
    expect(await listGroupMembers(group.id)).toHaveLength(1);
  });

  it('rejects unknown, revoked, and expired codes with one uniform error', async () => {
    const { admin, group } = await setup();
    const student = await createUser('student1', 'password123', 'civil-engineering');
    await expect(joinByCode('NOPE-XXXX', student.id)).rejects.toThrow('CODE_INVALID');

    const revoked = await createInviteCode(group.id, admin.id);
    expect(await revokeInviteCode(revoked)).toBe(true);
    await expect(joinByCode(revoked, student.id)).rejects.toThrow('CODE_INVALID');

    const expired = await createInviteCode(group.id, admin.id, Date.now() - 1000);
    await expect(joinByCode(expired, student.id)).rejects.toThrow('CODE_INVALID');
  });

  it('revoking an unknown code returns false', async () => {
    await setup();
    expect(await revokeInviteCode('NOPE-XXXX')).toBe(false);
  });
});
