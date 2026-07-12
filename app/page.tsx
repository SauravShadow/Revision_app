'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import { useStore } from '@/store/useStore';
import { SubjectCard } from '@/components/cards/SubjectCard';
import { AddButton } from '@/components/AddButton';
import { SortableRow } from '@/components/dnd/SortableRow';
import { dragId } from '@/components/dnd/ids';

export default function DashboardPage() {
  const subjectOrder = useStore((s) => s.subjectOrder);
  const subjects = useStore((s) => s.subjects);
  const addSubject = useStore((s) => s.addSubject);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Subjects</h1>
        <AddButton label="Subject" onAdd={(name) => setJustAddedId(addSubject(name))} />
      </div>
      <SortableContext
        items={subjectOrder.filter((id) => subjects[id] && !subjects[id].archivedAt).map((id) => dragId('subject', id))}
        strategy={rectSortingStrategy}
      >
        <motion.div layout className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {subjectOrder.map((id) => subjects[id] && !subjects[id].archivedAt && (
            <SortableRow key={id} id={dragId('subject', id)}>
              <SubjectCard subject={subjects[id]} autoEdit={id === justAddedId} />
            </SortableRow>
          ))}
        </motion.div>
      </SortableContext>
    </div>
  );
}
