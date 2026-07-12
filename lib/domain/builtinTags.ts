import type { AppData, Tag } from './types';
import { makeId } from './id';

export const BUILTIN_TAGS: { name: string; color: string; icon: string }[] = [
  { name: 'Formula', color: '#f59e0b', icon: 'Sigma' },
  { name: 'PYQ', color: '#8b5cf6', icon: 'FileQuestion' },
  { name: 'Weak', color: '#ef4444', icon: 'TriangleAlert' },
  { name: 'Important', color: '#10b981', icon: 'Star' },
  { name: 'Revise Again', color: '#0ea5e9', icon: 'RotateCcw' },
];

export function makeBuiltinTags(): { tags: Record<string, Tag>; tagOrder: string[] } {
  const tags: Record<string, Tag> = {};
  const tagOrder: string[] = [];
  BUILTIN_TAGS.forEach((t, i) => {
    const id = makeId();
    tags[id] = { id, name: t.name, color: t.color, icon: t.icon, order: i };
    tagOrder.push(id);
  });
  return { tags, tagOrder };
}

// Backfill built-in tags for snapshots saved before tags existed
// (tagOrder absent). A user who deliberately emptied their tags keeps [].
export function withBuiltinTagsIfMissing(data: AppData): AppData {
  if (data.tagOrder === undefined) return { ...data, ...makeBuiltinTags() };
  return data;
}
