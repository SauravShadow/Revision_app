'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import type { Topic } from '@/lib/domain/types';
import { useStore } from '@/store/useStore';
import { badgeState, totalRevisions, lastRevisedAt, relativeLabel } from '@/lib/revision/engine';
import { RevisionBadge } from '@/components/RevisionBadge';
import { RowActions } from '@/components/RowActions';
import { InlineEditable } from '@/components/InlineEditable';

export function TopicCard({ topic, autoEdit = false }: { topic: Topic; autoEdit?: boolean }) {
  const { renameTopic, archiveTopic } = useStore.getState();
  const [editing, setEditing] = useState(autoEdit);
  useEffect(() => { if (autoEdit) setEditing(true); }, [autoEdit]);
  const now = Date.now();
  const last = lastRevisedAt(topic.revisionHistory);
  const remove = () => { if (window.confirm(`Archive "${topic.title}"? You can restore it later.`)) archiveTopic(topic.id); };
  return (
    <Link href={`/topic/${topic.id}`} className="group glass flex items-center justify-between rounded-xl p-4">
      <div onDoubleClick={(e) => { e.preventDefault(); setEditing(true); }}>
        <div className="font-medium">
          <InlineEditable value={topic.title} editing={editing} onEditingChange={setEditing}
            onCommit={(n) => renameTopic(topic.id, n)} />
        </div>
        <div className="mt-1 text-xs opacity-60">
          {totalRevisions(topic.revisionHistory)} revisions · {last ? relativeLabel(last, now) : 'not revised yet'}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {topic.bookmarkedAt && <Star size={14} className="fill-amber-400 text-amber-400" />}
        <RevisionBadge state={badgeState(topic.revisionHistory, now)} />
        <RowActions onRename={() => setEditing(true)} onDelete={remove} />
      </div>
    </Link>
  );
}
