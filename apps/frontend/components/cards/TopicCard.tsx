'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Star, Pin, CheckCircle2 } from 'lucide-react';
import type { Topic } from '@revision-app/shared';
import { useStore } from '@/store/useStore';
import { badgeState, totalRevisions, lastRevisedAt, relativeLabel } from '@/lib/revision/engine';
import { RevisionBadge } from '@/components/RevisionBadge';
import { RowActions } from '@/components/RowActions';
import { InlineEditable } from '@/components/InlineEditable';
import { IconButton } from '@/components/ui/IconButton';

export function TopicCard({ topic, autoEdit = false }: { topic: Topic; autoEdit?: boolean }) {
  const { renameTopic, archiveTopic, markTopicRevised } = useStore.getState();
  const [editing, setEditing] = useState(autoEdit);
  useEffect(() => { if (autoEdit) setEditing(true); }, [autoEdit]);
  const now = Date.now();
  const last = lastRevisedAt(topic.revisionHistory);
  const remove = () => { if (window.confirm(`Archive "${topic.title}"? You can restore it later.`)) archiveTopic(topic.id); };
  return (
    <Link href={`/topic/${topic.id}`}
      className="group flex items-center justify-between gap-3 rounded-md px-3 py-3 transition-colors hover:bg-accent-soft active:bg-accent-soft">
      <div className="min-w-0" onDoubleClick={(e) => { e.preventDefault(); setEditing(true); }}>
        <div className="truncate font-medium text-ink">
          <InlineEditable value={topic.title} editing={editing} onEditingChange={setEditing}
            onCommit={(n) => renameTopic(topic.id, n)} />
        </div>
        <div className="tblabel mt-1.5">
          <span className="text-accent">{String(totalRevisions(topic.revisionHistory)).padStart(2, '0')}</span> REV
          <span className="mx-2 text-line-strong">·</span>
          <span className="normal-case tracking-normal">{last ? relativeLabel(last, now) : 'not revised yet'}</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2.5">
        {topic.priority === 'High' && !topic.bookmarkedAt && (
          <Pin size={13} className="-rotate-45 text-accent" aria-label="High priority — pinned to top" />
        )}
        {topic.bookmarkedAt && <Star size={14} className="fill-annotation text-annotation" aria-label="Bookmarked — pinned to top" />}
        <RevisionBadge state={badgeState(topic, now)} />
        {/* A revision session is tap-tap-tap down the list; before this the only
            one-tap revise lived in TodayQueue. preventDefault because the whole
            row is a Link. Real 44px box, not a floored hit area — RowActions
            sits gap-2.5 away and expanded boxes would overlap. */}
        <IconButton
          label="Mark revised"
          onClick={(e) => { e.preventDefault(); markTopicRevised(topic.id); }}
          className="min-h-11 min-w-11 text-ink-dim hover:bg-white/10 hover:text-go active:bg-white/15 md:min-h-0 md:min-w-0"
        >
          <CheckCircle2 size={16} />
        </IconButton>
        <RowActions onRename={() => setEditing(true)} onDelete={remove} />
      </div>
    </Link>
  );
}
