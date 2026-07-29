#!/usr/bin/env node
// scripts/seed-neet-batches.mjs
//
// Seeds a demo coaching centre ("Nalanda Academy") with 3 batches × 20 students
// (60 total). Every student gets the same 3-subject syllabus — Physics (PUC /
// NEET-JEE), Mathematics (SSLC) and Chemistry — with revision histories spread
// across every badge state, so:
//   • the coaching head (login: head) sees all 60 students across 3 groups, and
//   • any individual student login shows a full, realistic syllabus with
//     Overdue / Due Today / Recently Revised / Upcoming / Never Revised variety,
//     notes content on several topics, tags, flashcards and bookmarks.
//
// The flagship topics from the demo brief are pinned to their intended states
// (e.g. "Coulomb's Law & Electric Field" → Overdue) for students with active
// personas, so the badge-colour variety is guaranteed on screen.
//
// Usage:
//   node scripts/seed-neet-batches.mjs               # seed (idempotent, re-runnable)
//   node scripts/seed-neet-batches.mjs --reset       # tear down seeded data, then seed
//   node scripts/seed-neet-batches.mjs --reset-only  # tear down only
//
// Requires: the docker-compose stack to be running.

import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const BASE = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3200';

const HEAD = { username: 'head', password: 'head1234', email: 'head@example.com', domain: 'school-tuition' };
const STUDENT_PASSWORD = 'student1234';
const STUDENT_DOMAIN = 'school-tuition';
const ORG_NAME = 'Nalanda Academy';
const GROUPS = [
  { name: 'Batch A — Morning (6:30 AM)' },
  { name: 'Batch B — Evening (5:30 PM)' },
  { name: 'Batch C — Weekend' },
];
const BATCH_SIZE = 20;

const AUTH_DB = 'revision_auth';
const CONTENT_DB = 'revision_content';

// ── roster: 60 realistic student usernames, 20 per batch ─────────────────────

const STUDENTS = [
  // Batch A — Morning
  'aarav_sharma', 'ananya_hegde', 'rohan_patil', 'sneha_kulkarni', 'vivaan_reddy',
  'ishita_nair', 'karthik_rao', 'meera_iyer', 'aditya_gowda', 'pooja_shetty',
  'arjun_desai', 'divya_bhat', 'nikhil_jain', 'riya_agarwal', 'siddharth_menon',
  'tanvi_joshi', 'harsha_kumar', 'lakshmi_prasad', 'manav_gupta', 'nandini_shenoy',
  // Batch B — Evening
  'pranav_acharya', 'sanya_kapoor', 'rahul_verma', 'aishwarya_pai', 'varun_naik',
  'kavya_murthy', 'akash_singh', 'shruti_kamath', 'dhruv_mehta', 'anjali_devadiga',
  'yash_thakur', 'prerana_hebbar', 'sameer_khan', 'bhavana_raju', 'kunal_bose',
  'deepika_shastri', 'ravi_teja', 'swathi_nayak', 'omkar_jadhav', 'gayatri_bhandari',
  // Batch C — Weekend
  'aryan_choudhary', 'nisha_pillai', 'vikram_hosmani', 'sakshi_dixit', 'tejas_angadi',
  'ramya_krishnan', 'suraj_yadav', 'pallavi_kotian', 'irfan_sheikh', 'chaitra_urs',
  'mohit_saxena', 'vidya_bhagat', 'ajay_mallya', 'keerthana_suresh', 'rohit_khanna',
  'spoorthi_gaonkar', 'farhan_ali', 'megha_tendulkar', 'sachin_holla', 'anushka_rai',
];

// ── syllabus: Physics (PUC/NEET-JEE) + Mathematics (SSLC) + Chemistry ────────
//
// Every student gets this identical structure (their own copy, own ids).
// pin: badge state from the demo brief, applied to students with active personas.

