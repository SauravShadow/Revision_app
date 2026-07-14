'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { Subject } from '@revision-app/shared';
import { useStore } from '@/store/useStore';
import { subjectProgress, subjectStats } from '@/lib/revision/progress';
import { relativeLabel } from '@/lib/revision/engine';
import { RowActions } from '@/components/RowActions';
import { InlineEditable } from '@/components/InlineEditable';

export function SubjectCard({ subject, autoEdit = false }: { subject: Subject; autoEdit?: boolean }) {
  const data = useStore();
  const { renameSubject, archiveSubject } = useStore.getState();
  const [editing, setEditing] = useState(autoEdit);
  useEffect(() => { if (autoEdit) setEditing(true); }, [autoEdit]);
  const now = Date.now();
  const progress = subjectProgress(data, subject.id, now);
  const stats = subjectStats(data, subject.id, now);
  const remove = () => { if (window.confirm(`Archive "${subject.name}"? You can restore it later.`)) archiveSubject(subject.id); };
  return (
    <motion.div whileHover={{ y: -4 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}>
      <Link href={`/subject/${subject.id}`}
        className="group glass gradient-border bp-ticks relative block rounded-xl p-5 transition-shadow hover:shadow-[0_18px_40px_-24px_rgba(0,0,0,0.9)]"
        style={{ boxShadow: `inset 3px 0 0 0 ${subject.color}` }}>
        <div className="flex items-start justify-between gap-2">
          <h3 className="pr-2 font-semibold tracking-tight text-ink" onDoubleClick={(e) => { e.preventDefault(); setEditing(true); }}>
            <InlineEditable value={subject.name} editing={editing} onEditingChange={setEditing}
              onCommit={(n) => renameSubject(subject.id, n)} />
          </h3>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-lg font-medium leading-none text-accent">{progress}<span className="text-xs text-ink-dim">%</span></span>
            <RowActions onRename={() => setEditing(true)} onDelete={remove} />
          </div>
        </div>

        {/* Dimensioned progress rail */}
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-ground-deep ring-1 ring-inset ring-line">
          <motion.div className="h-full rounded-full"
            style={{ background: subject.color, boxShadow: `0 0 10px ${subject.color}88` }}
            initial={{ width: 0 }} animate={{ width: `${progress}%` }}
            transition={{ duration: 0.7, ease: 'easeOut' }} />
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
          <span className="tblabel">CH&nbsp;<span className="text-ink">{String(stats.chapterCount).padStart(2, '0')}</span></span>
          <span className="tblabel">PEND&nbsp;<span className={stats.pending ? 'text-annotation' : 'text-ink'}>{String(stats.pending).padStart(2, '0')}</span></span>
          <span className="tblabel normal-case tracking-normal">{stats.lastRevised ? relativeLabel(stats.lastRevised, now) : '— never —'}</span>
        </div>
      </Link>
    </motion.div>
  );
}
