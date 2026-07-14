'use client';
import { useEffect, useRef, useState } from 'react';

export function InlineEditable({
  value, editing, onEditingChange, onCommit, className, inputClassName,
}: {
  value: string;
  editing: boolean;
  onEditingChange: (v: boolean) => void;
  onCommit: (next: string) => void;
  className?: string;
  inputClassName?: string;
}) {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(value); }, [value, editing]);
  useEffect(() => {
    if (editing) { ref.current?.focus(); ref.current?.select(); }
  }, [editing]);

  const commit = () => {
    const t = draft.trim();
    if (t) onCommit(t);
    onEditingChange(false);
  };
  const cancel = () => { setDraft(value); onEditingChange(false); };

  if (editing) {
    return (
      <input
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        }}
        // Prevent a parent <Link> from navigating while editing.
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
        className={inputClassName ?? 'w-full rounded bg-white/10 px-1 outline-none'}
      />
    );
  }
  return <span className={className}>{value}</span>;
}
