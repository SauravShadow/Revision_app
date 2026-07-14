'use client';
import { X } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { useFilters } from '@/store/useFilters';
import { hasActiveFilters, type StatusFilter } from '@/lib/filters/predicates';
import { TagManager } from '@/components/TagManager';

const STATUSES: { key: StatusFilter; label: string }[] = [
  { key: 'needs-revision', label: 'Needs Revision' },
  { key: 'never-revised', label: 'Never Revised' },
  { key: 'has-attachments', label: 'Attachments' },
];

export function FilterBar() {
  const tags = useStore((s) => s.tags);
  const tagOrder = useStore((s) => s.tagOrder);
  const { tagIds, statuses, toggleTag, toggleStatus, clear } = useFilters();
  const active = hasActiveFilters({ tagIds, statuses });
  return (
    <div className="mb-4 flex flex-wrap items-center gap-1.5">
      {STATUSES.map((s) => (
        <button key={s.key} onClick={() => toggleStatus(s.key)}
          className={`dim-chip transition-colors ${statuses.includes(s.key) ? 'border-accent bg-accent-soft text-accent' : 'text-ink-dim hover:border-line-strong hover:text-ink'}`}>
          {s.label}
        </button>
      ))}
      {(tagOrder ?? []).map((id) => {
        const tag = (tags ?? {})[id];
        if (!tag) return null;
        const on = tagIds.includes(id);
        return (
          <button key={id} onClick={() => toggleTag(id)}
            className="dim-chip transition-colors"
            style={{
              background: on ? tag.color : `${tag.color}1f`,
              borderColor: on ? tag.color : `${tag.color}55`,
              color: on ? '#08131f' : undefined,
            }}>
            {tag.name}
          </button>
        );
      })}
      {active && (
        <button onClick={clear} className="dim-chip flex items-center gap-1 text-ink-dim transition-colors hover:border-alarm/60 hover:text-alarm"><X size={12} /> Clear</button>
      )}
      <TagManager />
    </div>
  );
}
