import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getPool } from '@/lib/db/pool';
import { seedData } from './seed';

const USER_ID = '11111111-1111-1111-1111-111111111111';

beforeEach(async () => {
  await getPool().query('TRUNCATE users, app_data CASCADE');
  await getPool().query(
    `INSERT INTO users (id, username, password_hash, domain) VALUES ($1, 'seeduser', 'x', 'civil-engineering')`,
    [USER_ID],
  );
});

afterAll(async () => {
  await getPool().end();
});

describe('fileStore', () => {
  it('returns null before anything is written', async () => {
    const { readData } = await import('./fileStore');
    expect(await readData(USER_ID)).toBeNull();
  });

  it('round-trips written data', async () => {
    const { readData, writeData } = await import('./fileStore');
    const data = seedData();
    await writeData(data, USER_ID);
    expect(await readData(USER_ID)).toEqual(data);
  });

  it('overwrites prior snapshots', async () => {
    const { readData, writeData } = await import('./fileStore');
    const first = seedData();
    await writeData(first, USER_ID);
    const second = seedData();
    await writeData(second, USER_ID);
    const loaded = await readData(USER_ID);
    expect(loaded!.subjectOrder).toEqual(second.subjectOrder);
  });
});
