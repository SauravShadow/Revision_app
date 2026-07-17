// Invite-code lifecycle. Codes are multi-use until revoked/expired; joining
// creates an idempotent 'member' membership in the code's group.
import crypto from 'node:crypto';
import { getPool } from './db';
import { addMembership, getGroup } from './orgStore';
import type { MembershipSummary } from '@revision-app/shared';

// No 0/O/1/I/L — codes get read aloud and typed.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomSuffix(len: number): string {
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return out;
}

export async function createInviteCode(groupId: string, createdBy: string, expiresAt?: number | null): Promise<string> {
  const group = await getGroup(groupId);
  if (!group) throw new Error('GROUP_NOT_FOUND');
  const prefix = group.name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'GROUP';
  // PK collision on the random suffix is astronomically rare but cheap to retry.
  for (let attempt = 0; ; attempt++) {
    const code = `${prefix}-${randomSuffix(4)}`;
    try {
      await getPool().query(
        'INSERT INTO invite_codes (code, group_id, created_by, expires_at) VALUES ($1, $2, $3, $4)',
        [code, groupId, createdBy, expiresAt ? new Date(expiresAt) : null],
      );
      return code;
    } catch (err) {
      const unique = typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
      if (!unique || attempt >= 4) throw err;
    }
  }
}

export async function revokeInviteCode(code: string): Promise<boolean> {
  const { rowCount } = await getPool().query(
    'UPDATE invite_codes SET revoked_at = now() WHERE code = $1 AND revoked_at IS NULL',
    [code],
  );
  return (rowCount ?? 0) > 0;
}

export async function joinByCode(code: string, userId: string): Promise<MembershipSummary> {
  const { rows } = await getPool().query<{ group_id: string }>(
    `SELECT group_id FROM invite_codes
     WHERE code = $1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())`,
    [code],
  );
  if (!rows[0]) throw new Error('CODE_INVALID');
  const group = await getGroup(rows[0].group_id);
  if (!group) throw new Error('CODE_INVALID'); // group deleted after code issued
  await addMembership(group.orgId, group.id, userId, 'member');
  return { orgId: group.orgId, orgName: group.orgName, groupId: group.id, groupName: group.name, role: 'member' };
}

export async function getInviteCodeGroup(code: string): Promise<string | null> {
  const { rows } = await getPool().query<{ group_id: string }>(
    'SELECT group_id FROM invite_codes WHERE code = $1',
    [code],
  );
  return rows[0]?.group_id ?? null;
}
