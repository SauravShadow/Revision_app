import { describe, it, expect, beforeEach } from 'vitest';
import { LocalStorageRepository, STORAGE_KEY } from './LocalStorageRepository';
import { seedData } from './seed';

describe('LocalStorageRepository', () => {
  beforeEach(() => window.localStorage.clear());

  it('returns null before anything is saved', async () => {
    const repo = new LocalStorageRepository();
    expect(await repo.load()).toBeNull();
  });

  it('round-trips saved data', async () => {
    const repo = new LocalStorageRepository();
    const data = seedData();
    await repo.save(data);
    const loaded = await repo.load();
    expect(loaded).toEqual(data);
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it('preserves subjectOrder exactly', async () => {
    const repo = new LocalStorageRepository();
    const data = seedData();
    await repo.save(data);
    const loaded = await repo.load();
    expect(loaded!.subjectOrder).toEqual(data.subjectOrder);
  });
});
