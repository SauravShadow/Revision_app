'use client';
import { Undo2, Redo2, Check, Loader2, TriangleAlert } from 'lucide-react';
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
        <span className="tblabel flex items-center gap-1 normal-case tracking-normal">
          {saveState === 'saving'
            ? <><Loader2 size={13} className="animate-spin text-accent" /> Saving…</>
            : saveState === 'error'
              ? <><TriangleAlert size={13} className="text-alarm" /> Save failed — retrying</>
              : <><Check size={13} className="text-go" /> Saved</>}
        </span>
      )}
      <button aria-label="Undo" disabled={!canUndo} onClick={undo}
        className="rounded-md border border-line p-3 text-ink-dim transition hover:border-line-strong hover:bg-panel hover:text-ink disabled:opacity-30 md:p-2"><Undo2 size={16} /></button>
      <button aria-label="Redo" disabled={!canRedo} onClick={redo}
        className="rounded-md border border-line p-3 text-ink-dim transition hover:border-line-strong hover:bg-panel hover:text-ink disabled:opacity-30 md:p-2"><Redo2 size={16} /></button>
    </div>
  );
}
