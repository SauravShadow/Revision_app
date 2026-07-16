// scripts/smoke-test.mjs
// Drives register -> login -> create a topic -> upload a file through the
// live gateway, against whatever docker-compose stack is currently up.
// This is what catches contract drift between services that per-service
// unit tests can't see.
// Node 18 doesn't expose `crypto` as a global in ESM without an experimental
// flag (unlike Node 20+), so import it explicitly for portability.
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const BASE = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3200';

async function main() {
  const username = `smoke_${Date.now()}`;
  const email = `${username}@example.com`;

  const register = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'password123', domain: 'civil-engineering', email }),
  });
  if (register.status !== 201) throw new Error(`register failed: ${register.status}`);

  // With RESEND_API_KEY unset, auth-service logs the verification link
  // instead of emailing it — fish the token out of the container logs.
  // (Requires the compose stack; real-key environments can't run this script.)
  const logs = execSync('docker logs revision_auth_service --since 2m 2>&1', { encoding: 'utf8' });
  const tokens = [...logs.matchAll(/verify-email\?token=([a-f0-9]{64})/g)];
  const verifyToken = tokens.at(-1)?.[1];
  if (!verifyToken) throw new Error('no verification token found in auth-service logs — is RESEND_API_KEY set?');

  const verify = await fetch(`${BASE}/api/auth/verify-email?token=${verifyToken}`);
  if (verify.status !== 200) throw new Error(`verify-email failed: ${verify.status}`);

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'password123' }),
  });
  if (login.status !== 200) throw new Error(`login failed: ${login.status}`);
  const { token } = await login.json();

  const getData = await fetch(`${BASE}/api/data`, { headers: { Authorization: `Bearer ${token}` } });
  if (getData.status !== 200) throw new Error(`GET /api/data failed: ${getData.status}`);
  const appData = await getData.json();

  const subjectId = appData.subjectOrder[0];
  const chapterId = appData.subjects[subjectId].chapterIds[0];
  const topicId = crypto.randomUUID();
  appData.topics[topicId] = {
    id: topicId, chapterId, title: 'Smoke test topic', notes: '', order: 999,
    difficulty: 'Easy', priority: 'Low', revisionHistory: [], createdAt: Date.now(), updatedAt: Date.now(),
  };
  appData.chapters[chapterId].topicIds.push(topicId);

  const putData = await fetch(`${BASE}/api/data`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(appData),
  });
  if (putData.status !== 204) throw new Error(`PUT /api/data failed: ${putData.status}`);

  const form = new FormData();
  form.append('file', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }), 'smoke.png');
  const upload = await fetch(`${BASE}/api/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (upload.status !== 200) throw new Error(`upload failed: ${upload.status}`);

  console.log('smoke test passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
