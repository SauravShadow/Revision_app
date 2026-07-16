'use client';
import type { DayCount } from '@/lib/insights/heatmap';

// Accent (draughting-ink) intensity ramp; bg-panel = empty day.
const LEVEL_CLASS = ['bg-panel', 'bg-accent/25', 'bg-accent/45', 'bg-accent/70', 'bg-accent'];

function level(count: number): number {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 5) return 3;
  return 4;
}

export function HeatmapGrid({ days }: { days: DayCount[] }) {
  const weeks: DayCount[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {week.map((d) => (
              <div
                key={d.day}
                data-testid="heatmap-cell"
                data-count={d.count}
                title={`${new Date(d.day).toLocaleDateString()} · ${d.count} revision${d.count === 1 ? '' : 's'}`}
                className={`h-3 w-3 rounded-sm ${LEVEL_CLASS[level(d.count)]}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
