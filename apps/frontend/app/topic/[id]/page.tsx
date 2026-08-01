'use client';
import { use, useState } from 'react';
import { notFound } from 'next/navigation';
import { CalendarClock, CheckCircle2, Star } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { MarkdownEditor } from '@/components/editor/MarkdownEditor';
import { RevisionHistoryPanel } from '@/components/RevisionHistoryPanel';
import { TagPicker } from '@/components/TagPicker';
import { AttachmentsPanel } from '@/components/AttachmentsPanel';
import { FlashcardsPanel } from '@/components/FlashcardsPanel';
import { RevisionBadge } from '@/components/RevisionBadge';
import { PlanNextDialog } from '@/components/PlanNextDialog';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { PreviewProvider } from '@/components/preview/PreviewContext';
import { badgeState } from '@/lib/revision/engine';
import { IconButton } from '@/components/ui/IconButton';

export default function TopicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const topic = useStore((s) => s.topics[id]);
  const chapters = useStore((s) => s.chapters);
  const subjects = useStore((s) => s.subjects);
  const updateTopicNotes = useStore((s) => s.updateTopicNotes);
  const markTopicRevised = useStore((s) => s.markTopicRevised);
  const toggleBookmark = useStore((s) => s.toggleBookmark);
  const clearPlan = useStore((s) => s.clearPlan);
  const [planFor, setPlanFor] = useState<null | 'after-revise' | 'schedule'>(null);
  if (!topic) return notFound();
  const chapter = chapters[topic.chapterId];
  const subject = chapter ? subjects[chapter.subjectId] : undefined;
  const insertMarkdown = (markdown: string) => {
    const currentNotes = useStore.getState().topics[topic.id]?.notes ?? topic.notes;
    const trimmed = currentNotes.trimEnd();
    const separator = trimmed.length > 0 ? '\n\n' : '';
    updateTopicNotes(topic.id, `${trimmed}${separator}${markdown.trim()}\n`);
  };
  return (
    <PreviewProvider>
      {/* Clearance for the docked action bar on phones. */}
      <div className="mx-auto w-full max-w-5xl pb-20 md:pb-0">
        <Breadcrumb items={[
          { label: 'Subjects', href: '/' },
          ...(subject ? [{ label: subject.name, href: `/subject/${subject.id}` }] : []),
          ...(chapter ? [{ label: chapter.name, href: `/chapter/${chapter.id}` }] : []),
          { label: topic.title },
        ]} />
        <div className="mb-6 mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{topic.title}</h1>
            <RevisionBadge state={badgeState(topic, Date.now())} />
            <IconButton label="Toggle bookmark" onClick={() => toggleBookmark(topic.id)} className="rounded-lg p-2.5 hover:bg-white/10 active:bg-white/10 md:p-1.5">
              <Star size={18} className={topic.bookmarkedAt ? 'fill-amber-400 text-amber-400' : 'opacity-60'} />
            </IconButton>
          </div>
          {/* Same element in both layouts: inline on desktop, docked above the
              bottom tab bar on phones. "Mark as Revised" is the reason this
              page gets opened, and inline it scrolls out of reach the moment
              you start reading notes. */}
          <div className="fixed inset-x-0 bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] z-20 flex flex-wrap items-center gap-2 border-t border-line-strong bg-ground-deep/95 px-4 py-2.5 backdrop-blur-md md:static md:z-auto md:justify-end md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
            {topic.plannedAt != null && (
              <span className="dim-chip flex items-center gap-1.5 text-ink-dim">
                Planned · {new Date(topic.plannedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                {/* Measured 7x16 before the hit-area floor — the smallest
                    control in the app and effectively untappable. */}
                <IconButton label="Clear plan" onClick={() => clearPlan(topic.id)}
                  className="-mr-1 p-0.5 text-base leading-none hover:text-alarm">×</IconButton>
              </span>
            )}
            <button onClick={() => setPlanFor('schedule')}
              className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-line px-3 py-2 text-sm text-ink-dim transition hover:border-accent hover:text-accent active:scale-[0.97] active:border-accent active:text-accent">
              <CalendarClock size={16} /> Schedule
            </button>
            <button onClick={() => { markTopicRevised(topic.id); setPlanFor('after-revise'); }}
              className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500/90 px-4 py-2 text-sm font-medium text-black transition hover:bg-emerald-400 active:scale-[0.97] active:bg-emerald-400 md:flex-none">
              <CheckCircle2 size={16} /> Mark as Revised
            </button>
          </div>
        </div>
        {planFor && (
          <PlanNextDialog topicId={topic.id}
            title={planFor === 'schedule' ? 'Plan revision' : undefined}
            onClose={() => setPlanFor(null)} />
        )}
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <MarkdownEditor value={topic.notes} onChange={(v) => updateTopicNotes(topic.id, v)} topicId={topic.id} />
          <div className="space-y-4">
            <RevisionHistoryPanel topic={topic} />
            <TagPicker topic={topic} />
            <AttachmentsPanel topic={topic} onInsertMarkdown={insertMarkdown} />
            <FlashcardsPanel topic={topic} />
          </div>
        </div>
      </div>
    </PreviewProvider>
  );
}
