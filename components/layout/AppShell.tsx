import Link from 'next/link';
import { ThemeToggle } from './ThemeToggle';
import { SidebarTree } from './SidebarTree';
import { HeaderControls } from './HeaderControls';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-black/20 px-6 py-4 backdrop-blur">
        <Link href="/" className="text-lg font-semibold tracking-tight">CE Revision</Link>
        <div className="flex items-center gap-3">
          <HeaderControls />
          <Link href="/archive" className="text-sm opacity-70 transition hover:opacity-100">Archive</Link>
          <ThemeToggle />
        </div>
      </header>
      <div className="mx-auto flex max-w-7xl gap-4 px-4">
        <SidebarTree />
        <main className="min-w-0 flex-1 px-2 py-8">{children}</main>
      </div>
    </div>
  );
}
