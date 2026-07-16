import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getPool } from './db';

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

  it('stores email on signup and finds the user by email case-insensitively', async () => {
    const { createUser, findByEmail } = await import('./userStore');
    const created = await createUser('emma', 'password123', 'civil-engineering', 'Emma@Example.com');
    expect(created.email).toBe('Emma@Example.com');
    expect(created.emailVerifiedAt).toBeNull();
    expect(await findByEmail('emma@example.COM')).toEqual(created);
  });

  it('rejects a second account with the same email', async () => {
    const { createUser } = await import('./userStore');
    await createUser('first', 'password123', 'civil-engineering', 'dup@example.com');
    await expect(
      createUser('second', 'password123', 'civil-engineering', 'DUP@example.com'),
    ).rejects.toThrow('EMAIL_TAKEN');
  });

  it('marks an email verified', async () => {
    const { createUser, markEmailVerified, findById } = await import('./userStore');
    const u = await createUser('verifyme', 'password123', 'civil-engineering', 'v@example.com');
    await markEmailVerified(u.id);
    const after = await findById(u.id);
    expect(after?.emailVerifiedAt).toBeTypeOf('number');
  });

  it('setEmail attaches an email to a grandfathered account and resets verification', async () => {
    const { createUser, setEmail, markEmailVerified, findById } = await import('./userStore');
    const u = await createUser('oldtimer', 'password123', 'civil-engineering'); // no email
    await setEmail(u.id, 'late@example.com');
    let after = await findById(u.id);
    expect(after?.email).toBe('late@example.com');
    expect(after?.emailVerifiedAt).toBeNull();
    await markEmailVerified(u.id);
    await setEmail(u.id, 'other@example.com'); // replacing resets verification
    after = await findById(u.id);
    expect(after?.emailVerifiedAt).toBeNull();
  });

  it('updatePassword changes the stored hash so the new password verifies', async () => {
    const { createUser, updatePassword, findById, verifyPassword } = await import('./userStore');
    const u = await createUser('rotator', 'oldpassword', 'civil-engineering');
    await updatePassword(u.id, 'newpassword');
    const after = await findById(u.id);
    expect(await verifyPassword('newpassword', after!.passwordHash)).toBe(true);
    expect(await verifyPassword('oldpassword', after!.passwordHash)).toBe(false);
  });
});
