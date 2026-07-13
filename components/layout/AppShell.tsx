'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from './ThemeToggle';
import { SidebarTree } from './SidebarTree';
import { HeaderControls } from './HeaderControls';
import { MobileNavDrawer } from './MobileNavDrawer';
import { CommandPalette } from '@/components/CommandPalette';
import { useAuth } from '@/components/AuthProvider';
import { DOMAIN_LABELS } from '@/lib/auth/types';

const AUTH_PATHS = ['/login', '/register'];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { session, loading, logout } = useAuth();

  // On auth pages or while loading without a session, just render children
  if (AUTH_PATHS.includes(pathname) || (loading && !session)) {
    return <>{children}</>;
  }

  return (
    <div className="relative z-10 min-h-screen">
      {/* Titleblock — the header strip of a drafting sheet */}
      <header className="sticky top-0 z-20 border-b border-line-strong bg-ground-deep/80 backdrop-blur-md">
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <MobileNavDrawer />
            <Link href="/" className="group flex shrink-0 items-center gap-3">
              {/* Registration mark */}
              <span className="relative grid h-7 w-7 place-items-center rounded-sm border border-line-strong text-accent">
                <span className="absolute inset-x-1 top-1/2 h-px -translate-y-1/2 bg-current opacity-40" />
                <span className="absolute inset-y-1 left-1/2 w-px -translate-x-1/2 bg-current opacity-40" />
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              </span>
              <span className="flex flex-col leading-none">
                <span className="text-sm font-semibold tracking-tight text-ink">REVISION OS</span>
                <span className="tblabel mt-0.5 text-[0.58rem]">
                  {session ? DOMAIN_LABELS[session.domain] ?? session.domain : 'Loading…'}
                </span>
              </span>
            </Link>
          </div>

          <nav className="flex items-center gap-2">
            <CommandPalette />
            <HeaderControls />
            <span className="mx-1 hidden h-5 w-px bg-line sm:block" />
            <Link href="/filtered" className="tblabel rounded px-2 py-1 transition hover:bg-panel hover:text-ink">Filtered</Link>
            <Link href="/bookmarks" className="tblabel hidden rounded px-2 py-1 transition hover:bg-panel hover:text-ink sm:block">Bookmarks</Link>
            <Link href="/archive" className="tblabel hidden rounded px-2 py-1 transition hover:bg-panel hover:text-ink sm:block">Archive</Link>
            <ThemeToggle />
            {session && (
              <>
                <span className="mx-1 hidden h-5 w-px bg-line sm:block" />
                <div className="flex items-center gap-2">
                  <span className="hidden text-xs text-ink-dim sm:inline">{session.username}</span>
                  <button
                    id="header-logout-btn"
                    onClick={logout}
                    className="sidebar-logout-btn"
                    title="Sign out"
                    aria-label="Sign out"
                  >
                    {/* Logout icon */}
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                  </button>
                </div>
              </>
            )}
          </nav>
        </div>
        {/* Dimension rule under the titleblock */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
      </header>

      <div className="mx-auto flex max-w-7xl gap-4 px-4">
        <SidebarTree />
        <main className="min-w-0 flex-1 px-2 py-8">{children}</main>
      </div>
    </div>
  );
}

