'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Chapter } from '@/lib/domain/types';
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
    <Link href={`/chapter/${chapter.id}`} className="group glass flex items-center justify-between rounded-xl p-4">
      <div onDoubleClick={(e) => { e.preventDefault(); setEditing(true); }}>
        <div className="font-medium">
          <InlineEditable value={chapter.name} editing={editing} onEditingChange={setEditing}
            onCommit={(n) => renameChapter(chapter.id, n)} />
        </div>
        <div className="mt-1 text-xs opacity-60">{activeTopics} topic{activeTopics === 1 ? '' : 's'} · {progress}% · {chapter.difficulty} · {chapter.priority}</div>
      </div>
      <RowActions onRename={() => setEditing(true)} onDelete={remove} onDuplicate={() => duplicateChapter(chapter.id)} />
    </Link>
  );
}
