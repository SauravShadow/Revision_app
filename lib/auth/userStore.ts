// Server-only: manages the user registry persisted at data/auth.json.
// Uses the same atomic-write pattern as fileStore.ts.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Domain, UserRecord } from './types';

function authFilePath(): string {
  const dataDir = process.env.DATA_DIR ?? path.join(process.cwd(), 'data');
  return path.join(dataDir, 'auth.json');
}

interface AuthStore {
  users: UserRecord[];
}

async function readStore(): Promise<AuthStore> {
  try {
    const raw = await fs.readFile(authFilePath(), 'utf8');
    return JSON.parse(raw) as AuthStore;
  } catch {
    return { users: [] };
  }
}

async function writeStore(store: AuthStore): Promise<void> {
  const file = authFilePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), 'utf8');
  await fs.rename(tmp, file);
}

export async function listUsers(): Promise<UserRecord[]> {
  const store = await readStore();
  return store.users;
}

export async function findByUsername(username: string): Promise<UserRecord | null> {
  const store = await readStore();
  return store.users.find((u) => u.username.toLowerCase() === username.toLowerCase()) ?? null;
}

export async function findById(id: string): Promise<UserRecord | null> {
  const store = await readStore();
  return store.users.find((u) => u.id === id) ?? null;
}

export async function createUser(
  username: string,
  password: string,
  domain: Domain,
): Promise<UserRecord> {
  const store = await readStore();
  const existing = store.users.find(
    (u) => u.username.toLowerCase() === username.toLowerCase(),
  );
  if (existing) throw new Error('USERNAME_TAKEN');

  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  const user: UserRecord = { id, username, passwordHash, domain, createdAt: Date.now() };
  store.users.push(user);
  await writeStore(store);
  return user;
}

// ── Password hashing (PBKDF2-SHA256 via Node crypto, no extra deps) ──────────

const ITERATIONS = 310_000;
const KEY_LEN = 32;
const DIGEST = 'sha256';

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await new Promise<Buffer>((resolve, reject) => {
    crypto.pbkdf2(password, salt, ITERATIONS, KEY_LEN, DIGEST, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
  // Store as "iterations:salt_hex:key_hex"
  return `${ITERATIONS}:${salt.toString('hex')}:${key.toString('hex')}`;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [iters, saltHex, keyHex] = hash.split(':');
  if (!iters || !saltHex || !keyHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(keyHex, 'hex');
  const key = await new Promise<Buffer>((resolve, reject) => {
    crypto.pbkdf2(password, salt, parseInt(iters, 10), expected.length, DIGEST, (err, dk) => {
      if (err) reject(err);
      else resolve(dk);
    });
  });
  return crypto.timingSafeEqual(key, expected);
}
