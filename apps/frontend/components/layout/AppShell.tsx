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
import { SECTION_LINKS } from './navLinks';
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
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
            <MobileNavDrawer />
            <Link href="/" className="touch-target group flex min-w-0 items-center gap-3">
              {/* Brand mark */}
              <Image
                src="/logo-icon-original.png"
                alt="RevisionWorks"
                width={28}
                height={28}
                priority
                className="h-7 w-7 shrink-0 rounded-full"
              />
              {/* Phones have no room for the wordmark beside the controls — the mark
                  carries the brand there, and the drawer already shows the domain. */}
              <span className="hidden min-w-0 flex-col leading-none sm:flex">
                <span className="truncate text-sm tracking-tight text-ink">
                  Revision<span className="font-semibold">Works</span>
                </span>
                <span className="tblabel mt-0.5 truncate text-[0.58rem]">
                  {session ? DOMAIN_LABELS[session.domain] ?? session.domain : 'Loading…'}
                </span>
              </span>
            </Link>
          </div>

          <nav className="flex shrink-0 items-center gap-2">
            <CommandPalette />
            <HeaderControls />
            {/* The full link row measures ~813px, so it only fits from lg up —
                revealing it at sm made every layout 640–1023px wide overflow the
                screen (landscape phones read as a zoomed-out desktop). Below lg
                these links live in the sidebar (md–lg) or the drawer (< md). */}
            <span className="mx-1 hidden h-5 w-px bg-line lg:block" />
            {SECTION_LINKS.filter((l) => !l.coachOnly || isCoach).map(({ href, label }) => (
              <Link key={href} href={href} className="tblabel hidden rounded px-2 py-1 transition hover:bg-panel hover:text-ink lg:block">{label}</Link>
            ))}
            {session && (
              <>
                <span className="mx-1 hidden h-5 w-px bg-line lg:block" />
                <div className="flex items-center gap-2">
                  <span className="hidden text-xs text-ink-dim lg:inline">{session.username}</span>
                  <Link
                    href="/settings"
                    title="Settings"
                    aria-label="Settings"
                    className="touch-target grid place-items-center rounded-md p-3 text-ink-dim transition hover:bg-panel hover:text-accent active:bg-panel-2 active:text-accent md:p-2"
                  >
                    <Settings size={16} />
                  </Link>
                  <button
                    id="header-logout-btn"
                    onClick={logout}
                    className="sidebar-logout-btn touch-target"
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

