'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getSession, logout as apiLogout } from '@/lib/auth/client';
import type { Session } from '@/lib/auth/client';

interface AuthContextValue {
  session: Session | null;
  /** true while the initial /api/auth/me check is in flight */
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  loading: true,
  logout: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

const PUBLIC_PATHS = ['/login', '/register'];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const checkedRef = useRef(false);

  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;

    getSession().then((s) => {
      setSession(s);
      setLoading(false);
      if (!s && !PUBLIC_PATHS.includes(pathname)) {
        router.replace('/login');
      }
    });
  }, [pathname, router]);

  // Redirect authenticated users away from auth pages
  useEffect(() => {
    if (!loading && session && PUBLIC_PATHS.includes(pathname)) {
      router.replace('/');
    }
  }, [loading, session, pathname, router]);

  const logout = useCallback(async () => {
    await apiLogout();
    setSession(null);
    router.replace('/login');
  }, [router]);

  return (
    <AuthContext.Provider value={{ session, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
