'use client';
import { useState } from 'react';
import { Pencil, Trash2, Copy, MoreVertical } from 'lucide-react';
import { IconButton } from '@/components/ui/IconButton';
import { Sheet } from '@/components/Sheet';

/**
 * Secondary row actions.
 *
 * Desktop keeps the inline hover-reveal row it always had. Phones get a single
 * overflow button instead: three permanently-visible 44px buttons spent
 * 88-132px of a 290px row on secondary actions, which is what squeezed list
 * titles down to "Mat…". One button costs 44px and nothing becomes unreachable.
 */
export function RowActions({ onRename, onDelete, onDuplicate }: {
  onRename: () => void; onDelete: () => void; onDuplicate?: () => void;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const cls = 'min-h-11 min-w-11 p-2 hover:bg-white/10 active:bg-white/15 md:min-h-0 md:min-w-0 md:p-1.5';

  // The row is a <Link>; without this every tap navigates instead of acting.
  const run = (fn: () => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSheetOpen(false);
    fn();
  };

  return (
    <>
      {/* Phones: one overflow affordance. */}
      <IconButton
        label="More actions"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSheetOpen(true); }}
        className="min-h-11 min-w-11 shrink-0 text-ink-dim hover:bg-white/10 md:hidden"
      >
        <MoreVertical size={18} />
      </IconButton>

      {/* Desktop: the original inline row, revealed on hover. */}
      <div className="hidden items-center gap-1 transition md:flex md:opacity-0 md:group-hover:opacity-100">
        <IconButton label="Rename" onClick={run(onRename)} className={cls}><Pencil size={15} /></IconButton>
        {onDuplicate && <IconButton label="Duplicate" onClick={run(onDuplicate)} className={cls}><Copy size={15} /></IconButton>}
        <IconButton label="Delete" onClick={run(onDelete)} className={cls}><Trash2 size={15} /></IconButton>
      </div>

      {sheetOpen && (
        <Sheet label="Row actions" onClose={() => setSheetOpen(false)}>
          <div className="flex flex-col p-2">
            <button type="button" onClick={run(onRename)}
              className="flex min-h-14 items-center gap-3 rounded-lg px-4 text-left text-base text-ink transition-colors active:bg-panel-2">
              <Pencil size={18} className="shrink-0 text-ink-dim" /> Rename
            </button>
            {onDuplicate && (
              <button type="button" onClick={run(onDuplicate)}
                className="flex min-h-14 items-center gap-3 rounded-lg px-4 text-left text-base text-ink transition-colors active:bg-panel-2">
                <Copy size={18} className="shrink-0 text-ink-dim" /> Duplicate
              </button>
            )}
            <button type="button" onClick={run(onDelete)}
              className="flex min-h-14 items-center gap-3 rounded-lg px-4 text-left text-base text-alarm transition-colors active:bg-panel-2">
              <Trash2 size={18} className="shrink-0" /> Archive
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}
