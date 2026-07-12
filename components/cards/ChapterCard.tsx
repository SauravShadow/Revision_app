'use client';
import Link from 'next/link';
import type { Chapter } from '@/lib/domain/types';
import { useStore } from '@/store/useStore';
import { chapterProgress } from '@/lib/revision/progress';
import { RowActions } from '@/components/RowActions';

export function ChapterCard({ chapter }: { chapter: Chapter }) {
  const data = useStore();
  const { renameChapter, deleteChapter, duplicateChapter } = useStore.getState();
  const progress = chapterProgress(data, chapter.id, Date.now());
  const rename = () => { const n = window.prompt('Rename chapter', chapter.name); if (n && n.trim()) renameChapter(chapter.id, n.trim()); };
  const remove = () => { if (window.confirm(`Delete "${chapter.name}" and its topics?`)) deleteChapter(chapter.id); };
  return (
    <Link href={`/chapter/${chapter.id}`} className="group glass flex items-center justify-between rounded-xl p-4">
      <div>
        <div className="font-medium">{chapter.name}</div>
        <div className="mt-1 text-xs opacity-60">{chapter.topicIds.length} topic{chapter.topicIds.length === 1 ? '' : 's'} · {progress}% · {chapter.difficulty} · {chapter.priority}</div>
      </div>
      <RowActions onRename={rename} onDelete={remove} onDuplicate={() => duplicateChapter(chapter.id)} />
    </Link>
  );
}
