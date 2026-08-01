'use client';
import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

interface InlineSearchProps {
  onChange: (query: string) => void;
  placeholder?: string;
  debounceMs?: number;
}

// Persistent, visible search pill (Phase 2) — makes search discoverable next to
// the command palette. Debounced onChange, clearable, and "/" focuses it from
// anywhere outside a text field.
export function InlineSearch({ onChange, placeholder = 'Search…', debounceMs = 150 }: InlineSearchProps) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const cb = useRef(onChange);
  const first = useRef(true);
  useEffect(() => { cb.current = onChange; });

  // Debounce user typing before emitting.
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const id = setTimeout(() => cb.current(text), debounceMs);
    return () => clearTimeout(id);
  }, [text, debounceMs]);

  // "/" focuses the field, unless the user is already typing somewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/') return;
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const clear = () => {
    setText('');
    cb.current('');
    inputRef.current?.focus();
  };

  return (
    <div className="relative mb-4">
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
      <input
        ref={inputRef}
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        aria-label="Search"
        className="auth-input min-h-11 !py-2 !pl-9 !pr-9 md:min-h-0 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {text && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={clear}
          className="touch-target absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-ink-faint transition hover:text-ink"
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
}
