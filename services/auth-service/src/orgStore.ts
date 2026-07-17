// Organisations → groups → memberships (see db/migrations/0004_organisations.sql).
import { getPool } from './db';
import type { OrgRole, MembershipSummary, RosterMember } from '@revision-app/shared';

export async function createOrganisation(name: string, creatorId: string): Promise<{ id: string; name: string }> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{ id: string; name: string }>(
      'INSERT INTO organisations (name, created_by) VALUES ($1, $2) RETURNING id, name',
      [name, creatorId],
    );
    await client.query(
      `INSERT INTO org_memberships (org_id, group_id, user_id, role) VALUES ($1, NULL, $2, 'admin')`,
      [rows[0].id, creatorId],
    );
    await client.query('COMMIT');
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

export async function createGroup(orgId: string, name: string): Promise<{ id: string; orgId: string; name: string }> {
  try {
    const { rows } = await getPool().query<{ id: string; org_id: string; name: string }>(
      'INSERT INTO org_groups (org_id, name) VALUES ($1, $2) RETURNING id, org_id, name',
      [orgId, name],
    );
    return { id: rows[0].id, orgId: rows[0].org_id, name: rows[0].name };
  } catch (err) {
    if (isUniqueViolation(err)) throw new Error('GROUP_NAME_TAKEN');
    throw err;
  }
}

export async function getGroup(groupId: string): Promise<{ id: string; orgId: string; name: string; orgName: string } | null> {
  const { rows } = await getPool().query<{ id: string; org_id: string; name: string; org_name: string }>(
    `SELECT g.id, g.org_id, g.name, o.name AS org_name
     FROM org_groups g JOIN organisations o ON o.id = g.org_id
     WHERE g.id = $1`,
    [groupId],
  );
  return rows[0] ? { id: rows[0].id, orgId: rows[0].org_id, name: rows[0].name, orgName: rows[0].org_name } : null;
}

export async function listGroups(orgId: string): Promise<{ id: string; name: string }[]> {
  const { rows } = await getPool().query<{ id: string; name: string }>(
    'SELECT id, name FROM org_groups WHERE org_id = $1 ORDER BY name',
    [orgId],
  );
  return rows;
}

export async function addMembership(orgId: string, groupId: string | null, userId: string, role: OrgRole): Promise<void> {
  await getPool().query(
    `INSERT INTO org_memberships (org_id, group_id, user_id, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (org_id, group_id, user_id) DO NOTHING`,
    [orgId, groupId, userId, role],
  );
}

export async function getOrgRole(orgId: string, userId: string): Promise<'admin' | null> {
  const { rows } = await getPool().query(
    `SELECT 1 FROM org_memberships WHERE org_id = $1 AND user_id = $2 AND group_id IS NULL AND role = 'admin'`,
    [orgId, userId],
  );
  return rows.length > 0 ? 'admin' : null;
}

export async function getGroupRole(groupId: string, userId: string): Promise<OrgRole | null> {
  const { rows } = await getPool().query<{ role: OrgRole }>(
    `SELECT m.role FROM org_memberships m
     JOIN org_groups g ON g.id = $1
     WHERE m.user_id = $2
       AND (m.group_id = g.id OR (m.org_id = g.org_id AND m.group_id IS NULL AND m.role = 'admin'))
     ORDER BY CASE m.role WHEN 'admin' THEN 0 WHEN 'head' THEN 1 ELSE 2 END
     LIMIT 1`,
    [groupId, userId],
  );
  return rows[0]?.role ?? null;
}

export async function hasOrgMembership(orgId: string, userId: string): Promise<boolean> {
  const { rows } = await getPool().query(
    'SELECT 1 FROM org_memberships WHERE org_id = $1 AND user_id = $2 LIMIT 1',
    [orgId, userId],
  );
  return rows.length > 0;
}

export async function listMembershipsForUser(userId: string): Promise<MembershipSummary[]> {
  const { rows } = await getPool().query<{
    org_id: string; org_name: string; group_id: string | null; group_name: string | null; role: OrgRole;
  }>(
    `SELECT m.org_id, o.name AS org_name, m.group_id, g.name AS group_name, m.role
     FROM org_memberships m
     JOIN organisations o ON o.id = m.org_id
     LEFT JOIN org_groups g ON g.id = m.group_id
     WHERE m.user_id = $1
     ORDER BY o.name, g.name NULLS FIRST`,
    [userId],
  );
  return rows.map((r) => ({ orgId: r.org_id, orgName: r.org_name, groupId: r.group_id, groupName: r.group_name, role: r.role }));
}

export async function listGroupMembers(groupId: string): Promise<RosterMember[]> {
  const { rows } = await getPool().query<{ user_id: string; username: string }>(
    `SELECT m.user_id, u.username
     FROM org_memberships m JOIN users u ON u.id = m.user_id
     WHERE m.group_id = $1 AND m.role = 'member'
     ORDER BY u.username_lower`,
    [groupId],
  );
  return rows.map((r) => ({ userId: r.user_id, username: r.username }));
}

export async function removeMembership(groupId: string, userId: string): Promise<boolean> {
  const { rowCount } = await getPool().query(
    'DELETE FROM org_memberships WHERE group_id = $1 AND user_id = $2',
    [groupId, userId],
  );
  return (rowCount ?? 0) > 0;
}
