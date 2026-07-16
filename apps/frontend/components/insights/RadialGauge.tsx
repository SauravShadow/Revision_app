'use client';

// A 270° drafting dial. Track + accent sweep drawn as SVG arcs; the figure
// reads out in the centre. Stroke animates on mount via a dasharray transition.
export function RadialGauge({ value, label, sublabel }: { value: number; label: string; sublabel?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const size = 148;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const sweep = 0.75; // 270° of the circle is the usable track
  const track = circ * sweep;
  const gap = circ - track;
  const filled = track * (pct / 100);

  return (
    <div className="bp-ticks glass relative flex flex-col items-center rounded-xl p-5">
      <div className="tblabel mb-3 self-start">{label}</div>
      <div className="relative" style={{ width: size, height: size }}>
        {/* rotate so the 90° gap sits centred at the bottom */}
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rotate-[135deg]">
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke="var(--line-strong)" strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={`${track} ${gap}`}
          />
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke="var(--accent)" strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={`${filled} ${circ - filled}`}
            style={{ filter: 'drop-shadow(0 0 6px var(--accent-soft))', transition: 'stroke-dasharray 1s cubic-bezier(0.2,0.7,0.2,1)' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="bp-figure text-4xl text-ink">
            {pct}<span className="text-xl text-ink-dim">%</span>
          </div>
          {sublabel && <div className="tblabel mt-1.5">{sublabel}</div>}
        </div>
      </div>
    </div>
  );
}
