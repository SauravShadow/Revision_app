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
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-xs opacity-70 hover:opacity-100"><Settings2 size={12} /> Tags</button>
      {open && (
        <div className="absolute z-30 mt-2 w-72 rounded-xl border border-white/10 bg-neutral-900 p-3 shadow-xl">
          <div className="mb-2 space-y-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New tag name" className="w-full rounded-lg bg-black/30 px-2 py-1.5 text-sm outline-none" onKeyDown={(e) => e.key === 'Enter' && create()} />
            <div className="flex items-center gap-1.5">
              {SWATCHES.map((c) => (
                <button key={c} aria-label={`color ${c}`} onClick={() => setColor(c)} className={`h-5 w-5 rounded-full ${color === c ? 'ring-2 ring-white' : ''}`} style={{ background: c }} />
              ))}
              <button onClick={create} className="ml-auto flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-xs hover:bg-white/20"><Plus size={12} /> Add</button>
            </div>
          </div>
          <ul className="max-h-56 space-y-1 overflow-y-auto">
            {(tagOrder ?? []).map((id) => {
              const tag = (tags ?? {})[id];
              if (!tag) return null;
              return (
                <li key={id} className="flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-white/5">
                  <span className="h-3 w-3 rounded-full" style={{ background: tag.color }} />
                  <input defaultValue={tag.name} onBlur={(e) => e.target.value.trim() && updateTag(id, { name: e.target.value.trim() })}
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
                  <button aria-label="Delete tag" onClick={() => { if (window.confirm(`Delete tag "${tag.name}"? It will be removed from all topics.`)) deleteTag(id); }} className="rounded p-1 hover:bg-white/10"><Trash2 size={13} /></button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
