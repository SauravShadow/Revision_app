'use client';
import { use, useState } from 'react';
import { notFound } from 'next/navigation';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useStore } from '@/store/useStore';
import { ChapterCard } from '@/components/cards/ChapterCard';
import { AddButton } from '@/components/AddButton';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { SortableRow } from '@/components/dnd/SortableRow';
import { dragId } from '@/components/dnd/ids';

export default function SubjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const subject = useStore((s) => s.subjects[id]);
  const chapters = useStore((s) => s.chapters);
  const addChapter = useStore((s) => s.addChapter);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  if (!subject) return notFound();
  return (
    <div>
      <Breadcrumb items={[{ label: 'Subjects', href: '/' }, { label: subject.name }]} />
      <div className="mb-6 mt-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{subject.name}</h1>
        <AddButton label="Chapter" onAdd={(name) => setJustAddedId(addChapter(id, name))} />
      </div>
      <SortableContext
        items={subject.chapterIds.filter((cid) => chapters[cid] && !chapters[cid].archivedAt).map((cid) => dragId('chapter', cid))}
        strategy={verticalListSortingStrategy}
      >
        <div className="grid gap-3">
          {subject.chapterIds.map((cid) => chapters[cid] && !chapters[cid].archivedAt && (
            <SortableRow key={cid} id={dragId('chapter', cid)}>
              <ChapterCard chapter={chapters[cid]} autoEdit={cid === justAddedId} />
            </SortableRow>
          ))}
        </div>
      </SortableContext>
    </div>
  );
}
