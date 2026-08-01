'use client';

export interface SparklinePoint {
  day: string;
  revisions: number;
}

/**
 * Daily-activity sparkline: a baseline rule the bars sit on, a faint mid grid
 * line for scale, and an emphasised final bar so "where are we now" reads at a
 * glance. Replaces the bare bar list that was duplicated across both coaching
 * pages.
 */
export function Sparkline({
  points,
  label,
  className = '',
}: {
  points: SparklinePoint[];
  label: string;
  className?: string;
}) {
  const max = Math.max(1, ...points.map((p) => p.revisions));
  const total = points.reduce((sum, p) => sum + p.revisions, 0);
  const last = points.length > 0 ? points[points.length - 1] : undefined;

  return (
    <div className={`glass bp-ticks relative rounded-xl p-4 ${className}`}>
      <div className="tblabel mb-2 flex items-baseline justify-between gap-2">
        <span>{label}</span>
        {last && (
          <span className="bp-figure text-xs text-ink-dim">
            {last.revisions} today
          </span>
        )}
      </div>
      <div
        role="img"
        aria-label={`${label}: ${total} revisions over ${points.length} days, peak ${max} in a day`}
        className="relative flex h-24 items-end gap-1"
      >
        {/* Mid-scale grid line — gives the bars something to be measured against. */}
        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-line" />
        {points.map((p, i) => {
          const isLast = i === points.length - 1;
          return (
            <span
              key={p.day}
              data-bar=""
              data-endpoint={isLast ? 'true' : undefined}
              title={`${p.day}: ${p.revisions}`}
              className={`relative z-10 w-2 rounded-t ${isLast ? 'bg-accent' : 'bg-accent/45'}`}
              style={{ height: `${Math.max(2, Math.round((p.revisions / max) * 100))}%` }}
            />
          );
        })}
      </div>
      {/* Baseline the bars stand on. */}
      <div aria-hidden className="mt-0 h-px w-full bg-line-strong" />
    </div>
  );
}
