import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { getPool } from './db';
import { createApp } from './server';

const app = createApp();

beforeEach(async () => {
  await getPool().query('TRUNCATE users CASCADE');
});

afterAll(async () => {
  await getPool().end();
});

describe('POST /register then /login', () => {
  it('registers a user and returns a session token', async () => {
    const res = await request(app)
      .post('/register')
      .send({ username: 'alice', password: 'password123', domain: 'civil-engineering' });
    expect(res.status).toBe(201);
    expect(res.body.username).toBe('alice');
    expect(typeof res.body.token).toBe('string');
  });

  it('rejects login with a wrong password', async () => {
    await request(app).post('/register').send({ username: 'bob', password: 'password123', domain: 'civil-engineering' });
    const res = await request(app).post('/login').send({ username: 'bob', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('logs in with correct credentials and returns a usable token for /me', async () => {
    await request(app).post('/register').send({ username: 'carol', password: 'password123', domain: 'civil-engineering' });
    const login = await request(app).post('/login').send({ username: 'carol', password: 'password123' });
    expect(login.status).toBe(200);
    const me = await request(app).get('/me').set('Authorization', `Bearer ${login.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.username).toBe('carol');
  });
});
