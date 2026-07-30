'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, BarChart3, CalendarDays, Search, Users } from 'lucide-react';
import { useMemberships } from '@/lib/orgs/useMemberships';

// Mobile primary navigation (Phase 3). Fixed to the bottom, safe-area padded,
// hidden from md up (the header nav takes over on wider screens). Coaching is
// role-gated; Search opens the command palette via a decoupled window event.
// min-w-0 matters: with the coach role there are five tabs, and the labels'
// intrinsic width alone fills a 390px screen — without it the bar widens the
// whole document rather than letting the labels ellipsize.
const tabClass = (active: boolean) =>
  `flex min-w-0 flex-1 flex-col items-center gap-1 px-1 py-2.5 transition-colors active:bg-panel-2 ${
    active ? 'text-accent' : 'text-ink-faint hover:text-ink-dim active:text-ink-dim'
  }`;

export function BottomTabBar() {
  const pathname = usePathname();
  const { isCoach } = useMemberships();
  const active = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  const links = [
    { href: '/', label: 'Subjects', Icon: LayoutGrid },
    { href: '/insights', label: 'Insights', Icon: BarChart3 },
    { href: '/calendar', label: 'Calendar', Icon: CalendarDays },
    ...(isCoach ? [{ href: '/coaching', label: 'Coaching', Icon: Users }] : []),
  ];

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line-strong bg-ground-deep/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      <div className="flex items-stretch">
        {links.map(({ href, label, Icon }) => {
          const isActive = active(href);
          return (
            <Link key={href} href={href} aria-current={isActive ? 'page' : undefined} className={tabClass(isActive)}>
              <Icon size={20} strokeWidth={isActive ? 2.4 : 1.8} />
              <span className="tblabel w-full truncate text-center text-[0.58rem]">{label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          aria-label="Search"
          onClick={() => window.dispatchEvent(new Event('open-command-palette'))}
          className={tabClass(false)}
        >
          <Search size={20} strokeWidth={1.8} />
          <span className="tblabel text-[0.58rem]">Search</span>
        </button>
      </div>
    </nav>
  );
}
