'use client';
import { Undo2, Redo2, Check, Loader2 } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { useUndoRedoShortcuts } from '@/components/hooks/useUndoRedoShortcuts';

export function HeaderControls() {
  useUndoRedoShortcuts();
  const canUndo = useStore((s) => s.history.past.length > 0);
  const canRedo = useStore((s) => s.history.future.length > 0);
  const saveState = useStore((s) => s.saveState);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  return (
    <div className="flex items-center gap-2">
      {saveState !== 'idle' && (
        <span className="flex items-center gap-1 text-xs opacity-60">
          {saveState === 'saving' ? <><Loader2 size={13} className="animate-spin" /> Saving…</> : <><Check size={13} /> Saved</>}
        </span>
      )}
      <button aria-label="Undo" disabled={!canUndo} onClick={undo}
        className="rounded-lg border border-white/10 p-2 transition hover:bg-white/5 disabled:opacity-30"><Undo2 size={16} /></button>
      <button aria-label="Redo" disabled={!canRedo} onClick={redo}
        className="rounded-lg border border-white/10 p-2 transition hover:bg-white/5 disabled:opacity-30"><Redo2 size={16} /></button>
    </div>
  );
}
