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
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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
        className="flex items-center gap-2 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs opacity-70 transition hover:opacity-100">
        <Search size={14} /> <span className="hidden sm:inline">Search</span> <kbd className="hidden rounded bg-white/10 px-1 sm:inline">⌘K</kbd>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-24" onClick={() => setOpen(false)}>
          <div className="glass w-full max-w-xl overflow-hidden rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onInputKey}
              placeholder="Search subjects, chapters, topics, notes, tags…"
              className="w-full border-b border-white/10 bg-transparent px-4 py-3 text-sm outline-none" />
            <ul className="max-h-80 overflow-y-auto p-1">
              {q && results.length === 0 && <li className="px-3 py-4 text-sm opacity-50">No matches.</li>}
              {results.map((r, i) => (
                <li key={`${r.kind}:${r.id}`}>
                  <button onClick={() => go(r.href)} onMouseEnter={() => setActive(i)}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm ${i === active ? 'bg-white/15' : 'hover:bg-white/5'}`}>
                    <span className="min-w-0 truncate">{r.label}{r.sublabel ? <span className="opacity-50"> · {r.sublabel}</span> : null}</span>
                    <span className="shrink-0 text-xs uppercase opacity-40">{r.kind}</span>
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
