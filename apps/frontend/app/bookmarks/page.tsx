'use client';
import Link from 'next/link';
import { Star } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { Breadcrumb } from '@/components/layout/Breadcrumb';

export default function BookmarksPage() {
  const data = useStore();
  const topics = Object.values(data.topics).filter((t) => t.bookmarkedAt && !t.archivedAt);
  return (
    <div>
      <Breadcrumb items={[{ label: 'Subjects', href: '/' }, { label: 'Bookmarks' }]} />
      <div className="mb-6 mt-4"><div className="tblabel mb-1.5">Flagged · Starred topics</div><h1 className="text-2xl font-semibold tracking-tight text-ink">Bookmarks</h1></div>
      {topics.length === 0 ? (
        <p className="text-sm opacity-50">No bookmarks yet. Star a topic to pin it here.</p>
      ) : (
        <div className="grid gap-3">
          {topics.map((t) => {
            const chapter = data.chapters[t.chapterId];
            const subject = chapter ? data.subjects[chapter.subjectId] : undefined;
            return (
              <Link key={t.id} href={`/topic/${t.id}`} className="glass flex items-center gap-3 rounded-xl p-4 hover:bg-panel-2">
                <Star size={16} className="fill-amber-400 text-amber-400" />
                <div className="min-w-0">
                  <div className="font-medium">{t.title}</div>
                  <div className="mt-0.5 text-xs opacity-50">{subject?.name}{chapter ? ` · ${chapter.name}` : ''}</div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
