'use client';
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import type { AppData } from '@revision-app/shared';
import { useStore } from '@/store/useStore';
import { useQuickFilter } from '@/store/useQuickFilter';
import { SubjectCard } from '@/components/cards/SubjectCard';
import { AddButton } from '@/components/AddButton';
import { SortableRow } from '@/components/dnd/SortableRow';
import { dragId } from '@/components/dnd/ids';
import { FilterChips } from '@/components/filters/FilterChips';
import { InlineSearch } from '@/components/filters/InlineSearch';
import { TodayQueue } from '@/components/TodayQueue';
import { SubjectGridSkeleton } from '@/components/ui/RouteSkeletons';
import { EmptyState } from '@/components/ui/EmptyState';
import { StreakCard } from '@/components/StreakCard';
import { subjectMatchesQuery } from '@/lib/search/search';
import {
  QUICK_FILTERS,
  QUICK_FILTER_LABELS,
  subjectMatchesQuick,
  type QuickFilter,
} from '@/lib/filters/quickFilters';

const LIST_KEY = 'home';

export default function DashboardPage() {
  const subjectOrder = useStore((s) => s.subjectOrder);
  const subjects = useStore((s) => s.subjects);
  const chapters = useStore((s) => s.chapters);
  const topics = useStore((s) => s.topics);
  const addSubject = useStore((s) => s.addSubject);
  const filter = useQuickFilter((s) => s.byList[LIST_KEY] ?? 'all');
  const setFilter = useQuickFilter((s) => s.set);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const hydrated = useStore((s) => s.hydrated);

  const now = Date.now();
  const data = useMemo(
    () => ({ subjects, chapters, topics }) as unknown as AppData,
    [subjects, chapters, topics],
  );

  // Chip counts reflect the current search, so they always match what's shown.
  const counts = useMemo(() => {
    const c = Object.fromEntries(QUICK_FILTERS.map((k) => [k, 0])) as Record<QuickFilter, number>;
    for (const id of subjectOrder) {
      if (!subjectMatchesQuery(data, id, query)) continue;
      for (const qf of QUICK_FILTERS) if (subjectMatchesQuick(data, id, qf, now)) c[qf] += 1;
    }
    return c;
  }, [subjectOrder, data, query, now]);

  const visibleIds = useMemo(
    () =>
      subjectOrder.filter(
        (id) => subjectMatchesQuick(data, id, filter, now) && subjectMatchesQuery(data, id, query),
      ),
    [subjectOrder, data, filter, query, now],
  );

  const options = QUICK_FILTERS.map((k) => ({ key: k, label: QUICK_FILTER_LABELS[k], count: counts[k] }));

  return (
    <div>
      <div className="mb-4 flex items-end justify-between gap-4 md:mb-6">
        <div>
          <div className="tblabel mb-1.5">Index · Sheet 01</div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Subjects</h1>
        </div>
        <AddButton label="Subject" onAdd={(name) => setJustAddedId(addSubject(name))} />
      </div>

      <StreakCard />

      {/* Order flips by breakpoint rather than duplicating the DOM: a phone
          session is a 30-second "what's due now" check, so the queue leads
          there; desktop keeps the subjects-first layout. */}
      <div className="flex flex-col">
        <div className="order-2 md:order-1">
          {/* Search and chips filter the subject grid, so they travel with it.
              Sitting above the flex container they pushed the queue — the thing
              a phone session actually opens for — halfway down the screen, and
              sat nowhere near the list they control. */}
          <InlineSearch onChange={setQuery} placeholder="Search subjects, chapters, topics…" />

          <FilterChips
            options={options}
            value={filter}
            onChange={(k) => setFilter(LIST_KEY, k as QuickFilter)}
            aria-label="Filter subjects"
          />

          {!hydrated ? (
            <SubjectGridSkeleton />
          ) : visibleIds.length === 0 ? (
            <EmptyState
              title={query.trim()
                ? `No subjects match “${query.trim()}”.`
                : `No subjects with ${QUICK_FILTER_LABELS[filter].toLowerCase()} topics.`}
              hint="Try a different filter, or add a subject."
            />
          ) : (
            <SortableContext items={visibleIds.map((id) => dragId('subject', id))} strategy={rectSortingStrategy}>
              <motion.div layout className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {visibleIds.map((id) => (
                  <SortableRow key={id} id={dragId('subject', id)}>
                    <SubjectCard subject={subjects[id]} autoEdit={id === justAddedId} />
                  </SortableRow>
                ))}
              </motion.div>
            </SortableContext>
          )}
        </div>

        <div className="order-1 mb-8 md:order-2 md:mb-0 md:mt-10">
          <TodayQueue />
        </div>
      </div>
    </div>
  );
}
