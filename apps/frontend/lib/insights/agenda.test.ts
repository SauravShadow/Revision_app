import { it, expect, describe } from 'vitest';
import type { AppData, Revision } from '@revision-app/shared';
import { startOfDay } from './day';
import { buildAgenda } from './agenda';

const DAY = 86_400_000;
const NOW = 1_700_000_000_000;
const rev = (daysAgo: number): Revision => ({ id: `r${daysAgo}-${Math.random()}`, timestamp: NOW - daysAgo * DAY });

// tOver: overdue. tToday: due today. tFar: due ~35 days out (beyond horizon). tNew: never revised.
function makeData(): AppData {
  return {
    subjects: { s1: { id: 's1', name: 'Structures', chapterIds: ['c1'] } },
    chapters: { c1: { id: 'c1', subjectId: 's1', name: 'Beams', topicIds: ['tOver', 'tToday', 'tFar', 'tNew'] } },
    topics: {
      tOver: { id: 'tOver', chapterId: 'c1', title: 'Bending', revisionHistory: [rev(3)] },
      tToday: { id: 'tToday', chapterId: 'c1', title: 'Shear', revisionHistory: [rev(1)] },
      tFar: { id: 'tFar', chapterId: 'c1', title: 'Torsion', revisionHistory: [rev(0), rev(0), rev(0), rev(0), rev(0)] },
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
    expect(a.days.every((d) => d.topics.every((t) => t.status === 'due'))).toBe(true);
  });

  it('excludes topics due beyond the horizon and never-revised topics', () => {
    const a = buildAgenda(makeData(), NOW, 14);
    const allIds = [...a.overdue, ...a.days.flatMap((d) => d.topics)].map((t) => t.id);
    expect(allIds).not.toContain('tFar');
    expect(allIds).not.toContain('tNew');
  });

  it('attaches subject and chapter context', () => {
    const a = buildAgenda(makeData(), NOW, 14);
    const t = [...a.overdue, ...a.days.flatMap((d) => d.topics)].find((x) => x.id === 'tToday');
    expect(t?.subject).toBe('Structures');
    expect(t?.chapter).toBe('Beams');
  });

  it('returns days sorted ascending', () => {
    const days = buildAgenda(makeData(), NOW, 14).days;
    const ts = days.map((d) => d.ts);
    expect(ts).toEqual([...ts].sort((a, b) => a - b));
  });
});
