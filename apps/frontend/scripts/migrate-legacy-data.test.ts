import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getPool } from '@/lib/db/pool';
import { migrateLegacyData } from './migrate-legacy-data.mjs';

let dir: string;

beforeEach(async () => {
  await getPool().query('TRUNCATE users, app_data CASCADE');
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ce-legacy-migrate-'));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

afterAll(async () => {
  await getPool().end();
});

async function writeLegacyFixture(
  dataRoot: string,
  users: Array<{ id: string; username: string; passwordHash: string; domain: string; createdAt: number }>,
  appData: Record<string, unknown> = {},
) {
  await fs.writeFile(path.join(dataRoot, 'auth.json'), JSON.stringify({ users }));
  for (const [userId, data] of Object.entries(appData)) {
    const userDir = path.join(dataRoot, 'users', userId);
    await fs.mkdir(userDir, { recursive: true });
    await fs.writeFile(path.join(userDir, 'appdata.json'), JSON.stringify(data));
  }
}

describe('migrateLegacyData', () => {
  it('migrates a legacy user and their app data snapshot', async () => {
    const userId = '11111111-1111-1111-1111-111111111111';
    await writeLegacyFixture(
      dir,
      [{ id: userId, username: 'legacyuser', passwordHash: 'hash123', domain: 'civil-engineering', createdAt: 1700000000000 }],
      { [userId]: { subjects: {}, chapters: {}, topics: {}, subjectOrder: ['a'], tags: {}, tagOrder: [] } },
    );

    const stats = await migrateLegacyData(getPool(), dir);

    expect(stats.migratedUsers).toBe(1);
    expect(stats.migratedSnapshots).toBe(1);
    expect(stats.errors).toEqual([]);

    const { rows: userRows } = await getPool().query('SELECT username, domain FROM users WHERE id = $1', [userId]);
    expect(userRows[0]).toEqual({ username: 'legacyuser', domain: 'civil-engineering' });

    const { rows: dataRows } = await getPool().query('SELECT data FROM app_data WHERE user_id = $1', [userId]);
    expect(dataRows[0].data.subjectOrder).toEqual(['a']);
  });

  it('is idempotent — running twice does not duplicate or error', async () => {
    const userId = '22222222-2222-2222-2222-222222222222';
    await writeLegacyFixture(
      dir,
      [{ id: userId, username: 'repeatuser', passwordHash: 'hash456', domain: 'civil-engineering', createdAt: 1700000000000 }],
      { [userId]: { subjects: {}, chapters: {}, topics: {}, subjectOrder: [], tags: {}, tagOrder: [] } },
    );

    await migrateLegacyData(getPool(), dir);
    const second = await migrateLegacyData(getPool(), dir);

    expect(second.migratedUsers).toBe(0);
    expect(second.skippedUsers).toBe(1);

    const { rows } = await getPool().query('SELECT count(*)::int AS count FROM users WHERE id = $1', [userId]);
    expect(rows[0].count).toBe(1);
  });

  it('skips a user with no appdata.json without erroring', async () => {
    const userId = '33333333-3333-3333-3333-333333333333';
    await writeLegacyFixture(dir, [
      { id: userId, username: 'noappdata', passwordHash: 'hash789', domain: 'civil-engineering', createdAt: 1700000000000 },
    ]);

    const stats = await migrateLegacyData(getPool(), dir);

    expect(stats.migratedUsers).toBe(1);
    expect(stats.migratedSnapshots).toBe(0);
    expect(stats.errors).toEqual([]);
  });

  it('records an error for a username already taken by a different id, and continues', async () => {
    await getPool().query(
      `INSERT INTO users (id, username, password_hash, domain) VALUES ($1, 'taken', 'x', 'civil-engineering')`,
      ['44444444-4444-4444-4444-444444444444'],
    );
    const userId = '55555555-5555-5555-5555-555555555555';
    await writeLegacyFixture(dir, [
      { id: userId, username: 'taken', passwordHash: 'hash999', domain: 'civil-engineering', createdAt: 1700000000000 },
    ]);

    const stats = await migrateLegacyData(getPool(), dir);

    expect(stats.migratedUsers).toBe(0);
    expect(stats.errors).toHaveLength(1);
    expect(stats.errors[0]).toContain('taken');

    const { rows } = await getPool().query('SELECT id FROM users WHERE username_lower = $1', ['taken']);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('44444444-4444-4444-4444-444444444444');
  });
});
