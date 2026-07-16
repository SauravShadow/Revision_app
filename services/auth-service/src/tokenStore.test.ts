import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getPool } from './db';
import { createUser } from './userStore';
import { issueToken, consumeVerificationToken, consumeResetToken, hashToken } from './tokenStore';

beforeEach(async () => {
  await getPool().query('TRUNCATE users CASCADE'); // cascades into both token tables
});

afterAll(() => getPool().end());

async function makeUser(name = 'tokenuser') {
  return createUser(name, 'password123', 'civil-engineering', `${name}@example.com`);
}

describe('tokenStore', () => {
  it('issues a 64-hex token and consuming it verifies exactly once', async () => {
    const user = await makeUser();
    const raw = await issueToken('verification', user.id);
    expect(raw).toMatch(/^[a-f0-9]{64}$/);
    expect(await consumeVerificationToken(raw)).toBe(user.id);
    expect(await consumeVerificationToken(raw)).toBeNull(); // single-use
  });

  it('rejects an expired verification token', async () => {
    const user = await makeUser();
    const raw = 'a'.repeat(64);
    await getPool().query(
      `INSERT INTO email_verification_tokens (token_hash, user_id, expires_at)
       VALUES ($1, $2, now() - interval '1 minute')`,
      [hashToken(raw), user.id],
    );
    expect(await consumeVerificationToken(raw)).toBeNull();
  });

  it('enforces the 60-second per-account cooldown per token kind', async () => {
    const user = await makeUser();
    await issueToken('verification', user.id);
    await expect(issueToken('verification', user.id)).rejects.toThrow('COOLDOWN');
    // a different kind is a separate cooldown bucket
    await expect(issueToken('reset', user.id)).resolves.toMatch(/^[a-f0-9]{64}$/);
  });

  it('reset tokens are single-use via used_at', async () => {
    const user = await makeUser();
    const raw = await issueToken('reset', user.id);
    expect(await consumeResetToken(raw)).toBe(user.id);
    expect(await consumeResetToken(raw)).toBeNull();
  });

  it('rejects an unknown token outright', async () => {
    expect(await consumeVerificationToken('f'.repeat(64))).toBeNull();
    expect(await consumeResetToken('f'.repeat(64))).toBeNull();
  });
});
