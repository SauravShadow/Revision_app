'use client';
import { Pencil, Trash2, Copy } from 'lucide-react';

export function RowActions({ onRename, onDelete, onDuplicate }: {
  onRename: () => void; onDelete: () => void; onDuplicate?: () => void;
}) {
  return (
    <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
      <button aria-label="Rename" onClick={(e) => { e.preventDefault(); onRename(); }} className="rounded p-1.5 hover:bg-white/10"><Pencil size={15} /></button>
      {onDuplicate && <button aria-label="Duplicate" onClick={(e) => { e.preventDefault(); onDuplicate(); }} className="rounded p-1.5 hover:bg-white/10"><Copy size={15} /></button>}
      <button aria-label="Delete" onClick={(e) => { e.preventDefault(); onDelete(); }} className="rounded p-1.5 hover:bg-white/10"><Trash2 size={15} /></button>
    </div>
  );
}
