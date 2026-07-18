import { it, expect, describe } from 'vitest';
import type { AppData } from '@revision-app/shared';
import { matchesQuery, subjectMatchesQuery } from './search';

describe('matchesQuery', () => {
  it('is true for a case-insensitive substring hit and false otherwise', () => {
    expect(matchesQuery('Soil Mechanics', 'soil')).toBe(true);
    expect(matchesQuery('Soil Mechanics', 'MECH')).toBe(true);
    expect(matchesQuery('Soil Mechanics', 'hydraulics')).toBe(false);
  });
});

// S1 "Structures" → C1 "Beams" → T1 "Shear force diagram"
function makeData(): AppData {
  return {
    subjects: { s1: { id: 's1', name: 'Structures' }, s2: { id: 's2', name: 'Geotech' } },
    chapters: { c1: { id: 'c1', subjectId: 's1', name: 'Beams' }, c2: { id: 'c2', subjectId: 's2', name: 'Soil' } },
    topics: {
      t1: { id: 't1', chapterId: 'c1', title: 'Shear force diagram', revisionHistory: [] },
      t2: { id: 't2', chapterId: 'c2', title: 'Compaction', revisionHistory: [] },
    },
  } as unknown as AppData;
}

describe('subjectMatchesQuery', () => {
  it('matches on the subject name', () => {
    expect(subjectMatchesQuery(makeData(), 's1', 'struct')).toBe(true);
  });

  it('matches when a chapter or topic under the subject matches', () => {
    expect(subjectMatchesQuery(makeData(), 's1', 'beam')).toBe(true);   // via chapter
    expect(subjectMatchesQuery(makeData(), 's1', 'shear')).toBe(true);  // via topic title
  });

  it('does not match unrelated subjects', () => {
    expect(subjectMatchesQuery(makeData(), 's2', 'shear')).toBe(false);
    expect(subjectMatchesQuery(makeData(), 's1', 'compaction')).toBe(false);
  });

  it('ignores topics under an archived chapter', () => {
    const d = makeData();
    d.chapters.c1.archivedAt = 1;
    expect(subjectMatchesQuery(d, 's1', 'shear')).toBe(false); // topic hidden
    expect(subjectMatchesQuery(d, 's1', 'struct')).toBe(true); // name still matches
  });
});
