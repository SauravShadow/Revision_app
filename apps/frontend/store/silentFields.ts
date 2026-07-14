import type { AppData } from '@revision-app/shared';

// Notes edits and mark-revised are recorded without undo entries ("silent").
// When undo/redo restores a structural snapshot, carry the present values of
// those fields forward so typing and revision ticks are never reverted.
export function preserveSilentFields(restored: AppData, present: AppData): AppData {
  const topics = { ...restored.topics };
  for (const id of Object.keys(topics)) {
    const cur = present.topics[id];
    if (cur) topics[id] = { ...topics[id], notes: cur.notes, revisionHistory: cur.revisionHistory };
  }
  return { ...restored, topics };
}
