'use client';
import { useEffect, useState } from 'react';
import { useStore } from '@/store/useStore';

export function StoreHydrator({ children }: { children: React.ReactNode }) {
  const hydrate = useStore((s) => s.hydrate);
  const [ready, setReady] = useState(false);
  useEffect(() => { void hydrate().then(() => setReady(true)); }, [hydrate]);
  if (!ready) {
    return <div className="grid min-h-screen place-items-center text-sm opacity-60">Loading…</div>;
  }
  return <>{children}</>;
}
