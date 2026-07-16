import { startOfDay } from '@/lib/revision/engine';

export const DAY_MS = 24 * 60 * 60 * 1000;

// DST-safe day stepping: advance the local calendar date, then snap to local midnight.
export function addDays(day: number, n: number): number {
  const d = new Date(day);
  d.setDate(d.getDate() + n);
  return startOfDay(d.getTime());
}

export { startOfDay };
