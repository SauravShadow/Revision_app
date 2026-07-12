'use client';
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { useStore } from '@/store/useStore';
import { parseId } from './ids';

export function DndProvider({ children }: { children: React.ReactNode }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const a = parseId(String(active.id));
    const o = parseId(String(over.id));
    const s = useStore.getState();

    // Cross-move onto a sidebar tree node.
    if (o.kind === 'chapter-node' && a.kind === 'topic') { s.moveTopic(a.id, o.id); return; }
    if (o.kind === 'subject-node' && a.kind === 'chapter') { s.moveChapter(a.id, o.id); return; }

    // Within-list reorder: active and over are the same entity type.
    if (a.kind === o.kind) {
      if (a.kind === 'subject') s.reorderSubjects(a.id, o.id);
      else if (a.kind === 'chapter') s.reorderChapters(a.id, o.id);
      else if (a.kind === 'topic') s.reorderTopics(a.id, o.id);
    }
  }

  return <DndContext sensors={sensors} onDragEnd={onDragEnd}>{children}</DndContext>;
}
