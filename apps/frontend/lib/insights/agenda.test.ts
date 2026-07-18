import { it, expect, describe } from 'vitest';
import type { AppData, Revision } from '@revision-app/shared';
import { startOfDay } from './day';
import { buildAgenda, loadByDay } from './agenda';

const DAY = 86_400_000;
const NOW = 1_700_000_000_000;
const rev = (daysAgo: number): Revision => ({ id: `r${daysAgo}-${Math.random()}`, timestamp: NOW - daysAgo * DAY });

// tOver: overdue. tToday: due today. tDone: revised today (completed).
// tUpcoming: due ~33 days out (beyond horizon). tNew: never revised.
function makeData(): AppData {
  return {
    subjects: { s1: { id: 's1', name: 'Structures', color: '#e0662b', chapterIds: ['c1'] } },
    chapters: { c1: { id: 'c1', subjectId: 's1', name: 'Beams', topicIds: ['tOver', 'tToday', 'tDone', 'tUpcoming', 'tNew'] } },
    topics: {
      tOver: { id: 'tOver', chapterId: 'c1', title: 'Bending', revisionHistory: [rev(3)] },
      tToday: { id: 'tToday', chapterId: 'c1', title: 'Shear', revisionHistory: [rev(1)] },
      tDone: { id: 'tDone', chapterId: 'c1', title: 'Torsion', revisionHistory: [rev(0), rev(0), rev(0), rev(0), rev(0)] },
      tUpcoming: { id: 'tUpcoming', chapterId: 'c1', title: 'Columns', revisionHistory: [rev(2), rev(2), rev(2), rev(2), rev(2)] },
      tNew: { id: 'tNew', chapterId: 'c1', title: 'Buckling', revisionHistory: [] },
    },
  } as unknown as AppData;
}

describe('buildAgenda', () => {
  it('collects overdue topics into their own bucket', () => {
    const a = buildAgenda(makeData(), NOW, 14);
    expect(a.overdue.map((t) => t.id)).toContain('tOver');
    expect(a.overdue.every((t) => t.status === 'overdue')).toBe(true);
  });

  it('groups upcoming due topics by day, starting today', () => {
    const a = buildAgenda(makeData(), NOW, 14);
    const today = a.days.find((d) => d.ts === startOfDay(NOW));
    expect(today?.topics.map((t) => t.id)).toContain('tToday');
    expect(a.days.every((d) => d.topics.every((t) => t.status === 'due' || t.status === 'completed'))).toBe(true);
  });

  it('excludes topics due beyond the horizon and never-revised topics', () => {
    const a = buildAgenda(makeData(), NOW, 14);
    const allIds = [...a.overdue, ...a.days.flatMap((d) => d.topics)].map((t) => t.id);
    expect(allIds).not.toContain('tUpcoming');
    expect(allIds).not.toContain('tNew');
  });

  it('attaches subject and chapter context plus the subject colour', () => {
    const a = buildAgenda(makeData(), NOW, 14);
    const t = [...a.overdue, ...a.days.flatMap((d) => d.topics)].find((x) => x.id === 'tToday');
    expect(t?.subject).toBe('Structures');
    expect(t?.chapter).toBe('Beams');
    expect(t?.subjectColor).toBe('#e0662b');
  });

  it('returns days sorted ascending', () => {
    const days = buildAgenda(makeData(), NOW, 14).days;
    const ts = days.map((d) => d.ts);
    expect(ts).toEqual([...ts].sort((a, b) => a - b));
  });

  it('marks topics revised today as completed, listed after due topics in the today group', () => {
    const a = buildAgenda(makeData(), NOW, 14);
    const today = a.days.find((d) => d.ts === startOfDay(NOW));
    const ids = today?.topics.map((t) => t.id) ?? [];
    expect(ids).toEqual(['tToday', 'tDone']);
    expect(today?.topics.find((t) => t.id === 'tDone')?.status).toBe('completed');
  });

  it('lists each topic exactly once across all buckets', () => {
    const a = buildAgenda(makeData(), NOW, 14);
    const allIds = [...a.overdue, ...a.days.flatMap((d) => d.topics)].map((t) => t.id);
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('always includes Today and Tomorrow groups, even when empty', () => {
    const empty = { subjects: {}, chapters: {}, topics: {} } as unknown as AppData;
    const a = buildAgenda(empty, NOW, 14);
    expect(a.days.map((d) => d.ts)).toEqual([startOfDay(NOW), startOfDay(NOW) + DAY]);
    expect(a.days.every((d) => d.topics.length === 0)).toBe(true);
  });
});

describe('loadByDay', () => {
  it('maps each topic to its display day with the most urgent status as worst', () => {
    const loads = loadByDay(makeData(), NOW);
    const today = startOfDay(NOW);
    // tOver: 1 revision -> 1-day interval -> due 2 days ago
    expect(loads.get(today - 2 * DAY)).toEqual({ count: 1, worst: 'overdue' });
    // tToday due today + tDone completed today; due outranks completed
    expect(loads.get(today)).toEqual({ count: 2, worst: 'due' });
    // tUpcoming is included unbounded (the strip navigates arbitrary weeks)
    expect(loads.get(today + 33 * DAY)).toEqual({ count: 1, worst: 'due' });
  });

  it('ignores never-revised topics', () => {
    const loads = loadByDay(makeData(), NOW);
    const total = [...loads.values()].reduce((n, l) => n + l.count, 0);
    expect(total).toBe(4);
  });
});
