'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { search } from '@/lib/search/search';

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const router = useRouter();
  const data = useStore();
  const results = useMemo(() => (open ? search(q, data) : []), [open, q, data]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o); }
      else if (e.key === 'Escape') setOpen(false);
    };
    // Decoupled opener so the mobile Search tab (BottomTabBar) can raise the palette.
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('open-command-palette', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('open-command-palette', onOpen);
    };
  }, []);

  useEffect(() => { setActive(0); }, [q, open]);

  const go = (href: string) => { setOpen(false); setQ(''); router.push(href); };
  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && results[active]) { e.preventDefault(); go(results[active].href); }
  };

  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Search"
        className="tblabel flex items-center gap-2 rounded-md border border-line px-2.5 py-3 text-ink-dim transition hover:border-line-strong hover:text-ink active:bg-panel-2 active:text-ink md:py-1.5">
        <Search size={14} /> <span className="hidden sm:inline">Search</span>
        <kbd className="hidden rounded border border-line px-1 font-mono text-[0.6rem] text-ink-faint sm:inline">⌘K</kbd>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-ground-deep/70 p-4 pt-24 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="glass w-full max-w-xl overflow-hidden rounded-xl ring-1 ring-accent/20 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-line px-4">
              <Search size={15} className="shrink-0 text-accent" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onInputKey}
                placeholder="Search subjects, chapters, topics, notes, tags…"
                className="w-full bg-transparent py-3 text-sm text-ink outline-none placeholder:text-ink-faint" />
            </div>
            <ul className="max-h-80 overflow-y-auto p-1.5">
              {q && results.length === 0 && <li className="tblabel px-3 py-4">No matches.</li>}
              {results.map((r, i) => (
                <li key={`${r.kind}:${r.id}`}>
                  <button onClick={() => go(r.href)} onMouseEnter={() => setActive(i)}
                    className={`flex w-full items-center justify-between gap-2 rounded-md border-l-2 px-3 py-2.5 text-left text-sm transition-colors active:bg-panel-2 md:py-2 ${i === active ? 'border-l-accent bg-panel-2 text-ink' : 'border-l-transparent text-ink-dim hover:bg-panel'}`}>
                    <span className="min-w-0 truncate">{r.label}{r.sublabel ? <span className="text-ink-faint"> · {r.sublabel}</span> : null}</span>
                    <span className="tblabel shrink-0">{r.kind}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