const SYLLABUS = [
  {
    name: 'Physics', color: '#6366f1', icon: 'Atom',
    chapters: [
      {
        name: 'Mechanics', difficulty: 'Hard', priority: 'High',
        topics: [
          { title: "Newton's Laws of Motion", difficulty: 'Medium', priority: 'High', pin: 'recent' },
          { title: 'Rotational Dynamics', difficulty: 'Hard', priority: 'High', pin: 'due_today' },
          { title: 'Work, Energy & Power', difficulty: 'Medium', priority: 'High' },
          { title: 'Gravitation', difficulty: 'Medium', priority: 'Medium' },
          { title: 'Simple Harmonic Motion', difficulty: 'Hard', priority: 'Medium' },
        ],
      },
      {
        name: 'Electrostatics', difficulty: 'Hard', priority: 'High',
        topics: [
          { title: "Coulomb's Law & Electric Field", difficulty: 'Medium', priority: 'High', pin: 'overdue' },
          { title: "Gauss's Law & Applications", difficulty: 'Hard', priority: 'High' },
          { title: 'Electric Potential & Capacitance', difficulty: 'Hard', priority: 'Medium' },
        ],
      },
      {
        name: 'Optics', difficulty: 'Medium', priority: 'Medium',
        topics: [
          { title: 'Ray Optics & Optical Instruments', difficulty: 'Medium', priority: 'High', pin: 'upcoming' },
          { title: 'Wave Optics — Interference & Diffraction', difficulty: 'Hard', priority: 'Medium' },
        ],
      },
      {
        name: 'Modern Physics', difficulty: 'Medium', priority: 'High',
        topics: [
          { title: 'Photoelectric Effect', difficulty: 'Medium', priority: 'High', pin: 'none' },
          { title: 'Bohr Model & Hydrogen Spectra', difficulty: 'Medium', priority: 'Medium' },
          { title: 'Nuclei & Radioactivity', difficulty: 'Easy', priority: 'Medium' },
        ],
      },
    ],
  },
  {
    name: 'Mathematics', color: '#f97316', icon: 'Calculator',
    chapters: [
      {
        name: 'Algebra', difficulty: 'Medium', priority: 'High',
        topics: [
          { title: 'Quadratic Equations', difficulty: 'Medium', priority: 'High', pin: 'recent' },
          { title: 'Pair of Linear Equations in Two Variables', difficulty: 'Easy', priority: 'High', pin: 'upcoming' },
          { title: 'Arithmetic Progressions', difficulty: 'Easy', priority: 'Medium' },
          { title: 'Polynomials', difficulty: 'Medium', priority: 'Medium' },
        ],
      },
      {
        name: 'Trigonometry', difficulty: 'Medium', priority: 'High',
        topics: [
          { title: 'Trigonometric Identities', difficulty: 'Medium', priority: 'High', pin: 'due_tomorrow' },
          { title: 'Trigonometric Ratios', difficulty: 'Easy', priority: 'Medium' },
          { title: 'Heights & Distances', difficulty: 'Medium', priority: 'Medium' },
        ],
      },
      {
        name: 'Coordinate Geometry', difficulty: 'Medium', priority: 'Medium',
        topics: [
          { title: 'Circles', difficulty: 'Medium', priority: 'High', pin: 'overdue' },
          { title: 'Distance & Section Formula', difficulty: 'Easy', priority: 'Medium' },
          { title: 'Area of a Triangle', difficulty: 'Easy', priority: 'Low' },
        ],
      },
    ],
  },
  {
    name: 'Chemistry', color: '#10b981', icon: 'FlaskConical',
    chapters: [
      {
        name: 'Chemical Bonding', difficulty: 'Hard', priority: 'High',
        topics: [
          { title: 'Chemical Bonding & Molecular Structure', difficulty: 'Hard', priority: 'High', pin: 'recent' },
          { title: 'VSEPR Theory & Hybridisation', difficulty: 'Medium', priority: 'High' },
          { title: 'Molecular Orbital Theory', difficulty: 'Hard', priority: 'Medium' },
        ],
      },
      {
        name: 'Organic Chemistry', difficulty: 'Hard', priority: 'High',
        topics: [
          { title: 'Aldehydes, Ketones & Carboxylic Acids', difficulty: 'Hard', priority: 'High', pin: 'overdue' },
          { title: 'Hydrocarbons — Alkanes, Alkenes & Alkynes', difficulty: 'Medium', priority: 'High' },
          { title: 'Haloalkanes & Haloarenes', difficulty: 'Medium', priority: 'Medium' },
        ],
      },
    ],
  },
];

