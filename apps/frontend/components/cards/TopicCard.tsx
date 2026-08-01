'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Star, Pin, CheckCircle2, Archive } from 'lucide-react';
import type { Topic } from '@revision-app/shared';
import { useStore } from '@/store/useStore';
import { badgeState, totalRevisions, lastRevisedAt, relativeLabel } from '@/lib/revision/engine';
import { RevisionBadge } from '@/components/RevisionBadge';
import { RowActions } from '@/components/RowActions';
import { InlineEditable } from '@/components/InlineEditable';
import { IconButton } from '@/components/ui/IconButton';
import { useSwipeActions } from '@/components/hooks/useSwipeActions';
import { useRowDragging } from '@/components/dnd/SortableRow';

export function TopicCard({ topic, autoEdit = false }: { topic: Topic; autoEdit?: boolean }) {
  const { renameTopic, archiveTopic, markTopicRevised, toggleBookmark } = useStore.getState();
  const [editing, setEditing] = useState(autoEdit);
  useEffect(() => { if (autoEdit) setEditing(true); }, [autoEdit]);
  const now = Date.now();
  const last = lastRevisedAt(topic.revisionHistory);
  const remove = () => { if (window.confirm(`Archive "${topic.title}"? You can restore it later.`)) archiveTopic(topic.id); };

  const dragging = useRowDragging();
  const swipe = useSwipeActions({
    onArchive: () => archiveTopic(topic.id),
    onBookmark: () => toggleBookmark(topic.id),
    disabled: dragging,
  });

  return (
    <div className="relative overflow-hidden">
      {/* Revealed strip, sitting behind the row. aria-hidden + tabIndex -1:
          RowActions already exposes these actions accessibly, and announcing
          them twice is noise. Swipe is an accelerator, never the only path. */}
      <div aria-hidden className="absolute inset-y-0 right-0 flex w-32 items-stretch">
        <button tabIndex={-1} aria-label="Bookmark"
          onClick={() => { swipe.actions.onBookmark(); swipe.close(); }}
          className="flex flex-1 items-center justify-center bg-annotation/20 text-annotation">
          <Star size={18} />
        </button>
        <button tabIndex={-1} aria-label="Archive"
          onClick={() => { swipe.actions.onArchive(); swipe.close(); }}
          className="flex flex-1 items-center justify-center bg-alarm/20 text-alarm">
          <Archive size={18} />
        </button>
      </div>
    <Link href={`/topic/${topic.id}`}
      {...swipe.handlers}
      style={{ transform: `translateX(${swipe.offset}px)` }}
      // bg-ground is load-bearing: without an opaque row the action strip shows
      // through it. transition-colors (not transition) so the translate tracks
      // the finger instead of easing behind it.
      className="group relative flex items-center justify-between gap-3 rounded-md bg-ground px-3 py-3 transition-colors hover:bg-accent-soft active:bg-accent-soft">
      <div className="min-w-0" onDoubleClick={(e) => { e.preventDefault(); setEditing(true); }}>
        <div className="truncate font-medium text-ink">
          <InlineEditable value={topic.title} editing={editing} onEditingChange={setEditing}
            onCommit={(n) => renameTopic(topic.id, n)} />
        </div>
        {/* .meta, not .tblabel — row metadata is content to read, not a header,
            and uppercase + wide tracking truncated it on phones. */}
        <div className="meta mt-1.5">
          <span className="text-accent">{String(totalRevisions(topic.revisionHistory)).padStart(2, '0')}</span> rev
          <span className="mx-2 text-line-strong">·</span>
          <span>{last ? relativeLabel(last, now) : 'not revised yet'}</span>
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
    </div>
  );
}
