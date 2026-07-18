import { it, expect, describe } from 'vitest';
import type { AppData, Revision } from '@revision-app/shared';
import { todayQueue } from './todayQueue';

const DAY = 86_400_000;
const NOW = 1_700_000_000_000;
const rev = (daysAgo: number): Revision => ({ id: `r${daysAgo}`, timestamp: NOW - daysAgo * DAY });

// badgeState reference: [rev(3)] -> Overdue, [rev(1)] -> DueToday, [rev(0)] -> RecentlyRevised, [] -> NeverRevised.
function makeData(): AppData {
  return {
    subjects: { s1: { id: 's1', name: 'Structures' }, s2: { id: 's2', name: 'Geotech' } },
    chapters: { c1: { id: 'c1', subjectId: 's1', name: 'Beams' }, c2: { id: 'c2', subjectId: 's2', name: 'Soil' } },
    topics: {
      tOver: { id: 'tOver', chapterId: 'c1', title: 'Bending', revisionHistory: [rev(3)] },
      tDue: { id: 'tDue', chapterId: 'c1', title: 'Shear', revisionHistory: [rev(1)] },
      tRecent: { id: 'tRecent', chapterId: 'c2', title: 'Compaction', revisionHistory: [rev(0)] },
      tNew: { id: 'tNew', chapterId: 'c2', title: 'Permeability', revisionHistory: [] },
    },
  } as unknown as AppData;
}

describe('todayQueue', () => {
  it('includes only Overdue and DueToday topics, overdue first', () => {
    const q = todayQueue(makeData(), NOW);
    expect(q.map((i) => i.topic.id)).toEqual(['tOver', 'tDue']);
    expect(q.map((i) => i.state)).toEqual(['Overdue', 'DueToday']);
  });

  it('attaches subject and chapter context to each item', () => {
    const q = todayQueue(makeData(), NOW);
    expect(q[0].subject?.name).toBe('Structures');
    expect(q[0].chapter?.name).toBe('Beams');
  });

  it('excludes topics under an archived chapter', () => {
    const d = makeData();
    d.chapters.c1.archivedAt = NOW; // hides both tOver and tDue
    expect(todayQueue(d, NOW)).toEqual([]);
  });
});
