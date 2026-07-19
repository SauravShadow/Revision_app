'use client';
import { createContext, useContext, useState, useCallback } from 'react';
import { PreviewModal } from './PreviewModal';

export type PreviewKind = 'image' | 'pdf';
export interface PreviewItem { url: string; name: string; kind: PreviewKind }

type OpenPreview = (item: PreviewItem) => void;

const PreviewContext = createContext<{ openPreview: OpenPreview | null }>({ openPreview: null });

export function usePreview() {
  return useContext(PreviewContext);
}

export function PreviewProvider({ children }: { children: React.ReactNode }) {
  const [item, setItem] = useState<PreviewItem | null>(null);
  const openPreview = useCallback<OpenPreview>((next) => setItem(next), []);
  return (
    <PreviewContext.Provider value={{ openPreview }}>
      {children}
      {item && <PreviewModal item={item} onClose={() => setItem(null)} />}
    </PreviewContext.Provider>
  );
}
