'use client';
import { Tag as TagIcon } from 'lucide-react';
import type { Topic } from '@revision-app/shared';
import { useStore } from '@/store/useStore';

export function TagPicker({ topic }: { topic: Topic }) {
  const tags = useStore((s) => s.tags);
  const tagOrder = useStore((s) => s.tagOrder);
  const toggleTopicTag = useStore((s) => s.toggleTopicTag);
  const active = new Set(topic.tagIds ?? []);
  return (
    <div className="glass rounded-xl p-4">
      <div className="mb-3 flex items-center gap-2"><TagIcon size={16} /><h3 className="font-semibold">Tags</h3></div>
      <div className="flex flex-wrap gap-1.5">
        {(tagOrder ?? []).map((id) => {
          const tag = (tags ?? {})[id];
          if (!tag) return null;
          const on = active.has(id);
          return (
            // Rolls its own chip rather than .dim-chip, so the P0 44px rule for
            // button.dim-chip never reached it — it measured 66x24.
            <button key={id} onClick={() => toggleTopicTag(topic.id, id)}
              className="min-h-11 rounded-full px-3 text-xs transition md:min-h-0 md:px-2.5 md:py-1"
              style={{ background: on ? tag.color : `${tag.color}22`, color: on ? '#000' : undefined, opacity: on ? 1 : 0.85 }}>
              {tag.name}
            </button>
          );
        })}
        {(tagOrder ?? []).length === 0 && <span className="text-sm opacity-50">No tags yet — create some from any filter bar.</span>}
      </div>
    </div>
  );
}
