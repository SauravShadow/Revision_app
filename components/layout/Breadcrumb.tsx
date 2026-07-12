import Link from 'next/link';

export function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="tblabel flex flex-wrap items-center gap-2">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-2">
          {it.href
            ? <Link href={it.href} className="transition-colors hover:text-accent">{it.label}</Link>
            : <span className="text-ink">{it.label}</span>}
          {i < items.length - 1 && <span className="text-line-strong">/</span>}
        </span>
      ))}
    </nav>
  );
}
