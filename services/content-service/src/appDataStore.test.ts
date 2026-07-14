import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getPool } from './db';
import { readData, writeData } from './appDataStore';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const sample = { subjects: {}, chapters: {}, topics: {}, subjectOrder: [], tags: {}, tagOrder: [] };

beforeEach(async () => {
  await getPool().query('TRUNCATE app_data');
});

afterAll(async () => {
  await getPool().end();
});

describe('appDataStore', () => {
  it('returns null before anything is written', async () => {
    expect(await readData(USER_ID)).toBeNull();
  });

  it('round-trips written data', async () => {
    await writeData(USER_ID, sample);
    expect(await readData(USER_ID)).toEqual(sample);
  });
});
