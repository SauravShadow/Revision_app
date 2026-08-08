'use client';
import { useState } from 'react';
import { Settings2, Plus, Trash2 } from 'lucide-react';
import { useStore } from '@/store/useStore';

const SWATCHES = ['#f59e0b', '#8b5cf6', '#ef4444', '#10b981', '#0ea5e9', '#ec4899', '#64748b'];

export function TagManager() {
  const [open, setOpen] = useState(false);
  const tags = useStore((s) => s.tags);
  const tagOrder = useStore((s) => s.tagOrder);
  const { addTag, updateTag, deleteTag } = useStore.getState();
  const [name, setName] = useState('');
  const [color, setColor] = useState(SWATCHES[0]);

  const create = () => { if (name.trim()) { addTag(name.trim(), color, 'Tag'); setName(''); } };

  return (
    <div className="relative inline-block">
      <button onClick={() => setOpen((o) => !o)} className="flex min-h-11 items-center gap-1 rounded-full border border-line bg-panel-2 px-3 text-xs text-ink-dim transition-colors hover:border-line-strong hover:text-ink md:min-h-0 md:px-2.5 md:py-1"><Settings2 size={12} /> Tags</button>
      {open && (
        // Every surface here reads a theme token. Hardcoded dark utilities
        // (bg-neutral-900, bg-black/30, bg-white/10) painted a near-black panel
        // while the text still inherited var(--ink) — near-black on near-black,
        // i.e. invisible, on both light themes.
        <div role="dialog" aria-label="Manage tags" className="absolute z-30 mt-2 w-72 rounded-xl border border-line bg-panel p-3 text-ink shadow-xl">
          <div className="mb-2 space-y-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New tag name" className="w-full rounded-lg border border-line bg-ground-deep px-2 py-1.5 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-accent" onKeyDown={(e) => e.key === 'Enter' && create()} />
            <div className="flex items-center gap-1.5">
              {SWATCHES.map((c) => (
                <button key={c} aria-label={`color ${c}`} onClick={() => setColor(c)} className={`h-5 w-5 rounded-full ${color === c ? 'ring-2 ring-ink ring-offset-1 ring-offset-panel' : ''}`} style={{ background: c }} />
              ))}
              <button onClick={create} className="ml-auto flex items-center gap-1 rounded-lg border border-line bg-panel-2 px-2 py-1 text-xs text-ink transition-colors hover:border-line-strong hover:bg-ground-deep"><Plus size={12} /> Add</button>
            </div>
          </div>
          <ul className="max-h-56 space-y-1 overflow-y-auto">
            {(tagOrder ?? []).map((id) => {
              const tag = (tags ?? {})[id];
              if (!tag) return null;
              return (
                <li key={id} className="flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-panel-2">
                  <span className="h-3 w-3 rounded-full" style={{ background: tag.color }} />
                  <input defaultValue={tag.name} onBlur={(e) => e.target.value.trim() && updateTag(id, { name: e.target.value.trim() })}
                    className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none" />
                  <button aria-label="Delete tag" onClick={() => { if (window.confirm(`Delete tag "${tag.name}"? It will be removed from all topics.`)) deleteTag(id); }} className="rounded p-1 text-ink-dim transition-colors hover:bg-panel-2 hover:text-alarm"><Trash2 size={13} /></button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
