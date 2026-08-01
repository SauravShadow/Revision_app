'use client';
import { useEffect, useRef } from 'react';
import { useStore } from '@/store/useStore';
import { useAuth } from '@/components/AuthProvider';
import { authFetch } from '@/lib/auth/client';

export function StoreHydrator({ children }: { children: React.ReactNode }) {
  const hydrate = useStore((s) => s.hydrate);
  const { session, loading: authLoading } = useAuth();
  // Track *which* user the in-memory store was hydrated for. The root layout
  // (and thus this component) never unmounts across login/logout, so a plain
  // "hydrated once" boolean would leave the previous account's data in the
  // singleton store after an account switch. Keying on userId re-hydrates when
  // the logged-in user changes and resets on logout.
  const hydratedUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!session) {
      // Logged out: forget the previous user so the next login re-hydrates, and
      // clear the flag so routes don't render the old account's data as ready.
      hydratedUserRef.current = null;
      useStore.setState({ hydrated: false });
      return;
    }
    if (hydratedUserRef.current === session.userId) return;
    hydratedUserRef.current = session.userId;
    void hydrate(session.domain).then(() => {
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

  // Always render children. The shell — header, sidebar, bottom tab bar —
  // depends only on the session, so it can paint immediately; each route shows
  // its own skeleton for the data region while `hydrated` is false. Blocking
  // here withheld the entire app for 5127ms on / under 3G + 4x CPU throttling,
  // showing nothing but a centred "Loading…".
  return <>{children}</>;
}

