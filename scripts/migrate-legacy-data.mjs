// One-off migration: carries the legacy file-based auth.json user registry
// and per-user appdata.json snapshots into Postgres (see
// docs/superpowers/plans/2026-07-13-postgres-foundation.md). Additive and
// idempotent — every insert is ON CONFLICT DO NOTHING, so re-running never
// overwrites a row already in Postgres. User ids are preserved so uploaded
// file blobs (still on disk, keyed by user id) keep resolving correctly.
import 'dotenv/config';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;

export async function migrateLegacyData(pool, dataRoot) {
  const stats = { migratedUsers: 0, skippedUsers: 0, migratedSnapshots: 0, errors: [] };

  const authPath = path.join(dataRoot, 'auth.json');
  if (!existsSync(authPath)) {
    stats.errors.push(`no legacy auth.json at ${authPath}`);
    return stats;
  }

  const { users } = JSON.parse(readFileSync(authPath, 'utf8'));

  for (const user of users) {
    try {
      const { rows } = await pool.query(
        `INSERT INTO users (id, username, password_hash, domain, created_at)
         VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0))
         ON CONFLICT (id) DO NOTHING
         RETURNING id`,
        [user.id, user.username, user.passwordHash, user.domain, user.createdAt],
      );

      if (rows.length === 0) {
        stats.skippedUsers++;
        continue;
      }
      stats.migratedUsers++;

      const appDataPath = path.join(dataRoot, 'users', user.id, 'appdata.json');
      if (existsSync(appDataPath)) {
        const data = readFileSync(appDataPath, 'utf8');
        const result = await pool.query(
          `INSERT INTO app_data (user_id, data, updated_at)
           VALUES ($1, $2::jsonb, now())
           ON CONFLICT (user_id) DO NOTHING
           RETURNING user_id`,
          [user.id, data],
        );
        if (result.rows.length > 0) stats.migratedSnapshots++;
      }
    } catch (err) {
      stats.errors.push(`${user.username} (${user.id}): ${err.message}`);
    }
  }

  return stats;
}

async function main() {
  const dataRoot = process.env.DATA_DIR ?? path.join(process.cwd(), 'data');
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }

  const pool = new Pool({ connectionString });
  try {
    const stats = await migrateLegacyData(pool, dataRoot);
    console.log(
      `Migrated ${stats.migratedUsers} user(s), skipped ${stats.skippedUsers} (already present), ` +
        `migrated ${stats.migratedSnapshots} app_data snapshot(s).`,
    );
    if (stats.errors.length > 0) {
      console.error('Errors:');
      for (const e of stats.errors) console.error(`  - ${e}`);
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
