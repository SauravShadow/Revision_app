'use client';

export interface Segment {
  label: string;
  value: number;
  color: string; // a CSS colour, e.g. 'var(--go)'
}

// A stacked measure bar partitioning every topic into one status band, with a
// keyed readout beneath. The bands are mutually exclusive and sum to total.
export function SegmentBar({ segments }: { segments: Segment[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div className="glass rounded-xl p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <div className="tblabel">Status breakdown</div>
        <div className="tblabel text-ink-faint">{total} topics</div>
      </div>
      <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-ground-deep ring-1 ring-inset ring-line">
        {segments.map((s) =>
          s.value > 0 ? (
            <div
              key={s.label}
              className="bp-grow h-full"
              style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
              title={`${s.label}: ${s.value}`}
            />
          ) : null,
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-4">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
            <span className="truncate text-xs text-ink-dim">{s.label}</span>
            <span className="bp-figure ml-auto text-xs text-ink">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