// ── notes content (markdown) for a subset of topics ──────────────────────────

const NOTES = {
  "Newton's Laws of Motion": `## Newton's Laws — Quick Summary

1. **First law (inertia):** a body stays at rest / uniform motion unless a net external force acts on it.
2. **Second law:** \`F = dp/dt = ma\` (for constant mass). Net force and acceleration are always in the same direction.
3. **Third law:** action–reaction pairs act on *different* bodies — they never cancel.

### Common traps
- Normal reaction ≠ mg on an incline → \`N = mg cosθ\`
- Apparent weight in a lift: accelerating up → \`N = m(g + a)\`, down → \`N = m(g − a)\`
- Friction: \`f ≤ μN\`; static friction is self-adjusting.

**PYQ (NEET 2023):** block on rough incline, find minimum force to prevent sliding.`,

  'Rotational Dynamics': `## Rotational Dynamics

- Torque: \`τ = Iα\` (rotational analogue of F = ma)
- Angular momentum: \`L = Iω\`; conserved when net external torque is zero.
- Rolling without slipping: \`v = rω\`, KE = ½mv² + ½Iω²

| Body | I (about centre) |
|------|------------------|
| Ring | MR² |
| Disc | ½MR² |
| Solid sphere | (2/5)MR² |
| Hollow sphere | (2/3)MR² |
| Rod (centre) | ML²/12 |

⚠ Revise the parallel & perpendicular axis theorems before attempting PYQs.`,

  "Coulomb's Law & Electric Field": `## Coulomb's Law & Electric Field

- \`F = kq₁q₂ / r²\`, where k = 9 × 10⁹ N·m²/C²
- Field of a point charge: \`E = kq / r²\` (radially outward for +q)
- Superposition: net field = **vector** sum of individual fields.

### Field patterns to remember
- Dipole on axial line: \`E = 2kp / r³\`
- Dipole on equatorial line: \`E = kp / r³\` (opposite to p)
- Uniformly charged ring, on axis: \`E = kqx / (x² + R²)^{3/2}\` — max at x = R/√2`,

  'Ray Optics & Optical Instruments': `## Ray Optics

- Mirror formula: \`1/v + 1/u = 1/f\`; magnification \`m = −v/u\`
- Lens formula: \`1/v − 1/u = 1/f\`; power \`P = 1/f\` (in metres) dioptre
- Total internal reflection: needs denser → rarer, angle > critical angle, \`sin C = 1/μ\`

### Instruments
- Simple microscope: \`M = 1 + D/f\`
- Compound microscope: \`M = (L/f₀)(D/fₑ)\`
- Telescope (normal adjustment): \`M = f₀/fₑ\``,

  'Photoelectric Effect': `## Photoelectric Effect

- Einstein's equation: \`hν = φ + KEmax\`
- Stopping potential: \`eV₀ = KEmax\`
- Intensity ↑ → more photoelectrons, **same** KEmax; frequency ↑ → higher KEmax.
- No emission below threshold frequency, regardless of intensity — key evidence for photon picture.`,

  'Quadratic Equations': `## Quadratic Equations (SSLC)

Standard form: \`ax² + bx + c = 0\`, a ≠ 0

- Roots: \`x = [−b ± √(b² − 4ac)] / 2a\`
- Discriminant D = b² − 4ac:
  - D > 0 → two distinct real roots
  - D = 0 → equal roots (x = −b/2a)
  - D < 0 → no real roots
- Sum of roots = −b/a, product = c/a

**Board pattern:** one 3-mark solve-by-formula + one word problem (speed/age/area) every year.`,

  'Trigonometric Identities': `## Trigonometric Identities

Core three:
1. \`sin²θ + cos²θ = 1\`
2. \`1 + tan²θ = sec²θ\`
3. \`1 + cot²θ = cosec²θ\`

Values table (0°, 30°, 45°, 60°, 90°) — must be instant recall.

**Trick:** in proving questions, convert everything to sin & cos first, then simplify.`,

  'Circles': `## Circles (Coordinate Geometry + Theorems)

- Tangent ⊥ radius at point of contact.
- Tangents from an external point are equal in length: \`PA = PB\`.
- Angle in a semicircle = 90°.

**Construction Q (4 marks):** tangents to a circle from an external point — practise with ruler & compass, arcs must be visible.`,

  'Chemical Bonding & Molecular Structure': `## Chemical Bonding

- Bond order (MOT) = ½(Nb − Na); higher bond order → shorter, stronger bond.
- VSEPR shapes: BeCl₂ linear · BF₃ trigonal planar · CH₄ tetrahedral · NH₃ pyramidal · H₂O bent
- Hybridisation shortcut: H = ½[V + M − C + A]

### Dipole moments
- CO₂: μ = 0 (linear, bonds cancel) · H₂O: μ ≠ 0 (bent)
- NH₃ > NF₃ (lone-pair moment adds in NH₃, opposes in NF₃) — favourite NEET trap.`,

  'Aldehydes, Ketones & Carboxylic Acids': `## Aldehydes, Ketones & Carboxylic Acids

Distinguishing tests:
- **Tollens' test:** aldehydes → silver mirror (ketones negative)
- **Fehling's test:** aliphatic aldehydes → red ppt (aromatic aldehydes negative!)
- **Iodoform test:** methyl ketones + CH₃CHO → yellow ppt

Name reactions to revise: Aldol condensation · Cannizzaro (no α-H) · Clemmensen (Zn-Hg/HCl) · Wolff–Kishner (NH₂NH₂/KOH) · HVZ (carboxylic acids + Cl₂/P)

Acidity order: **HCOOH > C₆H₅COOH > CH₃COOH** — EWG ↑ acidity, EDG ↓ acidity.`,
};

