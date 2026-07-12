import { describe, it, expect } from 'vitest';
import { seedData } from './seed';

describe('seedData', () => {
  it('creates 13 subjects with matching subjectOrder', () => {
    const data = seedData();
    expect(data.subjectOrder).toHaveLength(13);
    expect(Object.keys(data.subjects)).toHaveLength(13);
    for (const id of data.subjectOrder) {
      expect(data.subjects[id]).toBeDefined();
    }
  });
  it('starts with no chapters or topics', () => {
    const data = seedData();
    expect(Object.keys(data.chapters)).toHaveLength(0);
    expect(Object.keys(data.topics)).toHaveLength(0);
  });
  it('includes Fluid Mechanics', () => {
    const data = seedData();
    const names = Object.values(data.subjects).map((s) => s.name);
    expect(names).toContain('Fluid Mechanics');
  });
});
