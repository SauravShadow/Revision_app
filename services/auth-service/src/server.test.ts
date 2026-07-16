import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { getPool } from './db';
import { createApp } from './server';
import { createUser } from './userStore';
import type { EmailSender } from './email';

class FakeEmailSender implements EmailSender {
  sent: Array<{ to: string; subject: string; html: string }> = [];
  async send(to: string, subject: string, html: string) {
    this.sent.push({ to, subject, html });
  }
  lastToken(): string {
    const m = this.sent.at(-1)?.html.match(/token=([a-f0-9]{64})/);
    if (!m) throw new Error('no token found in last email');
    return m[1];
  }
}

const emails = new FakeEmailSender();
const app = createApp(emails);

const REG = { username: 'alice', password: 'password123', domain: 'civil-engineering', email: 'alice@example.com' };

beforeEach(async () => {
  await getPool().query('TRUNCATE users CASCADE');
  emails.sent = [];
});

afterAll(async () => {
  await getPool().end();
});

describe('POST /register with email verification', () => {
  it('requires a valid email', async () => {
    const noEmail = await request(app).post('/register').send({ ...REG, email: undefined });
    expect(noEmail.status).toBe(400);
    const badEmail = await request(app).post('/register').send({ ...REG, email: 'not-an-email' });
    expect(badEmail.status).toBe(400);
  });

  it('creates the account, emails a verification link, and returns no session token', async () => {
    const res = await request(app).post('/register').send(REG);
    expect(res.status).toBe(201);
    expect(res.body.token).toBeUndefined();
    expect(res.body.message).toContain('check your email');
    expect(emails.sent).toHaveLength(1);
    expect(emails.sent[0].to).toBe('alice@example.com');
    expect(emails.sent[0].html).toContain('/verify-email?token=');
  });

  it('rejects a duplicate email with 409', async () => {
    await request(app).post('/register').send(REG);
    const res = await request(app).post('/register').send({ ...REG, username: 'alice2' });
    expect(res.status).toBe(409);
  });
});

describe('login gate + GET /verify-email', () => {
  it('blocks login until the emailed token is used, then allows it', async () => {
    await request(app).post('/register').send(REG);

    const before = await request(app).post('/login').send({ username: 'alice', password: 'password123' });
    expect(before.status).toBe(403);
    expect(before.body.code).toBe('EMAIL_UNVERIFIED');

    const verify = await request(app).get(`/verify-email?token=${emails.lastToken()}`);
    expect(verify.status).toBe(200);

    const after = await request(app).post('/login').send({ username: 'alice', password: 'password123' });
    expect(after.status).toBe(200);
    expect(typeof after.body.token).toBe('string');
  });

  it('rejects an unknown or missing token', async () => {
    const bogus = await request(app).get(`/verify-email?token=${'f'.repeat(64)}`);
    expect(bogus.status).toBe(400);
    expect(bogus.body.code).toBe('TOKEN_INVALID');
    const missing = await request(app).get('/verify-email');
    expect(missing.status).toBe(400);
  });

  it('grandfathered accounts (no email) log in with no verification gate', async () => {
    await createUser('oldtimer', 'password123', 'civil-engineering'); // email IS NULL
    const res = await request(app).post('/login').send({ username: 'oldtimer', password: 'password123' });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
  });

  it('still rejects a wrong password', async () => {
    await createUser('bob', 'password123', 'civil-engineering');
    const res = await request(app).post('/login').send({ username: 'bob', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('a valid login token still works on /me', async () => {
    await createUser('carol', 'password123', 'civil-engineering');
    const login = await request(app).post('/login').send({ username: 'carol', password: 'password123' });
    const me = await request(app).get('/me').set('Authorization', `Bearer ${login.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.username).toBe('carol');
  });
});

describe('POST /resend-verification', () => {
  it('is cooldown-limited right after registration', async () => {
    await request(app).post('/register').send(REG); // issued a token seconds ago
    const res = await request(app).post('/resend-verification').send({ identifier: 'alice' });
    expect(res.status).toBe(429);
  });

  it('answers generically for unknown identifiers and sends nothing', async () => {
    const res = await request(app).post('/resend-verification').send({ identifier: 'ghost@example.com' });
    expect(res.status).toBe(200);
    expect(emails.sent).toHaveLength(0);
  });

  it('answers generically for already-verified accounts and sends nothing', async () => {
    await request(app).post('/register').send(REG);
    await request(app).get(`/verify-email?token=${emails.lastToken()}`);
    emails.sent = [];
    const res = await request(app).post('/resend-verification').send({ identifier: 'alice@example.com' });
    expect(res.status).toBe(200);
    expect(emails.sent).toHaveLength(0);
  });
});
