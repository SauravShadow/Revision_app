'use client';
import { useState } from 'react';
import { startOfDay } from '@/lib/revision/engine';
import type { AgendaStatus, DayLoad } from '@/lib/insights/agenda';

const DAY = 86_400_000;
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const BAR: Record<AgendaStatus, string> = {
  overdue: 'var(--alarm)', due: 'var(--annotation)', completed: 'var(--go)', unplanned: 'var(--ink-faint)',
};

// Compact week context strip (docs/calendar-agenda-prototype.html): 7 day
// columns with workload bars coloured by the day's most urgent status. Clicking
// a day scrolls to its agenda group (no-op when that day has no group).
export function WeekStrip({ loads, now }: { loads: Map<number, DayLoad>; now: number }) {
  const today = startOfDay(now);
  const currentWeek = startOfDay(today - new Date(today).getDay() * DAY);
  const [anchor, setAnchor] = useState(currentWeek);
  const [selected, setSelected] = useState(today);

  const days = Array.from({ length: 7 }, (_, i) => startOfDay(anchor + i * DAY));
  const maxLoad = Math.max(1, ...days.map((ts) => loads.get(ts)?.count ?? 0));
  const mid = new Date(anchor + 3 * DAY);

  const select = (ts: number) => {
    setSelected(ts);
    document.getElementById(`day-${ts}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  const goToday = () => { setAnchor(currentWeek); select(today); };

  // Next sits 8px from Today, so 44px ::after boxes on both would overlap by
  // ~6px — this trio grows for real on phones instead.
  const navBtn = 'grid h-11 w-11 place-items-center rounded-lg border border-line text-ink-dim transition-colors hover:border-accent hover:text-accent md:h-[30px] md:w-[30px]';

  return (
    <div className="glass bp-ticks relative mb-6 rounded-xl px-3.5 pb-3 pt-3.5">
      <div className="mb-3 flex items-center justify-between">
        <button type="button" className={navBtn} aria-label="Previous week" onClick={() => setAnchor(startOfDay(anchor - 7 * DAY))}>‹</button>
        <div className="flex items-baseline gap-2">
          <span className="text-base font-semibold tracking-tight text-ink">{MONTHS[mid.getMonth()]}</span>
          <span className="bp-figure text-base text-ink-dim">{mid.getFullYear()}</span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className={navBtn} aria-label="Next week" onClick={() => setAnchor(startOfDay(anchor + 7 * DAY))}>›</button>
          <button type="button" onClick={goToday}
            className="min-h-11 rounded-md border border-line px-3 font-mono text-[0.66rem] uppercase tracking-wider text-ink-dim transition-colors hover:border-accent hover:text-accent md:min-h-0 md:px-2.5 md:py-1">
            Today
          </button>
        </div>
      </div>

      {/* Day columns measure ~39px wide at 320px. Seven 44px columns don't fit,
          and scrolling a week view is worse than a narrow column — at 39x84
          with no vertical neighbour these are comfortably tappable. Registered
          as an explicit exception in scripts/mobile-audit.mjs. */}
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((ts) => {
          const d = new Date(ts);
          const load = loads.get(ts);
          const h = load ? Math.round(6 + (load.count / maxLoad) * 20) : 0;
          return (
            <button
              key={ts}
              type="button"
              aria-pressed={ts === selected}
              aria-label={`${DOW[d.getDay()]} ${d.getDate()}${load ? `, ${load.count} topic${load.count === 1 ? '' : 's'}` : ''}`}
              onClick={() => select(ts)}
              className={`flex flex-col items-center gap-1.5 rounded-lg border px-0.5 pb-1.5 pt-2 transition-colors hover:bg-accent-soft ${
                ts === selected ? 'border-accent bg-panel-2' : 'border-transparent'
              } ${ts === today ? 'bp-today' : ''}`}
            >
              <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-faint">{DOW[d.getDay()]}</span>
              <span className={`bp-figure text-base ${ts === today ? 'text-accent' : 'text-ink'}`}>{d.getDate()}</span>
              <span className="flex h-[26px] w-[22px] items-end justify-center">
                {load
                  ? <span className="w-1.5 rounded-t-full rounded-b-[2px]" style={{ height: `${h}px`, background: BAR[load.worst] }} />
                  : <span className="text-base leading-none text-ink-faint">·</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
