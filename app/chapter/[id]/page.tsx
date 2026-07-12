'use client';
import { use, useState } from 'react';
import { notFound } from 'next/navigation';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useStore } from '@/store/useStore';
import { TopicCard } from '@/components/cards/TopicCard';
import { AddButton } from '@/components/AddButton';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { SortableRow } from '@/components/dnd/SortableRow';
import { dragId } from '@/components/dnd/ids';
import { useFilters } from '@/store/useFilters';
import { matchingTopics, hasActiveFilters } from '@/lib/filters/predicates';
import { FilterBar } from '@/components/FilterBar';
import { TopicResultRow } from '@/components/TopicResultRow';

export default function ChapterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const chapter = useStore((s) => s.chapters[id]);
  const topics = useStore((s) => s.topics);
  const subjects = useStore((s) => s.subjects);
  const addTopic = useStore((s) => s.addTopic);
  const data = useStore();
  const { tagIds, statuses } = useFilters();
  const filters = { tagIds, statuses };
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  if (!chapter) return notFound();
  const subject = subjects[chapter.subjectId];
  return (
    <div>
      <Breadcrumb items={[
        { label: 'Subjects', href: '/' },
        ...(subject ? [{ label: subject.name, href: `/subject/${subject.id}` }] : []),
        { label: chapter.name },
      ]} />
      <div className="mb-6 mt-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{chapter.name}</h1>
        <AddButton label="Topic" onAdd={(title) => setJustAddedId(addTopic(id, title))} />
      </div>
      <FilterBar />
      {hasActiveFilters(filters) ? (
        <div className="grid gap-3">
          {matchingTopics(data, filters, Date.now(), { chapterId: id }).map(({ topic, subject: subj, chapter: ch }) => (
            <TopicResultRow key={topic.id} topic={topic} subject={subj} chapter={ch} />
          ))}
        </div>
      ) : (
        <SortableContext
          items={chapter.topicIds.filter((tid) => topics[tid] && !topics[tid].archivedAt).map((tid) => dragId('topic', tid))}
          strategy={verticalListSortingStrategy}
        >
          <div className="grid gap-3">
            {chapter.topicIds.map((tid) => topics[tid] && !topics[tid].archivedAt && (
              <SortableRow key={tid} id={dragId('topic', tid)}>
                <TopicCard topic={topics[tid]} autoEdit={tid === justAddedId} />
              </SortableRow>
            ))}
          </div>
        </SortableContext>
      )}
    </div>
  );
}
