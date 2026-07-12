'use client';
import Link from 'next/link';
import { motion } from 'framer-motion';
import type { Subject } from '@/lib/domain/types';
import { useStore } from '@/store/useStore';
import { subjectProgress, subjectStats } from '@/lib/revision/progress';
import { relativeLabel } from '@/lib/revision/engine';
import { RowActions } from '@/components/RowActions';

export function SubjectCard({ subject }: { subject: Subject }) {
  const data = useStore();
  const { renameSubject, deleteSubject } = useStore.getState();
  const now = Date.now();
  const progress = subjectProgress(data, subject.id, now);
  const stats = subjectStats(data, subject.id, now);
  const rename = () => { const n = window.prompt('Rename subject', subject.name); if (n && n.trim()) renameSubject(subject.id, n.trim()); };
  const remove = () => { if (window.confirm(`Delete "${subject.name}" and all its chapters/topics?`)) deleteSubject(subject.id); };
  return (
    <motion.div whileHover={{ y: -4 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}>
      <Link href={`/subject/${subject.id}`}
        className="group glass block rounded-2xl p-5"
        style={{ boxShadow: `inset 0 0 0 1px ${subject.color}22` }}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{subject.name}</h3>
          <div className="flex items-center gap-2">
            <span className="text-sm opacity-60">{progress}%</span>
            <RowActions onRename={rename} onDelete={remove} />
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full" style={{ width: `${progress}%`, background: subject.color }} />
        </div>
        <div className="mt-4 flex justify-between text-xs opacity-60">
          <span>{stats.chapterCount} chapters</span>
          <span>{stats.pending} pending</span>
          <span>{stats.lastRevised ? relativeLabel(stats.lastRevised, now) : 'Never'}</span>
        </div>
      </Link>
    </motion.div>
  );
}
