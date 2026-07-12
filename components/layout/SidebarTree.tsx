'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, ChevronDown, PanelLeftClose, PanelLeft } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { DroppableNode } from '@/components/dnd/DroppableNode';
import { nodeId } from '@/components/dnd/ids';

export function SidebarTree() {
  const data = useStore();
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => { setCollapsed(localStorage.getItem('ce-sidebar') === 'closed'); }, []);
  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('ce-sidebar', next ? 'closed' : 'open');
  };
  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }));

  if (collapsed) {
    return (
      <button onClick={toggleCollapsed} aria-label="Open sidebar"
        className="sticky top-[65px] h-fit rounded-lg border border-white/10 p-2 opacity-70 hover:opacity-100">
        <PanelLeft size={16} />
      </button>
    );
  }

  const subjects = data.subjectOrder.map((id) => data.subjects[id]).filter((s) => s && !s.archivedAt);

  return (
    <aside className="sticky top-[65px] hidden h-[calc(100vh-65px)] w-64 shrink-0 overflow-y-auto border-r border-white/10 p-3 text-sm md:block">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide opacity-40">Navigator</span>
        <button onClick={toggleCollapsed} aria-label="Collapse sidebar" className="opacity-50 hover:opacity-100"><PanelLeftClose size={15} /></button>
      </div>
      <ul className="space-y-0.5">
        {subjects.map((subject) => {
          const chapters = subject.chapterIds.map((cid) => data.chapters[cid]).filter((c) => c && !c.archivedAt);
          return (
            <li key={subject.id}>
              <DroppableNode id={nodeId('subject', subject.id)}>
                <div className="flex items-center gap-1 rounded px-1 py-1 hover:bg-white/5">
                  <button onClick={() => toggle(subject.id)} className="opacity-60" aria-label="Toggle">
                    {open[subject.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  <Link href={`/subject/${subject.id}`} className="truncate">{subject.name}</Link>
                </div>
              </DroppableNode>
              {open[subject.id] && (
                <ul className="ml-4 space-y-0.5 border-l border-white/10 pl-2">
                  {chapters.map((chapter) => {
                    const topics = chapter.topicIds.map((tid) => data.topics[tid]).filter((t) => t && !t.archivedAt);
                    return (
                      <li key={chapter.id}>
                        <DroppableNode id={nodeId('chapter', chapter.id)}>
                          <div className="flex items-center gap-1 rounded px-1 py-1 hover:bg-white/5">
                            <button onClick={() => toggle(chapter.id)} className="opacity-60" aria-label="Toggle">
                              {open[chapter.id] ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                            </button>
                            <Link href={`/chapter/${chapter.id}`} className="truncate">{chapter.name}</Link>
                          </div>
                        </DroppableNode>
                        {open[chapter.id] && (
                          <ul className="ml-4 space-y-0.5 border-l border-white/10 pl-2">
                            {topics.map((topic) => (
                              <li key={topic.id} className="truncate rounded px-1 py-0.5 hover:bg-white/5">
                                <Link href={`/topic/${topic.id}`}>{topic.title}</Link>
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
    </aside>
  );
}
