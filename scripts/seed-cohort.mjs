#!/usr/bin/env node
// scripts/seed-cohort.mjs
//
// Populates a demo *cohort* for the coaching dashboard: an organisation with two
// groups and ~28 students whose revision data spans every dashboard state, so
// logging in as the coach and opening /coaching shows a realistic, varied cohort.
//
// Complements scripts/seed-demo-user.mjs (which seeds a single rich user for the
// Insights/Calendar views). The two scripts are intentionally independent — the
// shared bits (makeHistory / STATE_WEIGHTS / the psql fallback) are copied, not
// factored into a module, for a pair of dev-only scripts.
//
// Usage:
//   node scripts/seed-cohort.mjs            # seed (idempotent, re-runnable)
//   node scripts/seed-cohort.mjs --reset    # tear down seeded data, then seed
//   node scripts/seed-cohort.mjs --reset-only   # tear down only, don't seed
//
// Requires: the docker-compose stack to be running.

import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const BASE = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3200';

const COACH = { username: 'coach', password: 'coach1234', email: 'coach@example.com', domain: 'civil-engineering' };
const STUDENT_PASSWORD = 'student1234';
const STUDENT_DOMAIN = 'civil-engineering';
const ORG_NAME = 'Sunrise ESE Academy';
const GROUPS = [
  { name: 'Batch A (Morning)', size: 16 },
  { name: 'Batch B (Evening)', size: 12 },
];

const AUTH_DB = 'revision_auth';
const CONTENT_DB = 'revision_content';

// ── time / id helpers ────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.now();
function daysAgo(n) { return NOW - n * DAY_MS; }
function uuid() { return crypto.randomUUID(); }
function randInt(lo, hi) { return lo + Math.floor(Math.random() * (hi - lo + 1)); }
function shuffle(arr) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ── revision-history construction (mirrors seed-demo-user.mjs) ────────────────
//
// Ladder intervals: [1, 3, 7, 16, 35, 60, 90]; nextInterval(count)=LADDER[min(count-1,6)].
// Completion counts a topic as "done" if revisionHistory.length > 0 (stats.ts).

function makeHistory(state) {
  switch (state) {
    case 'none': return [];
    case 'recent':       return [{ id: uuid(), timestamp: daysAgo(1) }];
    case 'upcoming':     return [50, 20, 3].map((d) => ({ id: uuid(), timestamp: daysAgo(d) }));
    case 'due_tomorrow': return [10, 2].map((d) => ({ id: uuid(), timestamp: daysAgo(d) }));
    case 'due_today': {
      const ts36h = NOW - 36 * 60 * 60 * 1000;
      return [{ id: uuid(), timestamp: daysAgo(8) }, { id: uuid(), timestamp: ts36h }];
    }
    case 'overdue':  return [{ id: uuid(), timestamp: daysAgo(3) }];
    case 'advanced': return [90, 60, 35, 15, 5].map((d) => ({ id: uuid(), timestamp: daysAgo(d) }));
    case 'mastered': return [220, 170, 125, 90, 60, 30, 10].map((d) => ({ id: uuid(), timestamp: daysAgo(d) }));
    default: return [];
  }
}

// All timestamps 20–40 days old: data is present but there's no recent activity
// and the streak is broken. 1–2 old revisions per covered topic.
function makeInactiveHistory() {
  const n = randInt(1, 2);
  return Array.from({ length: n }, () => ({ id: uuid(), timestamp: daysAgo(randInt(20, 40)) }))
    .sort((a, b) => a.timestamp - b.timestamp);
}

function weightedPick(pairs) {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [v, w] of pairs) { r -= w; if (r <= 0) return v; }
  return pairs[pairs.length - 1][0];
}

// ── personas ─────────────────────────────────────────────────────────────────
//
// coverage  = fraction of active topics that receive any history (drives completion %)
// weights   = distribution over makeHistory states for the covered topics
// inactive  = covered topics use makeInactiveHistory (old timestamps)
// streak    = [lo,hi]: layer a consecutive-day streak of that length on top (stars)
// dataOnly0 = GET auto-seeds a 0% stats row; apply no revisions, don't PUT
// noData    = register + join only; never GET/PUT → no user_stats row → "No data yet"

