'use client';

export interface FilterChipOption {
  key: string;
  label: string;
  count?: number;
}

interface FilterChipsProps {
  options: FilterChipOption[];
  value: string;
  onChange: (key: string) => void;
  'aria-label'?: string;
  className?: string;
}

// Single-select chips (Phase 1; reused for coaching controls in Phase 7). Active
// chip is a filled --accent pill; the rest reuse the drafting .dim-chip. Each
// chip may carry a live count.
export function FilterChips({ options, value, onChange, 'aria-label': ariaLabel = 'Quick filters', className }: FilterChipsProps) {
  return (
    <div role="group" aria-label={ariaLabel} className={`flex flex-wrap items-center gap-1.5 ${className ?? 'mb-5'}`}>
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
            {opt.count !== undefined && (
              <span
                className={`font-mono tabular-nums text-[0.62rem] ${
                  active ? 'text-ground-deep/80' : 'text-ink-faint'
                }`}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
