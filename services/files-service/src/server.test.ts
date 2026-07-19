import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { signSession } from '@revision-app/shared/server';
import { createApp } from './server';

const app = createApp();
const token = signSession({ userId: 'user-1', username: 'alice', domain: 'civil-engineering' });

beforeEach(async () => {
  process.env.FILES_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'files-service-server-'));
});

describe('files-service HTTP API', () => {
  it('uploads and then fetches a file', async () => {
    const upload = await request(app)
      .post('/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('fake-png-bytes'), { filename: 'x.png', contentType: 'image/png' });
    expect(upload.status).toBe(200);
    const id = upload.body.id;

    const get = await request(app).get(`/${id}`).set('Authorization', `Bearer ${token}`);
    expect(get.status).toBe(200);
    // superagent parses image/* responses into res.body as a Buffer, not res.text.
    expect(Buffer.from(get.body).toString()).toBe('fake-png-bytes');
  });

  it('rejects an SVG upload (active content — stored-XSS vector)', async () => {
    const res = await request(app)
      .post('/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), {
        filename: 'x.svg',
        contentType: 'image/svg+xml',
      });
    expect(res.status).toBe(400);
  });

  it('serves files with hardening headers so a stored blob cannot execute script', async () => {
    const upload = await request(app)
      .post('/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('fake-png-bytes'), { filename: 'x.png', contentType: 'image/png' });
    const get = await request(app).get(`/${upload.body.id}`).set('Authorization', `Bearer ${token}`);
    expect(get.headers['x-content-type-options']).toBe('nosniff');
    expect(get.headers['content-security-policy']).toContain('sandbox');
  });

  it('rejects upload without a valid session', async () => {
    const res = await request(app)
      .post('/upload')
      .attach('file', Buffer.from('x'), { filename: 'x.png', contentType: 'image/png' });
    expect(res.status).toBe(401);
  });

  it('gc deletes only unreferenced blobs the caller owns', async () => {
    const upload = await request(app)
      .post('/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('x'), { filename: 'x.png', contentType: 'image/png' });
    const gc = await request(app)
      .post('/gc')
      .set('Authorization', `Bearer ${token}`)
      .send({ referencedIds: [] });
    expect(gc.status).toBe(200);
    // Freshly uploaded blob is within the grace period, so it survives this sweep.
    expect(gc.body.deleted).toBe(0);
    void upload;
  });
});
