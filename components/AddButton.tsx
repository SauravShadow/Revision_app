'use client';
import { Plus } from 'lucide-react';

export function AddButton({ label, onAdd }: { label: string; onAdd: (name: string) => void }) {
  const click = () => {
    const name = window.prompt(`Name for new ${label}?`);
    if (name && name.trim()) onAdd(name.trim());
  };
  return (
    <button onClick={click}
      className="flex items-center gap-2 rounded-xl border border-dashed border-white/15 px-4 py-3 text-sm opacity-80 transition hover:border-white/30 hover:opacity-100">
      <Plus size={16} /> Add {label}
    </button>
  );
}