const FLASHCARDS = {
  "Newton's Laws of Motion": [
    { front: 'A lift accelerates upward at a. What is the apparent weight of a person of mass m?', back: 'N = m(g + a) — heavier than usual.' },
    { front: 'Why do action–reaction forces never cancel?', back: 'They act on different bodies, so they can never be added on the same free-body diagram.' },
  ],
  'Quadratic Equations': [
    { front: 'Condition for real & equal roots of ax² + bx + c = 0?', back: 'D = b² − 4ac = 0, and then x = −b/2a.' },
    { front: 'Sum and product of roots?', back: 'Sum = −b/a, Product = c/a.' },
  ],
  'Aldehydes, Ketones & Carboxylic Acids': [
    { front: 'Which test distinguishes aldehydes from ketones?', back: "Tollens' test — aldehydes give a silver mirror, ketones do not." },
    { front: 'Cannizzaro reaction works for which aldehydes?', back: 'Aldehydes with NO α-hydrogen (e.g. HCHO, C₆H₅CHO).' },
  ],
};

const TAG_DEFS = [
  { name: 'Important', color: '#ef4444', icon: 'Star' },
  { name: 'Formulae', color: '#f97316', icon: 'Calculator' },
  { name: 'PYQ Repeats', color: '#06b6d4', icon: 'Target' },
  { name: 'Tricky', color: '#8b5cf6', icon: 'AlertTriangle' },
];

// ── time / id helpers ────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.now();
function daysAgo(n) { return NOW - n * DAY_MS; }
function uuid() { return crypto.randomUUID(); }
function randInt(lo, hi) { return lo + Math.floor(Math.random() * (hi - lo + 1)); }
function shuffle(arr) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ── revision-history construction (matches shared/revision.ts badgeState) ────
//
// Ladder intervals: [1, 3, 7, 16, 35, 60, 90]; nextInterval(count)=LADDER[min(count-1,6)].
// badgeState order: Overdue → DueToday → RecentlyRevised (daysSince≤1) → DueTomorrow → Upcoming.
// Note: DueToday wins over RecentlyRevised, so "recent" needs its due date ≥ 2 days out.

