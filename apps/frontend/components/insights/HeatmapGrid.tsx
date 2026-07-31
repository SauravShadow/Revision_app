'use client';
import { useEffect, useRef } from 'react';
import type { DayCount } from '@/lib/insights/heatmap';

// Accent (draughting-ink) intensity ramp; bg-panel = empty day.
const LEVEL_CLASS = ['bg-panel', 'bg-accent/25', 'bg-accent/45', 'bg-accent/70', 'bg-accent'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAY = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

function level(count: number): number {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 5) return 3;
  return 4;
}

export function HeatmapGrid({ days }: { days: DayCount[] }) {
  const scroller = useRef<HTMLDivElement>(null);

  // 12 months don't fit a phone, and the grid starts a year ago — so without
  // this the visible portion is the oldest, usually emptiest, weeks.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [days]);

  if (days.length === 0) return null;

  // Pad the first column so rows align to weekdays (Sun = row 0 … Sat = row 6).
  const lead = new Date(days[0].day).getDay();
  const cells: (DayCount | null)[] = [...Array<null>(lead).fill(null), ...days];
  const weeks: (DayCount | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const total = days.reduce((s, d) => s + d.count, 0);
  const activeDays = days.filter((d) => d.count > 0).length;

  const firstRealOf = (w: (DayCount | null)[]) => w.find((c): c is DayCount => c !== null);

  return (
    <div className="glass rounded-xl p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div className="tblabel">Activity · last 12 months</div>
        <div className="dim-chip text-ink-dim">
          {total} revision{total === 1 ? '' : 's'} · {activeDays} active day{activeDays === 1 ? '' : 's'}
        </div>
      </div>

      <div ref={scroller} className="overflow-x-auto pb-1">
        <div className="inline-flex flex-col gap-1.5">
          {/* month labels aligned to week columns */}
          <div className="flex gap-[3px] pl-[30px]">
            {weeks.map((w, i) => {
              const cur = firstRealOf(w);
              const prev = i > 0 ? firstRealOf(weeks[i - 1]) : undefined;
              const curM = cur ? new Date(cur.day).getMonth() : -1;
              const prevM = prev ? new Date(prev.day).getMonth() : -2;
              const show = curM !== -1 && curM !== prevM;
              return (
                <div key={i} className="tblabel w-[13px] text-[9px] leading-none tracking-normal">
                  {show ? MONTH[curM] : ''}
                </div>
              );
            })}
          </div>

          <div className="flex gap-[3px]">
            {/* weekday rail */}
            <div className="mr-[3px] flex w-[27px] flex-col gap-[3px]">
              {WEEKDAY.map((w, i) => (
                <div key={i} className="tblabel h-[13px] text-[9px] leading-[13px] tracking-normal">
                  {w}
                </div>
              ))}
            </div>

            {weeks.map((w, wi) => (
              <div key={wi} className="flex flex-col gap-[3px]">
                {Array.from({ length: 7 }).map((_, di) => {
                  const c = w[di];
                  if (!c) return <div key={di} className="h-[13px] w-[13px] rounded-[3px]" />;
                  return (
                    <div
                      key={di}
                      data-testid="heatmap-cell"
                      data-count={c.count}
                      title={`${new Date(c.day).toLocaleDateString()} · ${c.count} revision${c.count === 1 ? '' : 's'}`}
                      className={`h-[13px] w-[13px] rounded-[3px] ring-1 ring-inset ring-line/50 transition hover:ring-accent ${LEVEL_CLASS[level(c.count)]}`}
                    />
                  );
                })}
              </div>
            ))}
          </div>

          {/* legend */}
          <div className="tblabel mt-1 flex items-center gap-1.5 self-end text-[10px] tracking-normal">
            <span>less</span>
            {LEVEL_CLASS.map((cl, i) => (
              <span key={i} className={`h-[13px] w-[13px] rounded-[3px] ring-1 ring-inset ring-line/50 ${cl}`} />
            ))}
            <span>more</span>
          </div>
        </div>
      </div>
    </div>
  );
}