const PERSONAS = {
  star: {
    label: 'Star', coverage: 0.95, streak: [5, 7],
    weights: [['mastered', 30], ['advanced', 30], ['recent', 20], ['upcoming', 15], ['due_tomorrow', 5]],
  },
  average: {
    label: 'Average', coverage: 0.55,
    weights: [['recent', 18], ['upcoming', 20], ['due_tomorrow', 10], ['due_today', 12], ['overdue', 15], ['advanced', 15], ['mastered', 10]],
  },
  struggling: {
    label: 'Struggling', coverage: 0.40,
    weights: [['overdue', 50], ['due_today', 20], ['recent', 10], ['upcoming', 10], ['advanced', 10]],
  },
  inactive: { label: 'Inactive', coverage: 0.60, inactive: true },
  enrolled0: { label: 'Enrolled, 0%', coverage: 0, dataOnly0: true },
  nodata: { label: 'No data yet', noData: true },
};

// 28 personas: 3 star, 14 average, 5 struggling, 3 inactive, 1 enrolled0, 2 nodata.
function buildPersonaPool() {
  const pool = [];
  const add = (key, n) => { for (let i = 0; i < n; i++) pool.push(key); };
  add('star', 3); add('average', 14); add('struggling', 5);
  add('inactive', 3); add('enrolled0', 1); add('nodata', 2);
  // Shuffle so the edge-case personas spread across both batches rather than
  // clustering (batches are assigned by slice below).
  return shuffle(pool);
}

// ── app-data mutation ─────────────────────────────────────────────────────────

function setHistory(appData, id, history) {
  const t = appData.topics[id];
  appData.topics[id] = {
    ...t,
    revisionHistory: history,
    updatedAt: history.length ? history[history.length - 1].timestamp : t.updatedAt,
  };
}

function applyPersona(appData, persona, activeIds) {
  // Reset every active topic first so reruns converge to this persona's spread.
  for (const id of activeIds) setHistory(appData, id, []);

  const covered = shuffle(activeIds).slice(0, Math.round(activeIds.length * persona.coverage));
  for (const id of covered) {
    setHistory(appData, id, persona.inactive ? makeInactiveHistory() : makeHistory(weightedPick(persona.weights)));
  }

  if (persona.streak) buildStreak(appData, covered, randInt(persona.streak[0], persona.streak[1]));
  return covered.length;
}

// Place one revision on each of the last n consecutive days across n distinct
// topics so currentStreak() returns at least n.
function buildStreak(appData, coveredIds, n) {
  const picks = coveredIds.slice(0, Math.min(n, coveredIds.length));
  picks.forEach((id, k) => {
    const t = appData.topics[id];
    const history = [...t.revisionHistory, { id: uuid(), timestamp: daysAgo(k) }].sort((a, b) => a.timestamp - b.timestamp);
    setHistory(appData, id, history);
  });
}

// ── HTTP ──────────────────────────────────────────────────────────────────────

