import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getPool } from './db';
import { createUser } from './userStore';
import {
  createOrganisation, createGroup, getGroup, listGroups, addMembership,
  getOrgRole, getGroupRole, hasOrgMembership, listMembershipsForUser,
  listGroupMembers, removeMembership,
} from './orgStore';

beforeEach(async () => {
  await getPool().query('TRUNCATE users CASCADE'); // cascades to org tables via FKs
});
afterAll(() => getPool().end());

async function user(name: string) {
  return createUser(name, 'password123', 'civil-engineering');
}

describe('orgStore', () => {
  it('creates an organisation and makes the creator an org-level admin', async () => {
    const alice = await user('alice');
    const org = await createOrganisation('XYZ Academy', alice.id);
    expect(org.name).toBe('XYZ Academy');
    expect(await getOrgRole(org.id, alice.id)).toBe('admin');
    expect(await getOrgRole(org.id, alice.id)).toBe('admin'); // stable
  });

  it('creates groups, rejects duplicate names per org', async () => {
    const alice = await user('alice');
    const org = await createOrganisation('XYZ', alice.id);
    const g = await createGroup(org.id, 'Batch A');
    expect(g.orgId).toBe(org.id);
    await expect(createGroup(org.id, 'Batch A')).rejects.toThrow('GROUP_NAME_TAKEN');
    expect((await listGroups(org.id)).map((x) => x.name)).toEqual(['Batch A']);
    expect(await getGroup(g.id)).toEqual({ id: g.id, orgId: org.id, name: 'Batch A', orgName: 'XYZ' });
  });

  it('resolves group roles with org admin outranking group rows', async () => {
    const [alice, bob, carol] = [await user('alice'), await user('bob'), await user('carol')];
    const org = await createOrganisation('XYZ', alice.id);
    const g = await createGroup(org.id, 'Batch A');
    await addMembership(org.id, g.id, bob.id, 'head');
    await addMembership(org.id, g.id, carol.id, 'member');
    expect(await getGroupRole(g.id, alice.id)).toBe('admin');  // via org-level row
    expect(await getGroupRole(g.id, bob.id)).toBe('head');
    expect(await getGroupRole(g.id, carol.id)).toBe('member');
    expect(await getGroupRole(g.id, (await user('dave')).id)).toBeNull();
  });

  it('addMembership is idempotent, listGroupMembers returns members only', async () => {
    const alice = await user('alice');
    const carol = await user('carol');
    const org = await createOrganisation('XYZ', alice.id);
    const g = await createGroup(org.id, 'Batch A');
    await addMembership(org.id, g.id, carol.id, 'member');
    await addMembership(org.id, g.id, carol.id, 'member'); // no throw
    const members = await listGroupMembers(g.id);
    expect(members).toEqual([{ userId: carol.id, username: 'carol' }]);
    expect(await hasOrgMembership(org.id, carol.id)).toBe(true);
  });

  it('addMembership never downgrades an existing head back to member', async () => {
    const alice = await user('alice');
    const carol = await user('carol');
    const org = await createOrganisation('XYZ', alice.id);
    const g = await createGroup(org.id, 'Batch A');
    await addMembership(org.id, g.id, carol.id, 'head');
    await addMembership(org.id, g.id, carol.id, 'member'); // simulates re-join via still-valid invite code
    expect(await getGroupRole(g.id, carol.id)).toBe('head');
  });

  it('lists memberships for a user with org and group names', async () => {
    const alice = await user('alice');
    const org = await createOrganisation('XYZ', alice.id);
    const g = await createGroup(org.id, 'Batch A');
    await addMembership(org.id, g.id, alice.id, 'head');
    const ms = await listMembershipsForUser(alice.id);
    expect(ms).toHaveLength(2);
    expect(ms).toContainEqual({ orgId: org.id, orgName: 'XYZ', groupId: null, groupName: null, role: 'admin' });
    expect(ms).toContainEqual({ orgId: org.id, orgName: 'XYZ', groupId: g.id, groupName: 'Batch A', role: 'head' });
  });

  it('removes a group membership', async () => {
    const alice = await user('alice');
    const carol = await user('carol');
    const org = await createOrganisation('XYZ', alice.id);
    const g = await createGroup(org.id, 'Batch A');
    await addMembership(org.id, g.id, carol.id, 'member');
    expect(await removeMembership(g.id, carol.id)).toBe(true);
    expect(await removeMembership(g.id, carol.id)).toBe(false);
    expect(await listGroupMembers(g.id)).toEqual([]);
  });
});
