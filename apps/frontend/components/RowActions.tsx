'use client';
import { Pencil, Trash2, Copy } from 'lucide-react';
import { IconButton } from '@/components/ui/IconButton';

export function RowActions({ onRename, onDelete, onDuplicate }: {
  onRename: () => void; onDelete: () => void; onDuplicate?: () => void;
}) {
  // Up to three buttons at gap-1 (4px). At their 31px drawn size a 44px ::after
  // box would overlap each neighbour by ~9px and land taps on the wrong action,
  // so the drawn box grows on phones instead. Desktop keeps the tight row.
  const cls = 'min-h-11 min-w-11 p-2 hover:bg-white/10 active:bg-white/15 md:min-h-0 md:min-w-0 md:p-1.5';
  return (
    <div className="flex items-center gap-1 opacity-100 transition md:opacity-0 md:group-hover:opacity-100">
      <IconButton label="Rename" onClick={(e) => { e.preventDefault(); onRename(); }} className={cls}><Pencil size={15} /></IconButton>
      {onDuplicate && <IconButton label="Duplicate" onClick={(e) => { e.preventDefault(); onDuplicate(); }} className={cls}><Copy size={15} /></IconButton>}
      <IconButton label="Delete" onClick={(e) => { e.preventDefault(); onDelete(); }} className={cls}><Trash2 size={15} /></IconButton>
    </div>
  );
}
