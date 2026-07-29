import { it, expect, describe } from 'vitest';
import type { AppData, Revision } from '@revision-app/shared';
import { startOfDay } from './day';
import { buildAgenda, loadByDay } from './agenda';

const DAY = 86_400_000;
const NOW = 1_700_000_000_000;
const rev = (daysAgo: number): Revision => ({ id: `r${daysAgo}-${Math.random()}`, timestamp: NOW - daysAgo * DAY });

// tOver: overdue (planned 2d ago). tToday: planned today. tDone: revised today (completed).
// tUpcoming: planned 33 days out (beyond horizon). tNew: never revised, unplanned.
function makeData(): AppData {
  return {
    subjects: { s1: { id: 's1', name: 'Structures', color: '#e0662b', chapterIds: ['c1'] } },
    chapters: { c1: { id: 'c1', subjectId: 's1', name: 'Beams', topicIds: ['tOver', 'tToday', 'tDone', 'tUpcoming', 'tNew'] } },
    topics: {
      tOver: { id: 'tOver', chapterId: 'c1', title: 'Bending', revisionHistory: [rev(3)], plannedAt: NOW - 2 * DAY },
      tToday: { id: 'tToday', chapterId: 'c1', title: 'Shear', revisionHistory: [rev(1)], plannedAt: NOW },
      tDone: { id: 'tDone', chapterId: 'c1', title: 'Torsion', revisionHistory: [rev(0), rev(0), rev(0), rev(0), rev(0)], plannedAt: NOW + 35 * DAY },
      tUpcoming: { id: 'tUpcoming', chapterId: 'c1', title: 'Columns', revisionHistory: [rev(2), rev(2), rev(2), rev(2), rev(2)], plannedAt: NOW + 33 * DAY },
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

  it('collects revised-but-unplanned topics into the unplanned bucket', () => {
    const data = makeData();
    data.topics.tSkipped = { id: 'tSkipped', chapterId: 'c1', title: 'Fatigue', revisionHistory: [rev(2)], plannedAt: null } as unknown as (typeof data.topics)[string];
    data.chapters.c1.topicIds.push('tSkipped');
    const a = buildAgenda(data, NOW, 14);
    expect(a.unplanned.map((t) => t.id)).toContain('tSkipped');
    expect(a.unplanned.every((t) => t.status === 'unplanned')).toBe(true);
    expect(a.days.flatMap((d) => d.topics.map((t) => t.id))).not.toContain('tSkipped');
  });

  it('a planned never-revised topic appears on its planned day', () => {
    const data = makeData();
    data.topics.tPlannedNew = { id: 'tPlannedNew', chapterId: 'c1', title: 'Creep', revisionHistory: [], plannedAt: NOW + 2 * DAY } as unknown as (typeof data.topics)[string];
    data.chapters.c1.topicIds.push('tPlannedNew');
    const a = buildAgenda(data, NOW, 14);
    const day = a.days.find((d) => d.ts === startOfDay(NOW + 2 * DAY));
    expect(day?.topics.map((t) => t.id)).toContain('tPlannedNew');
    expect(a.unplanned.map((t) => t.id)).not.toContain('tPlannedNew');
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
