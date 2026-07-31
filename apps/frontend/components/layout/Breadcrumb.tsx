import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

export function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  // Deepest navigable ancestor: the chapter on a topic page, the subject on a
  // chapter page.
  const parent = [...items].reverse().find((it) => it.href);

  return (
    <>
      {/* Phones get a single back affordance — the full trail wraps to three
          lines of 10px mono there and pushes the page title below the fold. */}
      {parent?.href && (
        <nav className="sm:hidden">
          <Link
            href={parent.href}
            className="tblabel -ml-1 inline-flex min-h-11 max-w-full items-center gap-1 rounded px-1 transition hover:text-accent active:text-accent"
          >
            <ChevronLeft size={14} className="shrink-0" />
            <span className="truncate">{parent.label}</span>
          </Link>
        </nav>
      )}

      <nav className="tblabel hidden flex-wrap items-center gap-2 sm:flex">
        {items.map((it, i) => (
          <span key={i} className="flex items-center gap-2">
            {it.href
              ? <Link href={it.href} className="transition-colors hover:text-accent">{it.label}</Link>
              : <span className="text-ink">{it.label}</span>}
            {i < items.length - 1 && <span className="text-line-strong">/</span>}
          </span>
        ))}
      </nav>
    </>
  );
}
