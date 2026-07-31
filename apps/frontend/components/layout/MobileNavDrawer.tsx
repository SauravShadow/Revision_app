'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { NavTree } from './NavTree';
import { visibleSectionLinks } from './navLinks';
import { useAuth } from '@/components/AuthProvider';
import { useMemberships } from '@/lib/orgs/useMemberships';
import { DOMAIN_LABELS } from '@revision-app/shared';

export function MobileNavDrawer() {
  const [open, setOpen] = useState(false);
  const { session, logout } = useAuth();
  const { isCoach } = useMemberships();
  // Null outside an app-router context (component tests render it bare).
  const pathname = usePathname() ?? '';
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Open menu"
        className="rounded-md border border-line p-3 text-ink-dim transition hover:border-line-strong hover:text-ink active:bg-panel-2 active:text-ink md:hidden">
        <Menu size={18} />
      </button>
      {/* Portalled to <body>: this component renders inside the header, whose
          backdrop-blur makes it a containing block for fixed descendants — the
          drawer was being clipped to the header's ~69px strip. */}
      {open && createPortal(
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-ground-deep/70 backdrop-blur-sm" onClick={close} data-testid="mobile-nav-backdrop" />
          <motion.aside
            initial={{ x: '-100%' }} animate={{ x: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="absolute inset-y-0 left-0 z-50 flex w-72 flex-col overflow-y-auto border-r border-line-strong bg-ground-deep p-3 text-sm"
          >
            <div className="mb-3 flex items-center justify-between border-b border-line pb-2">
              <span className="tblabel">Navigator</span>
              <button onClick={close} aria-label="Close menu" className="text-ink-faint transition hover:text-accent"><X size={16} /></button>
            </div>

            {/* Full-width icon rows: as wrapped chips these were the smallest
                touch targets in the app and read as decoration, not navigation. */}
            <nav className="mb-3 flex flex-col gap-0.5 border-b border-line pb-3">
              {visibleSectionLinks(isCoach).map(({ href, label, Icon }) => {
                const active = pathname.startsWith(href);
                return (
                  <Link key={href} href={href} onClick={close}
                    aria-current={active ? 'page' : undefined}
                    className={`tblabel flex min-h-11 items-center gap-3 rounded-lg px-3 transition active:bg-panel-2 ${
                      active ? 'bg-accent-soft text-accent' : 'hover:bg-panel hover:text-ink'
                    }`}>
                    <Icon size={16} className={`shrink-0 ${active ? 'text-accent' : 'text-ink-faint'}`} /> {label}
                  </Link>
                );
              })}
            </nav>

            {session && (
              <div className="mb-3 flex items-center justify-between border-b border-line pb-3">
                <div>
                  <div className="text-xs text-ink-dim">{session.username}</div>
                  <div className="tblabel text-[0.58rem]">{DOMAIN_LABELS[session.domain] ?? session.domain}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => { close(); logout(); }} className="sidebar-logout-btn" title="Sign out" aria-label="Sign out">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                  </button>
                </div>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto">
              <NavTree onNavigate={close} />
            </div>
          </motion.aside>
        </div>,
        document.body,
      )}
    </>
  );
}