function makeHistory(state) {
  switch (state) {
    case 'none': return [];
    // 2 revs, last 1 day ago → interval 3 → due in 2 days; daysSince=1 → RecentlyRevised.
    case 'recent':       return [10, 1].map((d) => ({ id: uuid(), timestamp: daysAgo(d) }));
    case 'upcoming':     return [50, 20, 3].map((d) => ({ id: uuid(), timestamp: daysAgo(d) }));
    case 'due_tomorrow': return [10, 2].map((d) => ({ id: uuid(), timestamp: daysAgo(d) }));
    // 1 rev, 1 day ago → interval 1 → due today; dayDiff=0 wins → DueToday.
    case 'due_today':    return [{ id: uuid(), timestamp: daysAgo(1) }];
    case 'overdue':  return [{ id: uuid(), timestamp: daysAgo(3) }];
    case 'advanced': return [90, 60, 35, 15, 5].map((d) => ({ id: uuid(), timestamp: daysAgo(d) }));
    case 'mastered': return [220, 170, 125, 90, 60, 30, 10].map((d) => ({ id: uuid(), timestamp: daysAgo(d) }));
    default: return [];
  }
}

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
// active=true personas honour the pinned per-topic states from the brief, so
// each such student shows the exact badge spread the demo needs. Non-pinned
// topics draw from `weights` with the persona's `coverage`.

const PERSONAS = {
  star: {
    label: 'Star', active: true, coverage: 0.95, streak: [5, 7],
    weights: [['mastered', 30], ['advanced', 30], ['recent', 20], ['upcoming', 15], ['due_tomorrow', 5]],
  },
  average: {
    label: 'Average', active: true, coverage: 0.60,
    weights: [['recent', 18], ['upcoming', 20], ['due_tomorrow', 10], ['due_today', 12], ['overdue', 15], ['advanced', 15], ['mastered', 10]],
  },
  struggling: {
    label: 'Struggling', active: true, coverage: 0.40,
    weights: [['overdue', 50], ['due_today', 20], ['recent', 10], ['upcoming', 10], ['advanced', 10]],
  },
  inactive: { label: 'Inactive', coverage: 0.60, inactive: true },
  zero: { label: 'Enrolled, 0%', coverage: 0 },
};

// Per batch of 20: 3 star, 11 average, 4 struggling, 1 inactive, 1 zero.
function buildBatchPersonas() {
  const pool = [];
  const add = (key, n) => { for (let i = 0; i < n; i++) pool.push(key); };
  add('star', 3); add('average', 11); add('struggling', 4); add('inactive', 1); add('zero', 1);
  return shuffle(pool);
}

// ── per-student AppData construction ─────────────────────────────────────────

