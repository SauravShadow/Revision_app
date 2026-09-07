import { describe, it, expect, afterAll, vi } from 'vitest';
import request from 'supertest';
import { signSession } from '@revision-app/shared/server';
import { getPool } from './db';
import { createApp } from './server';
import * as quota from './quota';

const app = createApp();
const token = signSession({
  userId: '11111111-1111-1111-1111-111111111111',
  username: 'alice',
  domain: 'civil-engineering',
});

afterAll(async () => {
  await getPool().end();
});

describe('ai-service HTTP API', () => {
  it('reports health without a session', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('401s an unauthenticated request to a guarded route', async () => {
    const res = await request(app).get('/quota');
    expect(res.status).toBe(401);
  });

  it('accepts a valid session on a guarded route', async () => {
    const res = await request(app).get('/quota').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('returns 500 when readQuota rejects', async () => {
    vi.spyOn(quota, 'readQuota').mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app).get('/quota').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal error' });
  });
});
