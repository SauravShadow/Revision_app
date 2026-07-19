import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { getPool } from './db';
import { createApp, _resetLoginRateLimit } from './server';
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
  _resetLoginRateLimit();
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

describe('password strength', () => {
  it('rejects registration with a password shorter than 8 characters', async () => {
    const res = await request(app).post('/register').send({ ...REG, password: 'short12' }); // 7 chars
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/8 characters/);
  });
});

describe('login rate limiting', () => {
  it('starts returning 429 once too many attempts come from the same client', async () => {
    const attempt = () => request(app).post('/login').send({ username: 'ghost', password: 'nope' });
    for (let i = 0; i < 5; i++) {
      expect((await attempt()).status).toBe(401); // wrong creds, but not yet throttled
    }
    expect((await attempt()).status).toBe(429); // 6th attempt is blocked
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

describe('password reset', () => {
  async function registerAndVerify() {
    await request(app).post('/register').send(REG);
    await request(app).get(`/verify-email?token=${emails.lastToken()}`);
    emails.sent = [];
  }

  it('forgot-password answers generically for unknown emails and sends nothing', async () => {
    const res = await request(app).post('/forgot-password').send({ email: 'ghost@example.com' });
    expect(res.status).toBe(200);
    expect(emails.sent).toHaveLength(0);
  });

  it('emails a reset link that changes the password exactly once', async () => {
    await registerAndVerify();

    const forgot = await request(app).post('/forgot-password').send({ email: 'alice@example.com' });
    expect(forgot.status).toBe(200);
    expect(emails.sent).toHaveLength(1);
    expect(emails.sent[0].html).toContain('/reset-password?token=');
    const token = emails.lastToken();

    const reset = await request(app).post('/reset-password').send({ token, newPassword: 'newpassword1' });
    expect(reset.status).toBe(200);

    expect((await request(app).post('/login').send({ username: 'alice', password: 'password123' })).status).toBe(401);
    expect((await request(app).post('/login').send({ username: 'alice', password: 'newpassword1' })).status).toBe(200);

    // token is single-use
    const again = await request(app).post('/reset-password').send({ token, newPassword: 'anotherpass' });
    expect(again.status).toBe(400);
    expect(again.body.code).toBe('TOKEN_INVALID');
  });

  it('rejects a too-short new password without consuming the token', async () => {
    await registerAndVerify();
    await request(app).post('/forgot-password').send({ email: 'alice@example.com' });
    const token = emails.lastToken();

    const short = await request(app).post('/reset-password').send({ token, newPassword: 'tiny' });
    expect(short.status).toBe(400);

    const ok = await request(app).post('/reset-password').send({ token, newPassword: 'longenough' });
    expect(ok.status).toBe(200);
  });

  it('forgot-password enforces the cooldown', async () => {
    await registerAndVerify();
    await request(app).post('/forgot-password').send({ email: 'alice@example.com' });
    const res = await request(app).post('/forgot-password').send({ email: 'alice@example.com' });
    expect(res.status).toBe(429);
  });
});

describe('email-status / set-email (settings)', () => {
  async function grandfatheredToken(name = 'settler') {
    await createUser(name, 'password123', 'civil-engineering');
    const login = await request(app).post('/login').send({ username: name, password: 'password123' });
    return login.body.token as string;
  }

  it('requires authentication', async () => {
    expect((await request(app).get('/email-status')).status).toBe(401);
    expect((await request(app).post('/set-email').send({ email: 'a@b.co' })).status).toBe(401);
  });

  it('reports none → unverified → verified as a grandfathered account adds an email', async () => {
    const token = await grandfatheredToken();
    const auth = { Authorization: `Bearer ${token}` };

    let status = await request(app).get('/email-status').set(auth);
    expect(status.body).toEqual({ email: null, verified: false });

    const set = await request(app).post('/set-email').set(auth).send({ email: 'settler@example.com' });
    expect(set.status).toBe(200);
    expect(emails.sent.at(-1)?.to).toBe('settler@example.com');

    status = await request(app).get('/email-status').set(auth);
    expect(status.body).toEqual({ email: 'settler@example.com', verified: false });

    await request(app).get(`/verify-email?token=${emails.lastToken()}`);
    status = await request(app).get('/email-status').set(auth);
    expect(status.body).toEqual({ email: 'settler@example.com', verified: true });
  });

  it('refuses to overwrite a verified email and rejects taken emails', async () => {
    const token = await grandfatheredToken('taken1');
    const auth = { Authorization: `Bearer ${token}` };
    await request(app).post('/set-email').set(auth).send({ email: 'taken1@example.com' });
    await request(app).get(`/verify-email?token=${emails.lastToken()}`);

    const overwrite = await request(app).post('/set-email').set(auth).send({ email: 'new@example.com' });
    expect(overwrite.status).toBe(409);

    const token2 = await grandfatheredToken('taken2');
    const dup = await request(app)
      .post('/set-email')
      .set({ Authorization: `Bearer ${token2}` })
      .send({ email: 'TAKEN1@example.com' });
    expect(dup.status).toBe(409);
  });
});
