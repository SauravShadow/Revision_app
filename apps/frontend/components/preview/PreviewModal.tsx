'use client';
import { useEffect } from 'react';
import { X, ExternalLink } from 'lucide-react';
import type { PreviewItem } from './PreviewContext';

export function PreviewModal({ item, onClose }: { item: PreviewItem; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid grid-rows-[auto_1fr] gap-3 bg-black/80 p-4" onClick={onClose}>
      <div className="flex items-center justify-between text-sm text-white" onClick={(e) => e.stopPropagation()}>
        <span className="truncate">{item.name}</span>
        <div className="flex items-center gap-3">
          <a href={item.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 opacity-80 hover:opacity-100">
            <ExternalLink size={16} /> Open
          </a>
          <button aria-label="Close preview" onClick={onClose} className="opacity-80 hover:opacity-100"><X size={18} /></button>
        </div>
      </div>
      <div className="min-h-0" onClick={(e) => e.stopPropagation()}>
        {item.kind === 'image' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.url} alt={item.name} className="mx-auto h-full max-h-full w-auto max-w-full rounded-lg object-contain" />
        ) : (
          <iframe src={item.url} title={item.name} className="h-full w-full rounded-lg bg-white" />
        )}
      </div>
    </div>
  );
}
