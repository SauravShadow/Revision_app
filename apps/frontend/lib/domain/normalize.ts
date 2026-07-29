import type { AppData } from '@revision-app/shared';
import { suggestedNextDate } from '@revision-app/shared';
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
  // plannedAt migration: legacy snapshots (field absent) inherit the old
  // ladder-derived due date so calendars don't empty on upgrade. null
  // (deliberate skip/clear) is preserved as-is.
  let topics = base.topics;
  let changed = false;
  for (const id of Object.keys(topics)) {
    const t = topics[id];
    if (t.plannedAt === undefined && t.revisionHistory.length > 0) {
      if (!changed) { topics = { ...topics }; changed = true; }
      topics[id] = { ...t, plannedAt: suggestedNextDate(t.revisionHistory) };
    }
  }
  const migrated = changed ? { ...base, topics } : base;
  if (src.tagOrder === undefined) return { ...migrated, ...makeBuiltinTags() };
  return migrated;
}
