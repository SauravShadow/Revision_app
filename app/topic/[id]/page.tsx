'use client';
import { use } from 'react';
import { notFound } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { MarkdownEditor } from '@/components/editor/MarkdownEditor';
import { RevisionHistoryPanel } from '@/components/RevisionHistoryPanel';
import { AttachmentsPanel } from '@/components/AttachmentsPanel';
import { RevisionBadge } from '@/components/RevisionBadge';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { badgeState } from '@/lib/revision/engine';

export default function TopicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const topic = useStore((s) => s.topics[id]);
  const chapters = useStore((s) => s.chapters);
  const subjects = useStore((s) => s.subjects);
  const updateTopicNotes = useStore((s) => s.updateTopicNotes);
  const markTopicRevised = useStore((s) => s.markTopicRevised);
  if (!topic) return notFound();
  const chapter = chapters[topic.chapterId];
  const subject = chapter ? subjects[chapter.subjectId] : undefined;
  return (
    <div>
      <Breadcrumb items={[
        { label: 'Subjects', href: '/' },
        ...(subject ? [{ label: subject.name, href: `/subject/${subject.id}` }] : []),
        ...(chapter ? [{ label: chapter.name, href: `/chapter/${chapter.id}` }] : []),
        { label: topic.title },
      ]} />
      <div className="mb-6 mt-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{topic.title}</h1>
          <RevisionBadge state={badgeState(topic.revisionHistory, Date.now())} />
        </div>
        <button onClick={() => markTopicRevised(topic.id)}
          className="flex items-center gap-2 rounded-xl bg-emerald-500/90 px-4 py-2 text-sm font-medium text-black transition hover:bg-emerald-400">
          <CheckCircle2 size={16} /> Mark as Revised
        </button>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <MarkdownEditor value={topic.notes} onChange={(v) => updateTopicNotes(topic.id, v)} topicId={topic.id} />
        <div className="space-y-4">
          <RevisionHistoryPanel topic={topic} />
          <AttachmentsPanel topic={topic} />
        </div>
      </div>
    </div>
  );
}
