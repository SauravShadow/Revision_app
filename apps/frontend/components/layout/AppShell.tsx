'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Settings } from 'lucide-react';
import { SidebarTree } from './SidebarTree';
import { HeaderControls } from './HeaderControls';
import { MobileNavDrawer } from './MobileNavDrawer';
import { BottomTabBar } from './BottomTabBar';
import { CommandPalette } from '@/components/CommandPalette';
import { useAuth } from '@/components/AuthProvider';
import { useMemberships } from '@/lib/orgs/useMemberships';
import { DOMAIN_LABELS } from '@revision-app/shared';

const AUTH_PATHS = ['/login', '/register'];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { session, loading, logout } = useAuth();
  const { isCoach } = useMemberships();

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
              {/* Brand mark */}
              <Image
                src="/logo-icon-original.png"
                alt="RevisionWorks"
                width={28}
                height={28}
                priority
                className="h-7 w-7 rounded-full"
              />
              <span className="flex flex-col leading-none">
                <span className="text-sm tracking-tight text-ink">
                  Revision<span className="font-semibold">Works</span>
                </span>
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
            <Link href="/insights" className="tblabel hidden rounded px-2 py-1 transition hover:bg-panel hover:text-ink sm:block">Insights</Link>
            {isCoach && (
              <Link href="/coaching" className="tblabel hidden rounded px-2 py-1 transition hover:bg-panel hover:text-ink sm:block">Coaching</Link>
            )}
            <Link href="/calendar" className="tblabel hidden rounded px-2 py-1 transition hover:bg-panel hover:text-ink sm:block">Calendar</Link>
            <Link href="/bookmarks" className="tblabel hidden rounded px-2 py-1 transition hover:bg-panel hover:text-ink sm:block">Bookmarks</Link>
            <Link href="/archive" className="tblabel hidden rounded px-2 py-1 transition hover:bg-panel hover:text-ink sm:block">Archive</Link>
            {session && (
              <>
                <span className="mx-1 hidden h-5 w-px bg-line sm:block" />
                <div className="flex items-center gap-2">
                  <span className="hidden text-xs text-ink-dim sm:inline">{session.username}</span>
                  <Link
                    href="/settings"
                    title="Settings"
                    aria-label="Settings"
                    className="grid place-items-center rounded-md p-2 text-ink-dim transition hover:bg-panel hover:text-accent"
                  >
                    <Settings size={16} />
                  </Link>
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

      <div className="flex gap-4 px-4 sm:px-6 lg:px-8">
        <SidebarTree />
        <main className="min-w-0 flex-1 px-2 pt-8 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-8">
          {children}
        </main>
      </div>

      {/* Mobile primary nav — hidden from md up */}
      <BottomTabBar />
    </div>
  );
}

