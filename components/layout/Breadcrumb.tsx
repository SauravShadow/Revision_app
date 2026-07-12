import Link from 'next/link';

export function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="flex items-center gap-2 text-sm opacity-70">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-2">
          {it.href ? <Link href={it.href} className="hover:opacity-100">{it.label}</Link> : <span>{it.label}</span>}
          {i < items.length - 1 && <span className="opacity-40">/</span>}
        </span>
      ))}
    </nav>
  );
}
