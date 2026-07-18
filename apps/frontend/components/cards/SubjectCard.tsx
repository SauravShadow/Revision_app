'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { Subject } from '@revision-app/shared';
import { useStore } from '@/store/useStore';
import { subjectProgress, subjectStats, subjectStatus, type SubjectStatus } from '@/lib/revision/progress';
import { relativeLabel } from '@/lib/revision/engine';
import { RowActions } from '@/components/RowActions';
import { CountBadge } from '@/components/CountBadge';
import { InlineEditable } from '@/components/InlineEditable';

// Avatar status ring — encodes the subject's most urgent revision state.
const RING: Record<SubjectStatus, string> = {
  overdue: 'var(--alarm)',
  due: 'var(--accent)',
  recent: 'var(--go)',
  none: 'var(--line-strong)',
};

export function SubjectCard({ subject, autoEdit = false }: { subject: Subject; autoEdit?: boolean }) {
  const data = useStore();
  const { renameSubject, archiveSubject } = useStore.getState();
  const [editing, setEditing] = useState(autoEdit);
  useEffect(() => { if (autoEdit) setEditing(true); }, [autoEdit]);
  const now = Date.now();
  const progress = subjectProgress(data, subject.id, now);
  const stats = subjectStats(data, subject.id, now);
  const status = subjectStatus(data, subject.id, now);
  const remove = () => { if (window.confirm(`Archive "${subject.name}"? You can restore it later.`)) archiveSubject(subject.id); };

  return (
    <motion.div whileHover={{ y: -4 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}>
      <Link href={`/subject/${subject.id}`}
        className="group glass gradient-border bp-ticks relative block rounded-xl p-5 transition-shadow hover:shadow-[0_18px_40px_-24px_rgba(0,0,0,0.9)]">
        <div className="flex items-center gap-3">
          {/* Avatar anchor: subject colour + initial; ring encodes revision status */}
          <span
            aria-hidden
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white"
            style={{ background: subject.color, boxShadow: `0 0 0 2px var(--panel), 0 0 0 4px ${RING[status]}` }}
          >
            {subject.name.charAt(0).toUpperCase()}
          </span>

          <div className="min-w-0 flex-1" onDoubleClick={(e) => { e.preventDefault(); setEditing(true); }}>
            <h3 className="truncate font-semibold tracking-tight text-ink">
              <InlineEditable value={subject.name} editing={editing} onEditingChange={setEditing}
                onCommit={(n) => renameSubject(subject.id, n)} />
            </h3>
            <div className="tblabel mt-0.5 truncate normal-case tracking-normal text-ink-faint">
              {stats.chapterCount} chapter{stats.chapterCount === 1 ? '' : 's'}
              {' · '}
              {stats.lastRevised ? relativeLabel(stats.lastRevised, now) : 'never revised'}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <CountBadge count={stats.pending} label={`${stats.pending} topic${stats.pending === 1 ? '' : 's'} due`} />
            <RowActions onRename={() => setEditing(true)} onDelete={remove} />
          </div>
        </div>

        {/* Dimensioned progress rail — keeps the subject colour */}
        <div className="mt-4 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ground-deep ring-1 ring-inset ring-line">
            <motion.div className="h-full rounded-full"
              style={{ background: subject.color, boxShadow: `0 0 10px ${subject.color}88` }}
              initial={{ width: 0 }} animate={{ width: `${progress}%` }}
              transition={{ duration: 0.7, ease: 'easeOut' }} />
          </div>
          <span className="font-mono text-xs font-medium tabular-nums text-ink-dim">{progress}%</span>
        </div>
      </Link>
    </motion.div>
  );
}
