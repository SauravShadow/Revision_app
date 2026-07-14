'use client';
import { Tag as TagIcon } from 'lucide-react';
import type { Topic } from '@/lib/domain/types';
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
            <button key={id} onClick={() => toggleTopicTag(topic.id, id)}
              className="rounded-full px-2.5 py-1 text-xs transition"
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