async function api(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  try {
    return await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch (err) {
    if (String(err?.cause?.code ?? err?.code ?? '').includes('ECONNREFUSED') || /fetch failed/i.test(err.message)) {
      throw new Error(`Cannot reach ${BASE} — start the docker-compose stack first (docker compose up -d).`);
    }
    throw err;
  }
}

// Throws with method/path/status/body on any status not in `ok`.
async function req(method, path, { body, token, ok = [200] } = {}) {
  const res = await api(method, path, body, token);
  if (!ok.includes(res.status)) {
    const text = await res.text().catch(() => '');
    throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  }
  return res;
}

// ── psql fallback (docker exec primary, host psql secondary) ──────────────────

function psql(db, sql, { capture = false } = {}) {
  const flags = capture ? '-tAc' : '-c';
  const cmds = [
    `docker exec revision_app_db psql -U revision -d ${db} ${flags} "${sql}"`,
    `psql "$DATABASE_URL" ${flags} "${sql}"`,
  ];
  for (const cmd of cmds) {
    try {
      const out = execSync(cmd, { env: { ...process.env }, encoding: 'utf8', stdio: 'pipe' });
      return { ok: true, out };
    } catch { /* try next */ }
  }
  return { ok: false, out: '' };
}

const SEEDED_USER_FILTER = `(username_lower = 'coach' OR username_lower ~ '^stu[0-9]+$')`;

// ── auth / org helpers ────────────────────────────────────────────────────────

async function register(username, email) {
  const res = await api('POST', '/api/auth/register', {
    username, password: username === COACH.username ? COACH.password : STUDENT_PASSWORD,
    domain: username === COACH.username ? COACH.domain : STUDENT_DOMAIN, email,
  });
  if (res.status !== 201 && res.status !== 409) {
    throw new Error(`register ${username} → ${res.status}: ${await res.text().catch(() => '')}`);
  }
  return res.status === 201; // true = newly created
}

async function login(username, password) {
  const res = await req('POST', '/api/auth/login', { body: { username, password }, ok: [200] });
  return (await res.json()).token;
}

async function findOrCreateOrg(token) {
  const { memberships = [] } = await (await req('GET', '/api/orgs/me', { token })).json();
  const existing = memberships.find((m) => m.groupId === null && m.role === 'admin' && m.orgName === ORG_NAME);
  if (existing) return { id: existing.orgId, reused: true };
  // Names are not unique — only create when the coach admins none.
  const org = await (await req('POST', '/api/orgs', { body: { name: ORG_NAME }, token, ok: [201] })).json();
  return { id: org.id, reused: false };
}

async function findOrCreateGroup(token, orgId, name) {
  const { groups = [] } = await (await req('GET', `/api/orgs/${orgId}/groups`, { token })).json();
  const found = groups.find((g) => g.name === name);
  if (found) return found.id;
  const res = await api('POST', `/api/orgs/${orgId}/groups`, { name }, token);
  if (res.status === 201) return (await res.json()).id;
  if (res.status === 409) {
    // Raced or pre-existing: re-list and reuse.
    const again = await (await req('GET', `/api/orgs/${orgId}/groups`, { token })).json();
    const g = (again.groups ?? []).find((x) => x.name === name);
    if (g) return g.id;
  }
  throw new Error(`create group "${name}" → ${res.status}: ${await res.text().catch(() => '')}`);
}

async function mintInviteCode(token, groupId) {
  const res = await req('POST', `/api/groups/${groupId}/invite-codes`, { body: {}, token, ok: [201] });
  return (await res.json()).code;
}

// ── per-student seeding ───────────────────────────────────────────────────────

async function seedStudent(username, persona, inviteCode) {
  const token = await login(username, STUDENT_PASSWORD);

  let covered = 0;
  if (persona.dataOnly0) {
    // GET auto-seeds the syllabus and writes a 0%-completion user_stats row.
    await req('GET', '/api/data', { token, ok: [200] });
  } else if (!persona.noData) {
    const appData = await (await req('GET', '/api/data', { token, ok: [200] })).json();
    const activeIds = Object.keys(appData.topics).filter((id) => !appData.topics[id].archivedAt);
    covered = applyPersona(appData, persona, activeIds);
    await req('PUT', '/api/data', { body: appData, token, ok: [204] });
  }
  // Everyone joins their group (re-join is a no-op upsert).
  await req('POST', '/api/orgs/join', { body: { code: inviteCode }, token, ok: [200] });
  return covered;
}

// ── reset ─────────────────────────────────────────────────────────────────────

function reset() {
  console.log('🧹  Resetting seeded cohort data…');

  // Grab seeded user ids from the auth DB before deleting the users, so we can
  // delete their rows in the (separate) content DB.
  const idRes = psql(AUTH_DB, `SELECT id FROM users WHERE ${SEEDED_USER_FILTER}`, { capture: true });
  const ids = idRes.ok ? idRes.out.split('\n').map((s) => s.trim()).filter(Boolean) : [];

  if (ids.length) {
    const list = ids.map((id) => `'${id}'`).join(',');
    for (const table of ['user_activity', 'user_stats', 'app_data']) {
      const r = psql(CONTENT_DB, `DELETE FROM ${table} WHERE user_id IN (${list})`);
      if (!r.ok) console.log(`     ⚠ could not delete from ${CONTENT_DB}.${table}`);
    }
    console.log(`     Cleared content rows for ${ids.length} user(s).`);
  } else {
    console.log('     No seeded users found in auth DB (or psql unavailable).');
  }

  // Delete the org first: org_groups / org_memberships / invite_codes cascade
  // from it, and organisations.created_by → users has no cascade, so the org
  // must go before the coach user.
  const orgDel = psql(AUTH_DB, `DELETE FROM organisations WHERE name = '${ORG_NAME}'`);
  if (!orgDel.ok) console.log(`     ⚠ could not delete organisation "${ORG_NAME}"`);
  const userDel = psql(AUTH_DB, `DELETE FROM users WHERE ${SEEDED_USER_FILTER}`);
  if (!userDel.ok) console.log('     ⚠ could not delete seeded users');

  console.log('     Reset complete.\n');
}

// ── main ───────────────────────────────────────────────────────────────────────

async function main() {
  const args = new Set(process.argv.slice(2));
  const doReset = args.has('--reset') || args.has('--reset-only');
  const seedAfter = !args.has('--reset-only');

  if (doReset) reset();
  if (!seedAfter) return;

  console.log(`🌱  Seeding cohort "${ORG_NAME}"…\n`);

  // Assemble the roster: coach + stu01..stuNN, each with a persona and a group.
  const pool = buildPersonaPool();
  const total = GROUPS.reduce((s, g) => s + g.size, 0);
  if (pool.length !== total) throw new Error(`persona pool (${pool.length}) != roster size (${total})`);

  const roster = [];
  let idx = 0;
  for (let gi = 0; gi < GROUPS.length; gi++) {
    for (let k = 0; k < GROUPS[gi].size; k++, idx++) {
      const username = `stu${String(idx + 1).padStart(2, '0')}`;
      roster.push({ username, personaKey: pool[idx], groupIdx: gi });
    }
  }

  // 1. Register coach + all students.
  console.log('1/6  Registering coach + students…');
  let created = (await register(COACH.username, COACH.email)) ? 1 : 0;
  for (const r of roster) {
    if (await register(r.username, `${r.username}@example.com`)) created++;
  }
  console.log(`     ${created} newly created, ${1 + roster.length - created} already existed.`);

  // 2. Verify all emails in one batched psql UPDATE (email verification isn't
  //    scriptable via the API).
  console.log('2/6  Verifying emails (batched psql)…');
  const verify = psql(AUTH_DB, `UPDATE users SET email_verified_at = now() WHERE ${SEEDED_USER_FILTER} AND email_verified_at IS NULL`);
  console.log(verify.ok ? '     Verified ✓' : '     ⚠ Could not auto-verify (logins will surface it)');

  // 3. Coach logs in; create/reuse org + groups + invite codes.
  console.log('3/6  Setting up org, groups, invite codes…');
  const coachToken = await login(COACH.username, COACH.password);
  const { id: orgId, reused } = await findOrCreateOrg(coachToken);
  console.log(`     Org ${reused ? 'reused' : 'created'}: ${orgId}`);
  const groupInfo = [];
  for (const g of GROUPS) {
    const groupId = await findOrCreateGroup(coachToken, orgId, g.name);
    const code = await mintInviteCode(coachToken, groupId);
    groupInfo.push({ ...g, id: groupId, code });
    console.log(`     ${g.name}: group ${groupId} · code ${code}`);
  }

  // 4. Seed each student per their persona and join their group.
  console.log('4/6  Seeding students…');
  const tally = {}; // personaKey -> count
  const groupTotals = GROUPS.map(() => 0);
  for (const r of roster) {
    const persona = PERSONAS[r.personaKey];
    await seedStudent(r.username, persona, groupInfo[r.groupIdx].code);
    tally[r.personaKey] = (tally[r.personaKey] ?? 0) + 1;
    groupTotals[r.groupIdx]++;
    process.stdout.write('.');
  }
  process.stdout.write('\n');

  // 5. Persona / group summary.
  console.log('5/6  Roster summary:');
  for (const key of Object.keys(PERSONAS)) {
    if (tally[key]) console.log(`     ${PERSONAS[key].label.padEnd(14)} ${tally[key]}`);
  }
  groupInfo.forEach((g, i) => console.log(`     ${g.name.padEnd(20)} ${groupTotals[i]} students`));

  // 6. Post-seed sanity check: pull each group's cohort summary as the coach.
  console.log('6/6  Verifying via cohort summary…');
  for (const g of groupInfo) {
    const res = await api('GET', `/api/cohort/groups/${g.id}/summary`, null, coachToken);
    if (res.status !== 200) { console.log(`     ⚠ ${g.name} summary → ${res.status}`); continue; }
    const s = await res.json();
    const t = s.totals ?? {};
    console.log(`     ${g.name.padEnd(20)} members=${t.members}  completion=${t.completionPct}%  dueToday=${t.dueToday}  overdue=${t.overdue}`);
  }

  console.log('\n✅  Done!\n');
  console.log(`  URL:      ${BASE}`);
  console.log(`  Coach:    ${COACH.username} / ${COACH.password}`);
  console.log(`  Students: stu01…stu${String(total).padStart(2, '0')} / ${STUDENT_PASSWORD}`);
  console.log(`  Org:      ${ORG_NAME} (${orgId})`);
  console.log('\nLog in as the coach and open /coaching. 🎉');
}

main().catch((err) => { console.error('\n❌', err.message); process.exit(1); });
