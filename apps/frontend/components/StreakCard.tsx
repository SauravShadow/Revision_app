'use client';
import { Flame } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { currentStreak, longestStreak } from '@/lib/insights/streak';

/**
 * Current revision streak on the home screen. The streak maths already existed
 * in lib/insights/streak but was only ever shown on /insights and /coaching —
 * the place it actually motivates is the screen you open every day.
 *
 * Hidden at zero: a "0 day streak" badge is a reprimand, not a motivator.
 */
export function StreakCard() {
  const data = useStore();
  const now = Date.now();
  const current = currentStreak(data, now);
  if (current === 0) return null;
  const best = longestStreak(data);
  return (
    <div className="glass mb-3 flex items-center gap-3 rounded-xl px-4 py-2.5 md:mb-5 md:py-3">
      <Flame size={18} className="shrink-0 text-annotation" />
      <div className="min-w-0">
        <span className="bp-figure text-lg text-ink">{current}</span>
        <span className="ml-1.5 text-sm text-ink-dim">day{current === 1 ? '' : 's'} in a row</span>
      </div>
      {best > current && (
        <span className="tblabel ml-auto shrink-0 text-ink-faint">best {best}</span>
      )}
    </div>
  );
}
