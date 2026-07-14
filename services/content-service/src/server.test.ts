import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { signSession } from '@revision-app/shared/server';
import { getPool } from './db';
import { createApp } from './server';

const app = createApp();
const token = signSession({ userId: '11111111-1111-1111-1111-111111111111', username: 'alice', domain: 'civil-engineering' });
const sample = { subjects: {}, chapters: {}, topics: {}, subjectOrder: [], tags: {}, tagOrder: [] };

beforeEach(async () => {
  await getPool().query('TRUNCATE app_data');
});

afterAll(async () => {
  await getPool().end();
});

describe('content-service HTTP API', () => {
  it('404s before anything is written', async () => {
    const res = await request(app).get('/app-data').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('round-trips data through PUT then GET', async () => {
    const put = await request(app).put('/app-data').set('Authorization', `Bearer ${token}`).send(sample);
    expect(put.status).toBe(204);
    const get = await request(app).get('/app-data').set('Authorization', `Bearer ${token}`);
    expect(get.status).toBe(200);
    expect(get.body).toEqual(sample);
  });

  it('rejects a malformed body', async () => {
    const res = await request(app).put('/app-data').set('Authorization', `Bearer ${token}`).send({ nonsense: true });
    expect(res.status).toBe(400);
  });
});
