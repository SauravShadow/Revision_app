import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getPool } from '@/lib/db/pool';

beforeEach(async () => {
  await getPool().query('TRUNCATE users CASCADE');
});

afterAll(() => getPool().end());

describe('userStore', () => {
  it('returns null for an unknown username', async () => {
    const { findByUsername } = await import('./userStore');
    expect(await findByUsername('nobody')).toBeNull();
  });

  it('creates a user and finds it by id and username', async () => {
    const { createUser, findById, findByUsername } = await import('./userStore');
    const created = await createUser('store-test-user', 'password123', 'civil-engineering');
    expect(await findById(created.id)).toEqual(created);
    expect(await findByUsername('STORE-TEST-USER')).toEqual(created); // case-insensitive lookup
  });

  it('rejects the loser of a concurrent duplicate-username signup race', async () => {
    const { createUser } = await import('./userStore');
    const results = await Promise.allSettled([
      createUser('racer', 'password123', 'civil-engineering'),
      createUser('racer', 'password456', 'civil-engineering'),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
  });
});
