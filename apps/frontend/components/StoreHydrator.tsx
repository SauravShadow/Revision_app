'use client';
import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/store/useStore';
import { useAuth } from '@/components/AuthProvider';
import { authFetch } from '@/lib/auth/client';

export function StoreHydrator({ children }: { children: React.ReactNode }) {
  const hydrate = useStore((s) => s.hydrate);
  const { session, loading: authLoading } = useAuth();
  const [ready, setReady] = useState(false);
  // Track *which* user the in-memory store was hydrated for. The root layout
  // (and thus this component) never unmounts across login/logout, so a plain
  // "hydrated once" boolean would leave the previous account's data in the
  // singleton store after an account switch. Keying on userId re-hydrates when
  // the logged-in user changes and resets on logout.
  const hydratedUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!session) {
      // Logged out: forget the previous user so the next login re-hydrates.
      hydratedUserRef.current = null;
      setReady(false);
      return;
    }
    if (hydratedUserRef.current === session.userId) return;
    hydratedUserRef.current = session.userId;
    setReady(false);
    void hydrate(session.domain).then(() => {
      setReady(true);
      void authFetch('/api/files/gc', { method: 'POST' }).catch(() => {});
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

  // Auth still resolving, or confirmed unauthenticated: render children
  // immediately rather than blocking — AuthProvider/AppShell handle the
  // redirect to /login, and there's no data to hydrate without a session.
  if (!ready && (authLoading || !session)) {
    return <>{children}</>;
  }

  if (!ready) {
    return <div className="grid min-h-screen place-items-center text-sm opacity-60">Loading…</div>;
  }
  return <>{children}</>;
}

