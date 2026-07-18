// A circular tabular count bubble (Phase 5) — a cousin of RevisionBadge. Filled
// --accent when there's a pending count, muted outline when zero.
export function CountBadge({ count, label }: { count: number; label?: string }) {
  const zero = count === 0;
  return (
    <span
      aria-label={label ?? `${count}`}
      title={label ?? `${count}`}
      className={`inline-grid h-6 min-w-[1.5rem] place-items-center rounded-full px-1.5 font-mono text-[0.7rem] font-semibold tabular-nums ${
        zero ? 'border border-line text-ink-faint' : 'bg-accent text-ground-deep'
      }`}
    >
      {count}
    </span>
  );
}
