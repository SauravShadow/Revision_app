'use client';
import Link from 'next/link';
import type { Topic } from '@/lib/domain/types';
import { useStore } from '@/store/useStore';
import { badgeState, totalRevisions, lastRevisedAt, relativeLabel } from '@/lib/revision/engine';
import { RevisionBadge } from '@/components/RevisionBadge';
import { RowActions } from '@/components/RowActions';

export function TopicCard({ topic }: { topic: Topic }) {
  const { renameTopic, deleteTopic } = useStore.getState();
  const now = Date.now();
  const last = lastRevisedAt(topic.revisionHistory);
  const rename = () => { const n = window.prompt('Rename topic', topic.title); if (n && n.trim()) renameTopic(topic.id, n.trim()); };
  const remove = () => { if (window.confirm(`Delete "${topic.title}"?`)) deleteTopic(topic.id); };
  return (
    <Link href={`/topic/${topic.id}`} className="group glass flex items-center justify-between rounded-xl p-4">
      <div>
        <div className="font-medium">{topic.title}</div>
        <div className="mt-1 text-xs opacity-60">
          {totalRevisions(topic.revisionHistory)} revisions · {last ? relativeLabel(last, now) : 'not revised yet'}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <RevisionBadge state={badgeState(topic.revisionHistory, now)} />
        <RowActions onRename={rename} onDelete={remove} />
      </div>
    </Link>
  );
}
