import { Filter, BarChart3, Users, CalendarDays, Star, Archive, type LucideIcon } from 'lucide-react';

// The app's section links, shared by every nav surface so they can't drift:
// header (lg and up), sidebar (md–lg), mobile drawer (below md).
export interface SectionLink {
  href: string;
  label: string;
  Icon: LucideIcon;
  coachOnly?: boolean;
}

export const SECTION_LINKS: SectionLink[] = [
  { href: '/filtered', label: 'Filtered', Icon: Filter },
  { href: '/insights', label: 'Insights', Icon: BarChart3 },
  { href: '/coaching', label: 'Coaching', Icon: Users, coachOnly: true },
  { href: '/calendar', label: 'Calendar', Icon: CalendarDays },
  { href: '/bookmarks', label: 'Bookmarks', Icon: Star },
  { href: '/archive', label: 'Archive', Icon: Archive },
];

export const visibleSectionLinks = (isCoach: boolean) =>
  SECTION_LINKS.filter((l) => !l.coachOnly || isCoach);
