'use client';
import { Plus } from 'lucide-react';

export function AddButton({ label, onAdd }: { label: string; onAdd: (name: string) => void }) {
  const click = () => {
    const name = window.prompt(`Name for new ${label}?`);
    if (name && name.trim()) onAdd(name.trim());
  };
  return (
    <button onClick={click}
      className="tblabel group flex items-center gap-2 rounded-lg border border-dashed border-line-strong px-4 py-2.5 text-accent transition-colors hover:border-accent hover:bg-accent-soft active:border-accent active:bg-accent-soft">
      <Plus size={15} className="transition-transform group-hover:rotate-90" /> Add {label}
    </button>
  );
}
