import { describe, it, expect } from 'vitest';
import { DAY_MS } from '@revision-app/shared';
import type { AppData, Revision, Topic } from '@revision-app/shared';
import { deriveStats, deriveActivity, dueCounts, utcDayKey } from './stats';

const NOW = Date.UTC(2026, 6, 16, 12); // 2026-07-16T12:00Z

const rev = (daysAgo: number): Revision => ({ id: `r${daysAgo}`, timestamp: NOW - daysAgo * DAY_MS });

function topic(id: string, history: Revision[], extra: Partial<Topic> = {}): Topic {
  return {
    id, chapterId: 'c1', title: id, notes: 'SECRET', order: 0, difficulty: 'Easy', priority: 'Low',
    revisionHistory: history, createdAt: 0, updatedAt: 0, ...extra,
  };
}

function appData(topics: Topic[]): AppData {
  return {
    subjects: {
      s1: { id: 's1', name: 'Soil Mechanics', color: '', icon: '', order: 0, chapterIds: ['c1'] },
    },
    chapters: {
      c1: { id: 'c1', subjectId: 's1', name: 'Ch1', order: 0, difficulty: 'Easy', priority: 'Low', topicIds: topics.map((t) => t.id) },
    },
    topics: Object.fromEntries(topics.map((t) => [t.id, t])),
    subjectOrder: ['s1'], tags: {}, tagOrder: [],
  };
}

describe('stats derivation', () => {
  it('utcDayKey formats UTC dates', () => {
    expect(utcDayKey(NOW)).toBe('2026-07-16');
  });

  it('derives totals, completion, coverage, and a due histogram', () => {
    // t1: revised 3d ago once → interval 1d → was due 2d ago (overdue)
    // t2: revised today → due tomorrow
    // t3: never revised → not in histogram
    // t4: archived → ignored entirely
    const data = appData([
      topic('t1', [rev(3)]),
      topic('t2', [rev(0)]),
      topic('t3', []),
      topic('t4', [rev(1)], { archivedAt: NOW }),
    ]);
    const s = deriveStats(data, NOW);
    expect(s.totalTopics).toBe(3);
    expect(s.completedTopics).toBe(2);
    expect(s.dueHistogram).toEqual({ '2026-07-14': 1, '2026-07-17': 1 });
    expect(s.subjectCoverage).toEqual([{ subject: 'Soil Mechanics', total: 3, revised: 2 }]);
    expect(s.streakDays).toBe(1); // t2 revised today
  });

  it('dueCounts splits the histogram around today', () => {
    const hist = { '2026-07-10': 2, '2026-07-16': 3, '2026-07-20': 1 };
    expect(dueCounts(hist, NOW)).toEqual({ dueToday: 3, overdue: 2 });
  });

  it('deriveActivity counts revisions per UTC day for active topics only', () => {
    const data = appData([
      topic('t1', [rev(1), rev(0)]),
      topic('t2', [rev(0)]),
      topic('t4', [rev(0)], { archivedAt: NOW }),
    ]);
    expect(deriveActivity(data)).toEqual({ '2026-07-15': 1, '2026-07-16': 2 });
  });

  it('handles an empty AppData', () => {
    const empty = appData([]);
    const s = deriveStats(empty, NOW);
    expect(s).toEqual({ totalTopics: 0, completedTopics: 0, streakDays: 0, dueHistogram: {}, subjectCoverage: [{ subject: 'Soil Mechanics', total: 0, revised: 0 }] });
    expect(deriveActivity(empty)).toEqual({});
  });
});
