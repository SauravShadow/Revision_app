'use client';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
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
        className="touch-target tblabel flex items-center gap-2 rounded-md border border-line px-2.5 py-3 text-ink-dim transition hover:border-line-strong hover:text-ink active:bg-panel-2 active:text-ink md:py-1.5">
        <Search size={14} /> <span className="hidden sm:inline">Search</span>
        <kbd className="hidden rounded border border-line px-1 font-mono text-[0.6rem] text-ink-faint sm:inline">⌘K</kbd>
      </button>
      {/* Full-screen takeover on phones: as a centred pt-24 overlay the
          on-screen keyboard left roughly 200px for results. Portalled to
          <body> because the header's backdrop-blur is a containing block for
          fixed descendants, which pinned this overlay to the header strip. */}
      {open && createPortal(
        <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-ground-deep/70 backdrop-blur-sm sm:items-start sm:p-4 sm:pt-24" onClick={() => setOpen(false)}>
          <div className="glass flex h-full w-full flex-col overflow-hidden ring-1 ring-accent/20 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)] sm:h-auto sm:max-w-xl sm:rounded-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 pt-[env(safe-area-inset-top)]">
              <Search size={15} className="shrink-0 text-accent" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onInputKey}
                type="search" enterKeyHint="search"
                placeholder="Search subjects, chapters, topics, notes, tags…"
                className="w-full bg-transparent py-3.5 text-sm text-ink outline-none placeholder:text-ink-faint [&::-webkit-search-cancel-button]:appearance-none sm:py-3" />
              <button type="button" aria-label="Close search" onClick={() => setOpen(false)}
                className="-mr-2 shrink-0 rounded p-2 text-ink-faint transition active:text-ink sm:hidden">
                <X size={18} />
              </button>
            </div>
            <ul className="flex-1 overflow-y-auto p-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] sm:max-h-80 sm:flex-none">
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
        </div>,
        document.body,
      )}
    </>
  );
}
