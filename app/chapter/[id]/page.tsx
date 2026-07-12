'use client';
import { use, useState } from 'react';
import { notFound } from 'next/navigation';
import { useStore } from '@/store/useStore';
import { TopicCard } from '@/components/cards/TopicCard';
import { AddButton } from '@/components/AddButton';
import { Breadcrumb } from '@/components/layout/Breadcrumb';

export default function ChapterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const chapter = useStore((s) => s.chapters[id]);
  const topics = useStore((s) => s.topics);
  const subjects = useStore((s) => s.subjects);
  const addTopic = useStore((s) => s.addTopic);
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
      <div className="grid gap-3">
        {chapter.topicIds.map((tid) => topics[tid] && !topics[tid].archivedAt && (
          <TopicCard key={tid} topic={topics[tid]} autoEdit={tid === justAddedId} />
        ))}
      </div>
    </div>
  );
}
