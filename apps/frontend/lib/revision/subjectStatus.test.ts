import { it, expect, describe } from 'vitest';
import type { AppData, Revision } from '@revision-app/shared';
import { subjectStatus } from './progress';

const DAY = 86_400_000;
const NOW = 1_700_000_000_000;
const rev = (daysAgo: number): Revision => ({ id: `r${daysAgo}`, timestamp: NOW - daysAgo * DAY });

// badge refs: [rev(3)]->Overdue, [rev(1)]->DueToday, [rev(0)]->RecentlyRevised, []->NeverRevised.
function makeData(): AppData {
  return {
    subjects: {
      sOver: { id: 'sOver', name: 'A', chapterIds: ['cOver'] },
      sDue: { id: 'sDue', name: 'B', chapterIds: ['cDue'] },
      sRecent: { id: 'sRecent', name: 'C', chapterIds: ['cRecent'] },
      sNone: { id: 'sNone', name: 'D', chapterIds: ['cNone'] },
    },
    chapters: {
      cOver: { id: 'cOver', subjectId: 'sOver', topicIds: ['tOver', 'tDue'] },
      cDue: { id: 'cDue', subjectId: 'sDue', topicIds: ['t2'] },
      cRecent: { id: 'cRecent', subjectId: 'sRecent', topicIds: ['t3'] },
      cNone: { id: 'cNone', subjectId: 'sNone', topicIds: ['t4'] },
    },
    topics: {
      tOver: { id: 'tOver', chapterId: 'cOver', title: 'o', revisionHistory: [rev(3)] },
      tDue: { id: 'tDue', chapterId: 'cOver', title: 'd', revisionHistory: [rev(1)] },
      t2: { id: 't2', chapterId: 'cDue', title: 'd2', revisionHistory: [rev(1)] },
      t3: { id: 't3', chapterId: 'cRecent', title: 'r', revisionHistory: [rev(0)] },
      t4: { id: 't4', chapterId: 'cNone', title: 'n', revisionHistory: [] },
    },
  } as unknown as AppData;
}

describe('subjectStatus', () => {
  it('reports the most urgent state present (overdue > due > recent > none)', () => {
    const d = makeData();
    expect(subjectStatus(d, 'sOver', NOW)).toBe('overdue');
    expect(subjectStatus(d, 'sDue', NOW)).toBe('due');
    expect(subjectStatus(d, 'sRecent', NOW)).toBe('recent');
    expect(subjectStatus(d, 'sNone', NOW)).toBe('none');
  });

  it('ignores topics under an archived chapter', () => {
    const d = makeData();
    d.chapters.cOver.archivedAt = NOW;
    expect(subjectStatus(d, 'sOver', NOW)).toBe('none');
  });
});
