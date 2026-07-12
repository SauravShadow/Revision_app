import Link from 'next/link';
import { ThemeToggle } from './ThemeToggle';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-black/20 px-6 py-4 backdrop-blur">
        <Link href="/" className="text-lg font-semibold tracking-tight">CE Revision</Link>
        <div className="flex items-center gap-3">
          <Link href="/archive" className="text-sm opacity-70 transition hover:opacity-100">Archive</Link>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
