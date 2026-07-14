import type { AppData } from '@revision-app/shared';
import { makeBuiltinTags } from './builtinTags';

// Single load-boundary migration: guarantees every AppData field exists so
// nothing downstream guards for legacy snapshots. Snapshots saved before
// tags existed (tagOrder absent) get the built-in tags backfilled; a user
// who deliberately emptied their tags keeps [].
export function normalizeData(raw: Partial<AppData> | null | undefined): AppData {
  const src = raw ?? {};
  const base: AppData = {
    subjects: src.subjects ?? {},
    chapters: src.chapters ?? {},
    topics: src.topics ?? {},
    subjectOrder: src.subjectOrder ?? [],
    tags: src.tags ?? {},
    tagOrder: src.tagOrder ?? [],
  };
  if (src.tagOrder === undefined) return { ...base, ...makeBuiltinTags() };
  return base;
}
