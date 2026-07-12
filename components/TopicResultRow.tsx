'use client';
import Link from 'next/link';
import type { Chapter, Subject, Topic } from '@/lib/domain/types';
import { badgeState } from '@/lib/revision/engine';
import { RevisionBadge } from '@/components/RevisionBadge';

export function TopicResultRow({ topic, subject, chapter }: { topic: Topic; subject?: Subject; chapter?: Chapter }) {
  return (
    <Link href={`/topic/${topic.id}`} className="glass flex items-center justify-between gap-3 rounded-xl p-4 hover:bg-white/5">
      <div className="min-w-0">
        <div className="font-medium">{topic.title}</div>
        <div className="mt-0.5 truncate text-xs opacity-50">{subject?.name}{chapter ? ` · ${chapter.name}` : ''}</div>
      </div>
      <RevisionBadge state={badgeState(topic.revisionHistory, Date.now())} />
    </Link>
  );
}
