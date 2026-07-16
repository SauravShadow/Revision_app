export function StatTile({ label, value, caption }: { label: string; value: string | number; caption?: string }) {
  return (
    <div className="glass rounded-xl p-4">
      <div className="tblabel mb-1.5">{label}</div>
      <div className="text-2xl font-semibold tracking-tight text-ink">{value}</div>
      {caption && <div className="mt-0.5 text-xs opacity-50">{caption}</div>}
    </div>
  );
}
