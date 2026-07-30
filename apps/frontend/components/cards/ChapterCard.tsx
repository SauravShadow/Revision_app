'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Chapter } from '@revision-app/shared';
import { useStore } from '@/store/useStore';
import { chapterProgress } from '@/lib/revision/progress';
import { RowActions } from '@/components/RowActions';
import { InlineEditable } from '@/components/InlineEditable';

export function ChapterCard({ chapter, autoEdit = false }: { chapter: Chapter; autoEdit?: boolean }) {
  const data = useStore();
  const { renameChapter, archiveChapter, duplicateChapter } = useStore.getState();
  const [editing, setEditing] = useState(autoEdit);
  useEffect(() => { if (autoEdit) setEditing(true); }, [autoEdit]);
  const progress = chapterProgress(data, chapter.id, Date.now());
  const remove = () => { if (window.confirm(`Archive "${chapter.name}"? You can restore it later.`)) archiveChapter(chapter.id); };
  const activeTopics = chapter.topicIds.filter((tid) => data.topics[tid] && !data.topics[tid].archivedAt).length;
  return (
    <Link href={`/chapter/${chapter.id}`}
      className="group flex items-center justify-between gap-3 rounded-md px-3 py-3 transition-colors hover:bg-accent-soft active:bg-accent-soft">
      <div className="min-w-0" onDoubleClick={(e) => { e.preventDefault(); setEditing(true); }}>
        <div className="truncate font-medium text-ink">
          <InlineEditable value={chapter.name} editing={editing} onEditingChange={setEditing}
            onCommit={(n) => renameChapter(chapter.id, n)} />
        </div>
        <div className="tblabel mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-accent">{progress}%</span>
          <span className="text-line-strong">·</span>
          <span>{activeTopics} TOPIC{activeTopics === 1 ? '' : 'S'}</span>
          <span className="text-line-strong">·</span>
          <span>{chapter.difficulty}</span>
          <span className="text-line-strong">·</span>
          <span>{chapter.priority}</span>
        </div>
      </div>
      <RowActions onRename={() => setEditing(true)} onDelete={remove} onDuplicate={() => duplicateChapter(chapter.id)} />
    </Link>
  );
}
