'use client';
import { useEffect, useState } from 'react';
import { PanelLeftClose, PanelLeft } from 'lucide-react';
import { NavTree } from './NavTree';

export function SidebarTree() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => { setCollapsed(localStorage.getItem('ce-sidebar') === 'closed'); }, []);
  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('ce-sidebar', next ? 'closed' : 'open');
  };

  if (collapsed) {
    return (
      <button onClick={toggleCollapsed} aria-label="Open sidebar"
        className="sticky top-[73px] hidden h-fit rounded-md border border-line p-2 text-ink-dim transition hover:border-line-strong hover:text-accent md:block">
        <PanelLeft size={16} />
      </button>
    );
  }

  return (
    <aside className="sticky top-[73px] hidden h-[calc(100vh-73px)] w-64 shrink-0 overflow-y-auto border-r border-line p-3 text-sm md:block">
      <div className="mb-3 flex items-center justify-between border-b border-line pb-2">
        <span className="tblabel">Navigator</span>
        <button onClick={toggleCollapsed} aria-label="Collapse sidebar" className="text-ink-faint transition hover:text-accent"><PanelLeftClose size={15} /></button>
      </div>
      <NavTree />
    </aside>
  );
}
