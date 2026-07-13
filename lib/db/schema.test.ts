import { describe, it, expect } from 'vitest';
import { getPool } from './pool';

describe('schema', () => {
  it('creates the users table with a unique lowercase-username index', async () => {
    const { rows } = await getPool().query(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'users' AND indexname = 'users_username_lower_idx'`,
    );
    expect(rows).toHaveLength(1);
  });

  it('creates the app_data table referencing users', async () => {
    const { rows } = await getPool().query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'app_data' ORDER BY ordinal_position`,
    );
    expect(rows.map((r) => r.column_name)).toEqual(['user_id', 'data', 'updated_at']);
  });
});
