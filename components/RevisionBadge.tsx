import type { BadgeState } from '@/lib/revision/engine';

const LABELS: Record<BadgeState, string> = {
  NeverRevised: 'NEW', Overdue: 'OVERDUE', DueToday: 'DUE TODAY',
  DueTomorrow: 'DUE +1D', RecentlyRevised: 'REVISED', Upcoming: 'UPCOMING',
};
// Blueprint annotation tags — mono, uppercase, redline colour-coded.
const COLORS: Record<BadgeState, string> = {
  NeverRevised: 'border-line text-ink-dim',
  Overdue: 'border-alarm/50 text-alarm bg-alarm/10',
  DueToday: 'border-annotation/50 text-annotation bg-annotation/10',
  DueTomorrow: 'border-accent/50 text-accent bg-accent/10',
  RecentlyRevised: 'border-go/50 text-go bg-go/10',
  Upcoming: 'border-line text-ink-faint',
};

export function RevisionBadge({ state }: { state: BadgeState }) {
  return (
    <span className={`dim-chip inline-flex items-center gap-1 font-medium ${COLORS[state]}`}>
      <span className="h-1 w-1 rounded-full bg-current" />
      {LABELS[state]}
    </span>
  );
}
