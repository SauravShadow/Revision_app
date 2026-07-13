'use client';
import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/store/useStore';
import { useAuth } from '@/components/AuthProvider';

export function StoreHydrator({ children }: { children: React.ReactNode }) {
  const hydrate = useStore((s) => s.hydrate);
  const { session, loading: authLoading } = useAuth();
  const [ready, setReady] = useState(false);
  const hydratedRef = useRef(false);

  useEffect(() => {
    // Don't hydrate until auth is settled and we have a valid session
    if (authLoading || !session || hydratedRef.current) return;
    hydratedRef.current = true;
    void hydrate().then(() => {
      setReady(true);
      void fetch('/api/files/gc', { method: 'POST' }).catch(() => {});
    });
  }, [authLoading, session, hydrate]);

  useEffect(() => {
    const flush = () => useStore.getState().flushSave();
    window.addEventListener('pagehide', flush);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') useStore.getState().flushSave(false);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  if (!ready) {
    return <div className="grid min-h-screen place-items-center text-sm opacity-60">Loading…</div>;
  }
  return <>{children}</>;
}

