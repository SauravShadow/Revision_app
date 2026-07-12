'use client';
import { X } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { useFilters } from '@/store/useFilters';
import { hasActiveFilters, type StatusFilter } from '@/lib/filters/predicates';

const STATUSES: { key: StatusFilter; label: string }[] = [
  { key: 'needs-revision', label: 'Needs Revision' },
  { key: 'never-revised', label: 'Never Revised' },
  { key: 'bookmarked', label: 'Bookmarked' },
  { key: 'has-flashcards', label: 'Has Flashcards' },
  { key: 'has-attachments', label: 'Has Attachments' },
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
          className={`rounded-full px-2.5 py-1 text-xs transition ${statuses.includes(s.key) ? 'bg-white/20' : 'bg-white/5 opacity-70 hover:opacity-100'}`}>
          {s.label}
        </button>
      ))}
      {(tagOrder ?? []).map((id) => {
        const tag = (tags ?? {})[id];
        if (!tag) return null;
        const on = tagIds.includes(id);
        return (
          <button key={id} onClick={() => toggleTag(id)}
            className="rounded-full px-2.5 py-1 text-xs transition"
            style={{ background: on ? tag.color : `${tag.color}22`, color: on ? '#000' : undefined, opacity: on ? 1 : 0.85 }}>
            {tag.name}
          </button>
        );
      })}
      {active && (
        <button onClick={clear} className="flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-xs opacity-70 hover:opacity-100"><X size={12} /> Clear</button>
      )}
    </div>
  );
}