function buildAppData(persona) {
  const data = { subjects: {}, chapters: {}, topics: {}, subjectOrder: [], tags: {}, tagOrder: [] };
  const pinned = []; // { id, pin }
  const plain = []; // topic ids without a pinned state

  SYLLABUS.forEach((subj, si) => {
    const subjectId = uuid();
    const chapterIds = [];
    subj.chapters.forEach((ch, ci) => {
      const chapterId = uuid();
      const topicIds = [];
      ch.topics.forEach((tp, ti) => {
        const topicId = uuid();
        const createdAt = daysAgo(randInt(45, 90));
        const topic = {
          id: topicId, chapterId, title: tp.title, notes: '', order: ti,
          difficulty: tp.difficulty, priority: tp.priority,
          revisionHistory: [], createdAt, updatedAt: createdAt,
        };
        if (NOTES[tp.title] && Math.random() < 0.7) topic.notes = NOTES[tp.title];
        if (FLASHCARDS[tp.title] && Math.random() < 0.5) {
          topic.flashcards = FLASHCARDS[tp.title].map((f) => ({ id: uuid(), ...f, createdAt }));
        }
        data.topics[topicId] = topic;
        topicIds.push(topicId);
        if (tp.pin) pinned.push({ id: topicId, pin: tp.pin }); else plain.push(topicId);
      });
      data.chapters[chapterId] = {
        id: chapterId, subjectId, name: ch.name, order: ci,
        difficulty: ch.difficulty, priority: ch.priority, topicIds,
      };
      chapterIds.push(chapterId);
    });
    data.subjects[subjectId] = { id: subjectId, name: subj.name, color: subj.color, icon: subj.icon, order: si, chapterIds };
    data.subjectOrder.push(subjectId);
  });

  // Tags for everyone; assigned below only to covered topics.
  const tagIds = TAG_DEFS.map((t, i) => {
    const tid = uuid();
    data.tags[tid] = { id: tid, ...t, order: i };
    data.tagOrder.push(tid);
    return tid;
  });

  // Revision histories per persona.
  const setHistory = (id, history) => {
    const t = data.topics[id];
    data.topics[id] = { ...t, revisionHistory: history, updatedAt: history.length ? history[history.length - 1].timestamp : t.updatedAt };
  };

  let covered = [];
  const streakPool = []; // non-pinned covered topics only, so streaks never disturb pinned states
  if (persona.active) {
    // Pinned topics get their exact state from the brief.
    for (const { id, pin } of pinned) {
      const h = makeHistory(pin);
      setHistory(id, h);
      if (h.length) covered.push(id);
    }
    // Remaining topics: persona coverage + weighted states.
    const extra = shuffle(plain).slice(0, Math.round(plain.length * persona.coverage));
    for (const id of extra) {
      const h = makeHistory(weightedPick(persona.weights));
      setHistory(id, h);
      if (h.length) { covered.push(id); streakPool.push(id); }
    }
  } else if (persona.inactive) {
    covered = shuffle([...pinned.map((p) => p.id), ...plain]).slice(0, Math.round(Object.keys(data.topics).length * persona.coverage));
    for (const id of covered) setHistory(id, makeInactiveHistory());
  }
  // zero persona: everything stays Never Revised.

  // Streak for stars: one revision on each of the last n days, distinct topics.
  if (persona.streak && streakPool.length) {
    const n = randInt(persona.streak[0], persona.streak[1]);
    shuffle(streakPool).slice(0, Math.min(n, streakPool.length)).forEach((id, k) => {
      const t = data.topics[id];
      setHistory(id, [...t.revisionHistory, { id: uuid(), timestamp: daysAgo(k) }].sort((a, b) => a.timestamp - b.timestamp));
    });
  }

  // Bookmarks (~3 topics) and tags (~25% of covered topics) for realism.
  const allIds = Object.keys(data.topics);
  for (const id of shuffle(allIds).slice(0, 3)) data.topics[id].bookmarkedAt = daysAgo(randInt(1, 25));
  for (const id of shuffle(covered).slice(0, Math.ceil(covered.length * 0.25))) {
    data.topics[id].tagIds = [tagIds[randInt(0, tagIds.length - 1)]];
  }

  return data;
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

const USER_LIST = [HEAD.username, ...STUDENTS].map((u) => `'${u}'`).join(',');
const SEEDED_USER_FILTER = `username_lower IN (${USER_LIST})`;

// ── auth / org helpers ────────────────────────────────────────────────────────

async function register(username, email, password, domain) {
  const res = await api('POST', '/api/auth/register', { username, password, domain, email });
  if (res.status !== 201 && res.status !== 409) {
    throw new Error(`register ${username} → ${res.status}: ${await res.text().catch(() => '')}`);
  }
  return res.status === 201;
}

async function login(username, password) {
  const res = await req('POST', '/api/auth/login', { body: { username, password }, ok: [200] });
  return (await res.json()).token;
}

async function findOrCreateOrg(token) {
  const { memberships = [] } = await (await req('GET', '/api/orgs/me', { token })).json();
  const existing = memberships.find((m) => m.groupId === null && m.role === 'admin' && m.orgName === ORG_NAME);
  if (existing) return { id: existing.orgId, reused: true };
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

// ── reset ─────────────────────────────────────────────────────────────────────

function reset() {
  console.log('🧹  Resetting seeded batch data…');

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

  console.log(`🌱  Seeding "${ORG_NAME}" — 3 batches × ${BATCH_SIZE} students…\n`);

  // Roster: each batch gets its own shuffled persona pool.
  const roster = STUDENTS.map((username, i) => ({ username, groupIdx: Math.floor(i / BATCH_SIZE) }));
  const personaPools = GROUPS.map(() => buildBatchPersonas());
  roster.forEach((r, i) => { r.personaKey = personaPools[r.groupIdx][i % BATCH_SIZE]; });

  // 1. Register head + all students.
  console.log('1/6  Registering coaching head + 60 students…');
  let created = (await register(HEAD.username, HEAD.email, HEAD.password, HEAD.domain)) ? 1 : 0;
  for (const r of roster) {
    if (await register(r.username, `${r.username}@example.com`, STUDENT_PASSWORD, STUDENT_DOMAIN)) created++;
  }
  console.log(`     ${created} newly created, ${1 + roster.length - created} already existed.`);

  // 2. Verify all emails in one batched psql UPDATE.
  console.log('2/6  Verifying emails (batched psql)…');
  const verify = psql(AUTH_DB, `UPDATE users SET email_verified_at = now() WHERE ${SEEDED_USER_FILTER} AND email_verified_at IS NULL`);
  console.log(verify.ok ? '     Verified ✓' : '     ⚠ Could not auto-verify (logins will surface it)');

  // 3. Head logs in; create/reuse org + groups + invite codes.
  console.log('3/6  Setting up org, batches, invite codes…');
  const headToken = await login(HEAD.username, HEAD.password);
  const { id: orgId, reused } = await findOrCreateOrg(headToken);
  console.log(`     Org ${reused ? 'reused' : 'created'}: ${orgId}`);
  const groupInfo = [];
  for (const g of GROUPS) {
    const groupId = await findOrCreateGroup(headToken, orgId, g.name);
    const code = await mintInviteCode(headToken, groupId);
    groupInfo.push({ ...g, id: groupId, code });
    console.log(`     ${g.name}: group ${groupId} · code ${code}`);
  }

  // 4. Seed each student: login → PUT custom 3-subject AppData → join batch.
  console.log('4/6  Seeding students (syllabus + revision history)…');
  const tally = {};
  for (const r of roster) {
    const persona = PERSONAS[r.personaKey];
    const token = await login(r.username, STUDENT_PASSWORD);
    await req('PUT', '/api/data', { body: buildAppData(persona), token, ok: [204] });
    await req('POST', '/api/orgs/join', { body: { code: groupInfo[r.groupIdx].code }, token, ok: [200] });
    tally[r.personaKey] = (tally[r.personaKey] ?? 0) + 1;
    process.stdout.write('.');
  }
  process.stdout.write('\n');

  // 5. Persona summary.
  console.log('5/6  Roster summary:');
  for (const key of Object.keys(PERSONAS)) {
    if (tally[key]) console.log(`     ${PERSONAS[key].label.padEnd(14)} ${tally[key]}`);
  }

  // 6. Post-seed sanity check: pull each batch's cohort summary as the head.
  console.log('6/6  Verifying via cohort summary…');
  for (const g of groupInfo) {
    const res = await api('GET', `/api/cohort/groups/${g.id}/summary`, null, headToken);
    if (res.status !== 200) { console.log(`     ⚠ ${g.name} summary → ${res.status}`); continue; }
    const s = await res.json();
    const t = s.totals ?? {};
    console.log(`     ${g.name.padEnd(30)} members=${t.members}  completion=${t.completionPct}%  dueToday=${t.dueToday}  overdue=${t.overdue}`);
  }

  console.log('\n✅  Done!\n');
  console.log(`  URL:       ${BASE}`);
  console.log(`  Head:      ${HEAD.username} / ${HEAD.password}   → open /coaching`);
  console.log(`  Students:  any of the 60 usernames (e.g. ${STUDENTS[0]}, ${STUDENTS[20]}, ${STUDENTS[40]}) / ${STUDENT_PASSWORD}`);
  console.log(`  Org:       ${ORG_NAME} (${orgId})`);
}

main().catch((err) => { console.error('\n❌', err.message); process.exit(1); });
