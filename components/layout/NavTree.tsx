'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { DroppableNode } from '@/components/dnd/DroppableNode';
import { nodeId } from '@/components/dnd/ids';

export function NavTree({ onNavigate }: { onNavigate?: () => void } = {}) {
  const data = useStore();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }));

  const subjects = data.subjectOrder.map((id) => data.subjects[id]).filter((s) => s && !s.archivedAt);

  return (
    <ul className="space-y-0.5">
      {subjects.map((subject) => {
        const chapters = subject.chapterIds.map((cid) => data.chapters[cid]).filter((c) => c && !c.archivedAt);
        return (
          <li key={subject.id}>
            <DroppableNode id={nodeId('subject', subject.id)}>
              <div className="flex items-center gap-1 rounded px-1 py-1 hover:bg-panel hover:text-ink">
                <button onClick={() => toggle(subject.id)} className="opacity-60" aria-label="Toggle">
                  {open[subject.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                <Link href={`/subject/${subject.id}`} onClick={onNavigate} className="truncate">{subject.name}</Link>
              </div>
            </DroppableNode>
            {open[subject.id] && (
              <ul className="ml-4 space-y-0.5 border-l border-line pl-2">
                {chapters.map((chapter) => {
                  const topics = chapter.topicIds.map((tid) => data.topics[tid]).filter((t) => t && !t.archivedAt);
                  return (
                    <li key={chapter.id}>
                      <DroppableNode id={nodeId('chapter', chapter.id)}>
                        <div className="flex items-center gap-1 rounded px-1 py-1 hover:bg-panel hover:text-ink">
                          <button onClick={() => toggle(chapter.id)} className="opacity-60" aria-label="Toggle">
                            {open[chapter.id] ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                          </button>
                          <Link href={`/chapter/${chapter.id}`} onClick={onNavigate} className="truncate">{chapter.name}</Link>
                        </div>
                      </DroppableNode>
                      {open[chapter.id] && (
                        <ul className="ml-4 space-y-0.5 border-l border-line pl-2">
                          {topics.map((topic) => (
                            <li key={topic.id} className="truncate rounded px-1 py-0.5 hover:bg-panel hover:text-ink">
                              <Link href={`/topic/${topic.id}`} onClick={onNavigate}>{topic.title}</Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
