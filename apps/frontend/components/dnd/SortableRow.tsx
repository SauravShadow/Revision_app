'use client';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

export function SortableRow({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="flex min-w-0 items-stretch gap-2">
      <button
        aria-label="Drag to reorder"
        // 24px wide before this, which made reorder fiddly on a phone. Widened
        // for real (not a hit-area floor) because the row content sits directly
        // alongside and an expanded box would cover it.
        className="flex w-11 cursor-grab touch-none items-center justify-center px-1 opacity-30 transition hover:opacity-70 active:cursor-grabbing md:w-auto md:justify-start"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
