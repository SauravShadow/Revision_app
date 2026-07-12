import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { seedData } from './seed';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ce-filestore-'));
  process.env.DATA_FILE = path.join(dir, 'appdata.json');
});

afterEach(async () => {
  delete process.env.DATA_FILE;
  await fs.rm(dir, { recursive: true, force: true });
});

describe('fileStore', () => {
  it('returns null before anything is written', async () => {
    const { readData } = await import('./fileStore');
    expect(await readData()).toBeNull();
  });

  it('round-trips written data and creates the directory', async () => {
    // Point at a nested, not-yet-existing directory to prove mkdir works.
    process.env.DATA_FILE = path.join(dir, 'nested', 'appdata.json');
    const { readData, writeData } = await import('./fileStore');
    const data = seedData();
    await writeData(data);
    expect(await readData()).toEqual(data);
  });

  it('overwrites prior snapshots', async () => {
    const { readData, writeData } = await import('./fileStore');
    const first = seedData();
    await writeData(first);
    const second = seedData();
    await writeData(second);
    const loaded = await readData();
    expect(loaded!.subjectOrder).toEqual(second.subjectOrder);
  });
});
