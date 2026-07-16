import { describe, it, expect } from 'vitest';
import type { AppData } from '@revision-app/shared';
import { calendarMonth } from './calendar';
import { startOfDay } from './day';

// now = 2026-07-15. A topic revised on 2026-07-14 is due +1 day = 2026-07-15 (today, DueToday).
const now = new Date(2026, 6, 15, 12, 0, 0).getTime();
const revisedYesterday = new Date(2026, 6, 14, 10, 0, 0).getTime();

function fixture(): AppData {
  return {
    subjectOrder: ['s1'],
    subjects: { s1: { id: 's1', name: 'S', color: '#000', icon: 'X', order: 0, chapterIds: ['c1'] } },
    chapters: { c1: { id: 'c1', subjectId: 's1', name: 'C', order: 0, difficulty: 'Medium', priority: 'Medium', topicIds: ['t1', 't2'] } },
    topics: {
      t1: { id: 't1', chapterId: 'c1', title: 'A', notes: '', order: 0, difficulty: 'Medium', priority: 'Medium',
        revisionHistory: [{ id: 'r1', timestamp: revisedYesterday }], createdAt: 0, updatedAt: 0 },
      t2: { id: 't2', chapterId: 'c1', title: 'B', notes: '', order: 1, difficulty: 'Medium', priority: 'Medium',
        revisionHistory: [{ id: 'r2', timestamp: revisedYesterday }], createdAt: 0, updatedAt: 0, archivedAt: 1 },
    },
    tags: {}, tagOrder: [],
  };
}

describe('calendarMonth', () => {
  it('returns a 42-cell grid with in-month flags', () => {
    const cells = calendarMonth(fixture(), 2026, 6, now); // July 2026
    expect(cells).toHaveLength(42);
    expect(cells.some((c) => !c.inMonth)).toBe(true);
    const july1 = cells.find((c) => c.day === new Date(2026, 6, 1).getTime());
    expect(july1?.inMonth).toBe(true);
  });

  it('places completed on the revision day and due on the due day, excluding archived', () => {
    const cells = calendarMonth(fixture(), 2026, 6, now);
    const y14 = cells.find((c) => c.day === new Date(2026, 6, 14).getTime())!;
    const y15 = cells.find((c) => c.day === new Date(2026, 6, 15).getTime())!;
    expect(y14.completedTopicIds).toEqual(['t1']); // t2 archived -> excluded
    expect(y15.dueTopicIds).toEqual(['t1']);       // due +1 day from revision
  });

  it('surfaces the current overdue backlog on the today cell only', () => {
    const overdue: AppData = fixture();
    // revised long ago so it is now overdue
    overdue.topics.t1.revisionHistory = [{ id: 'r1', timestamp: new Date(2026, 5, 1, 10, 0, 0).getTime() }];
    const cells = calendarMonth(overdue, 2026, 6, now);
    const todayCell = cells.find((c) => c.day === startOfDay(now))!;
    expect(todayCell.overdueTopicIds).toContain('t1');
    const otherCell = cells.find((c) => c.day === new Date(2026, 6, 20).getTime())!;
    expect(otherCell.overdueTopicIds).toEqual([]);
  });

  it('excludes a topic whose parent chapter or subject is archived, even if the topic itself is not', () => {
    const data = fixture();
    // t2 itself is archived-at-topic-level in the base fixture; give it a fresh,
    // topic-level-unarchived twin under an archived chapter and another under an archived subject.
    data.subjects.s2 = { id: 's2', name: 'S2', color: '#111', icon: 'Y', order: 1, chapterIds: ['c2'] };
    data.chapters.c2 = { id: 'c2', subjectId: 's2', name: 'C2', order: 0, difficulty: 'Medium', priority: 'Medium', topicIds: ['t3'], archivedAt: 1 };
    data.topics.t3 = { id: 't3', chapterId: 'c2', title: 'ChapterArchivedChild', notes: '', order: 0, difficulty: 'Medium', priority: 'Medium',
      revisionHistory: [{ id: 'r3', timestamp: revisedYesterday }], createdAt: 0, updatedAt: 0 };

    data.subjectOrder.push('s3');
    data.subjects.s3 = { id: 's3', name: 'S3', color: '#222', icon: 'Z', order: 2, chapterIds: ['c3'], archivedAt: 1 };
    data.chapters.c3 = { id: 'c3', subjectId: 's3', name: 'C3', order: 0, difficulty: 'Medium', priority: 'Medium', topicIds: ['t4'] };
    data.topics.t4 = { id: 't4', chapterId: 'c3', title: 'SubjectArchivedChild', notes: '', order: 0, difficulty: 'Medium', priority: 'Medium',
      revisionHistory: [{ id: 'r4', timestamp: revisedYesterday }], createdAt: 0, updatedAt: 0 };

    data.subjectOrder.push('s2');

    const cells = calendarMonth(data, 2026, 6, now);
    const y14 = cells.find((c) => c.day === new Date(2026, 6, 14).getTime())!;
    const y15 = cells.find((c) => c.day === new Date(2026, 6, 15).getTime())!;
    expect(y14.completedTopicIds).not.toContain('t3');
    expect(y14.completedTopicIds).not.toContain('t4');
    expect(y15.dueTopicIds).not.toContain('t3');
    expect(y15.dueTopicIds).not.toContain('t4');
  });
});
