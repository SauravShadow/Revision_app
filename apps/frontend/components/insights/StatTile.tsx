const TONE_CLASS: Record<string, string> = {
  ink: 'text-ink',
  accent: 'text-accent',
  go: 'text-go',
  annotation: 'text-annotation',
  alarm: 'text-alarm',
};

export function StatTile({
  label,
  value,
  caption,
  tone = 'ink',
}: {
  label: string;
  value: string | number;
  caption?: string;
  tone?: 'ink' | 'accent' | 'go' | 'annotation' | 'alarm';
}) {
  return (
    <div className="bp-ticks glass relative rounded-xl p-4">
      <div className="tblabel mb-2">{label}</div>
      <div className={`bp-figure text-3xl ${TONE_CLASS[tone]}`}>{value}</div>
      {caption && <div className="mt-1.5 text-[11px] text-ink-faint">{caption}</div>}
    </div>
  );
}
