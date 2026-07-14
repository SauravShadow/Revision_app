/**
 * scripts/create-user.mjs
 * One-shot CLI to create a user in data/auth.json.
 * Usage: node scripts/create-user.mjs <username> <password> <domain>
 *
 * Domains: civil-engineering | software-engineering | gate-cs |
 *          mechanical-engineering | electrical-engineering
 */
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const VALID_DOMAINS = [
  'civil-engineering',
  'software-engineering',
  'gate-cs',
  'mechanical-engineering',
  'electrical-engineering',
];

const [,, username, password, domain = 'civil-engineering'] = process.argv;

if (!username || !password) {
  console.error('Usage: node scripts/create-user.mjs <username> <password> [domain]');
  process.exit(1);
}
if (!VALID_DOMAINS.includes(domain)) {
  console.error(`Invalid domain. Valid options: ${VALID_DOMAINS.join(', ')}`);
  process.exit(1);
}

// ── PBKDF2 hash (same algorithm as lib/auth/userStore.ts) ────────────────────
const ITERATIONS = 310_000;
const KEY_LEN = 32;
const DIGEST = 'sha256';

async function hashPassword(pwd) {
  const salt = crypto.randomBytes(16);
  const key = await new Promise((resolve, reject) => {
    crypto.pbkdf2(pwd, salt, ITERATIONS, KEY_LEN, DIGEST, (err, dk) => {
      if (err) reject(err); else resolve(dk);
    });
  });
  return `${ITERATIONS}:${salt.toString('hex')}:${key.toString('hex')}`;
}

// ── Read / write auth store ───────────────────────────────────────────────────
const authFile = path.join(ROOT, 'data', 'auth.json');

async function readStore() {
  try {
    const raw = await fs.readFile(authFile, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { users: [] };
  }
}

async function writeStore(store) {
  await fs.mkdir(path.dirname(authFile), { recursive: true });
  const tmp = `${authFile}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), 'utf8');
  await fs.rename(tmp, authFile);
}

// ── Main ─────────────────────────────────────────────────────────────────────
const store = await readStore();
const existing = store.users.find(
  (u) => u.username.toLowerCase() === username.toLowerCase()
);

if (existing) {
  // Update password + domain instead of erroring
  existing.passwordHash = await hashPassword(password);
  existing.domain = domain;
  await writeStore(store);
  console.log(`\n✅ Updated existing user "${username}" (domain: ${domain})`);
} else {
  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  store.users.push({ id, username, passwordHash, domain, createdAt: Date.now() });
  await writeStore(store);
  console.log(`\n✅ Created user "${username}" (domain: ${domain})`);
}

console.log(`   Username : ${username}`);
console.log(`   Password : ${password}`);
console.log(`   Domain   : ${domain}`);
console.log(`   Auth file: ${authFile}\n`);
console.log('You can change the password anytime by re-running this script.\n');
