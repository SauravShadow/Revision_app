'use client';
import { useDroppable } from '@dnd-kit/core';

export function DroppableNode({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={isOver ? 'rounded bg-sky-500/20 ring-1 ring-sky-400/50' : 'rounded'}>
      {children}
    </div>
  );
}
