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

  it('seeds chapters and topics for the syllabus', () => {
    const data = seedData();
    expect(Object.keys(data.chapters).length).toBeGreaterThan(0);
    expect(Object.keys(data.topics).length).toBeGreaterThan(0);
  });

  it('has referential integrity across the hierarchy', () => {
    const data = seedData();
    for (const sid of data.subjectOrder) {
      const subject = data.subjects[sid];
      expect(subject.chapterIds.length).toBeGreaterThan(0);
      for (const cid of subject.chapterIds) {
        const chapter = data.chapters[cid];
        expect(chapter).toBeDefined();
        expect(chapter.subjectId).toBe(sid);
        expect(chapter.topicIds.length).toBeGreaterThan(0);
        for (const tid of chapter.topicIds) {
          const topic = data.topics[tid];
          expect(topic).toBeDefined();
          expect(topic.chapterId).toBe(cid);
        }
      }
    }
  });

  it('seeds the built-in tags', () => {
    const data = seedData();
    expect(data.tagOrder?.length).toBeGreaterThan(0);
    const names = Object.values(data.tags ?? {}).map((t) => t.name);
    expect(names).toContain('Formula');
    expect(names).toContain('PYQ');
  });

  it('includes key ESE subjects', () => {
    const names = Object.values(seedData().subjects).map((s) => s.name);
    expect(names).toContain('Structural Analysis');
    expect(names).toContain('Environmental Engineering');
    expect(names).toContain('Transportation Engineering');
  });
});
