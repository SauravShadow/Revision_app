'use client';

// A blueprint-styled empty sheet. One component so every list says "nothing
// here" the same way instead of each inventing its own sentence.
export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="glass bp-ticks rounded-xl px-4 py-10 text-center">
      <p className="text-sm text-ink-dim">{title}</p>
      {hint && <p className="mt-1.5 text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}
