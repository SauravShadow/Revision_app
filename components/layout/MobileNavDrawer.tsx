'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { NavTree } from './NavTree';
import { ThemeToggle } from './ThemeToggle';
import { useAuth } from '@/components/AuthProvider';
import { DOMAIN_LABELS } from '@/lib/auth/types';

export function MobileNavDrawer() {
  const [open, setOpen] = useState(false);
  const { session, logout } = useAuth();
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
        className="rounded-md border border-line p-3 text-ink-dim transition hover:border-line-strong hover:text-ink md:hidden">
        <Menu size={18} />
      </button>
      {open && (
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

            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Link href="/filtered" onClick={close} className="tblabel rounded px-2 py-1 transition hover:bg-panel hover:text-ink">Filtered</Link>
              <Link href="/bookmarks" onClick={close} className="tblabel rounded px-2 py-1 transition hover:bg-panel hover:text-ink">Bookmarks</Link>
              <Link href="/archive" onClick={close} className="tblabel rounded px-2 py-1 transition hover:bg-panel hover:text-ink">Archive</Link>
            </div>

            {session && (
              <div className="mb-3 flex items-center justify-between border-b border-line pb-3">
                <div>
                  <div className="text-xs text-ink-dim">{session.username}</div>
                  <div className="tblabel text-[0.58rem]">{DOMAIN_LABELS[session.domain] ?? session.domain}</div>
                </div>
                <div className="flex items-center gap-2">
                  <ThemeToggle />
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
        </div>
      )}
    </>
  );
}
