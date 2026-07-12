import type { BadgeState } from '@/lib/revision/engine';

const LABELS: Record<BadgeState, string> = {
  NeverRevised: 'Never Revised', Overdue: 'Overdue', DueToday: 'Due Today',
  DueTomorrow: 'Due Tomorrow', RecentlyRevised: 'Recently Revised', Upcoming: 'Upcoming',
};
const COLORS: Record<BadgeState, string> = {
  NeverRevised: 'bg-white/10 text-white/70', Overdue: 'bg-red-500/20 text-red-300',
  DueToday: 'bg-amber-500/20 text-amber-300', DueTomorrow: 'bg-sky-500/20 text-sky-300',
  RecentlyRevised: 'bg-emerald-500/20 text-emerald-300', Upcoming: 'bg-white/10 text-white/60',
};

export function RevisionBadge({ state }: { state: BadgeState }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${COLORS[state]}`}>{LABELS[state]}</span>;
}
