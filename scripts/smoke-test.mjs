// scripts/smoke-test.mjs
// Drives register -> login -> create a topic -> upload a file through the
// live gateway, against whatever docker-compose stack is currently up.
// This is what catches contract drift between services that per-service
// unit tests can't see.
// Node 18 doesn't expose `crypto` as a global in ESM without an experimental
// flag (unlike Node 20+), so import it explicitly for portability.
import crypto from 'node:crypto';

const BASE = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3200';

async function main() {
  const username = `smoke_${Date.now()}`;

  const register = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'password123', domain: 'civil-engineering' }),
  });
  if (register.status !== 201) throw new Error(`register failed: ${register.status}`);
  const { token } = await register.json();

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
