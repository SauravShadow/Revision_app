'use client';

export interface FilterChipOption {
  key: string;
  label: string;
  count: number;
}

interface FilterChipsProps {
  options: FilterChipOption[];
  value: string;
  onChange: (key: string) => void;
  'aria-label'?: string;
}

// Single-select quick-filter chips (Phase 1). Active chip is a filled --accent
// pill; the rest reuse the drafting .dim-chip. Each chip carries a live count.
export function FilterChips({ options, value, onChange, 'aria-label': ariaLabel = 'Quick filters' }: FilterChipsProps) {
  return (
    <div role="group" aria-label={ariaLabel} className="mb-5 flex flex-wrap items-center gap-1.5">
      {options.map((opt) => {
        const active = opt.key === value;
        const empty = opt.count === 0 && !active;
        return (
          <button
            key={opt.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.key)}
            className={`dim-chip flex items-center gap-1.5 transition-colors ${
              active
                ? 'border-accent bg-accent text-ground-deep'
                : 'text-ink-dim hover:border-line-strong hover:text-ink'
            } ${empty ? 'opacity-45' : ''}`}
          >
            <span>{opt.label}</span>
            <span
              className={`font-mono tabular-nums text-[0.62rem] ${
                active ? 'text-ground-deep/80' : 'text-ink-faint'
              }`}
            >
              {opt.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
