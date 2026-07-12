'use client';
import { useEffect, useState } from 'react';
import { useStore } from '@/store/useStore';

export function StoreHydrator({ children }: { children: React.ReactNode }) {
  const hydrate = useStore((s) => s.hydrate);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void hydrate().then(() => {
      setReady(true);
      void fetch('/api/files/gc', { method: 'POST' }).catch(() => {});
    });
  }, [hydrate]);
  useEffect(() => {
    const flush = () => useStore.getState().flushSave();
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);
  if (!ready) {
    return <div className="grid min-h-screen place-items-center text-sm opacity-60">Loading…</div>;
  }
  return <>{children}</>;
}
