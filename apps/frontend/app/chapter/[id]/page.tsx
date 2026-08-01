'use client';
import { use, useState } from 'react';
import { notFound } from 'next/navigation';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useStore } from '@/store/useStore';
import { TopicCard } from '@/components/cards/TopicCard';
import { AddButton } from '@/components/AddButton';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { SortableRow } from '@/components/dnd/SortableRow';
import { dragId } from '@/components/dnd/ids';
import { useFilters } from '@/store/useFilters';
import { matchingTopics, hasActiveFilters } from '@/lib/filters/predicates';
import { pinnedFirst } from '@/lib/revision/pinned';
import { FilterBar } from '@/components/FilterBar';
import { TopicResultRow } from '@/components/TopicResultRow';
import { ListSkeleton } from '@/components/ui/RouteSkeletons';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterChips } from '@/components/filters/FilterChips';
import { InlineSearch } from '@/components/filters/InlineSearch';
import { useQuickFilter } from '@/store/useQuickFilter';
import {
  QUICK_FILTERS,
  QUICK_FILTER_LABELS,
  topicMatchesQuick,
  topicQuickCounts,
  type QuickFilter,
} from '@/lib/filters/quickFilters';
import { matchesQuery } from '@/lib/search/search';

export default function ChapterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const chapter = useStore((s) => s.chapters[id]);
  const topics = useStore((s) => s.topics);
  const subjects = useStore((s) => s.subjects);
  const addTopic = useStore((s) => s.addTopic);
  const data = useStore();
  const { tagIds, statuses } = useFilters();
  const filters = { tagIds, statuses };
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const listKey = `chapter:${id}`;
  const quick = useQuickFilter((s) => s.byList[listKey] ?? 'all');
  const setQuick = useQuickFilter((s) => s.set);
  const hydrated = useStore((s) => s.hydrated);
  // A missing record before hydration means "not loaded yet", not "gone" —
  // without this guard a deep link 404s while the store is still loading.
  if (!hydrated) return <ListSkeleton />;
  if (!chapter) return notFound();
  const subject = subjects[chapter.subjectId];
  // Bookmarked / high-priority topics float to the top (Phase 6). Display-only —
  // drag-reorder still persists the raw topicIds order by id.
  const orderedTopicIds = pinnedFirst(
    chapter.topicIds.filter((tid) => topics[tid] && !topics[tid].archivedAt),
    topics,
  );
  const now = Date.now();
  // Chips and FilterBar are complementary, not redundant: chips are
  // single-select quick states, FilterBar is the multi-axis advanced filter.
  const visibleTopicIds = orderedTopicIds.filter((tid) => {
    const t = topics[tid];
    if (!topicMatchesQuick(t, quick, now)) return false;
    return query.trim() === '' || matchesQuery(t.title, query);
  });
  const counts = topicQuickCounts(orderedTopicIds.map((tid) => topics[tid]), now);
  return (
    <div>
      <Breadcrumb items={[
        { label: 'Subjects', href: '/' },
        ...(subject ? [{ label: subject.name, href: `/subject/${subject.id}` }] : []),
        { label: chapter.name },
      ]} />
      <div className="mb-6 mt-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{chapter.name}</h1>
        <AddButton label="Topic" onAdd={(title) => setJustAddedId(addTopic(id, title))} />
      </div>
      <InlineSearch onChange={setQuery} placeholder="Search topics…" />
      <FilterChips
        aria-label="Filter topics"
        value={quick}
        onChange={(k) => setQuick(listKey, k as QuickFilter)}
        options={QUICK_FILTERS.map((k) => ({ key: k, label: QUICK_FILTER_LABELS[k], count: counts[k] }))}
      />
      <FilterBar />
      {hasActiveFilters(filters) ? (
        <div className="grid gap-3">
          {matchingTopics(data, filters, Date.now(), { chapterId: id }).map(({ topic, subject: subj, chapter: ch }) => (
            <TopicResultRow key={topic.id} topic={topic} subject={subj} chapter={ch} />
          ))}
        </div>
      ) : visibleTopicIds.length === 0 ? (
        <EmptyState
          title={query.trim() ? `No topics match “${query.trim()}”.` : 'No topics match this filter.'}
          hint="Try a different filter, or clear the search."
        />
      ) : (
        <SortableContext
          items={visibleTopicIds.map((tid) => dragId('topic', tid))}
          strategy={verticalListSortingStrategy}
        >
          <div className="divide-y divide-line">
            {/* visibleTopicIds, not orderedTopicIds — the SortableContext items
                and the rendered rows must be the same list or drag indices
                point at rows the chips have filtered away. */}
            {visibleTopicIds.map((tid) => (
              <SortableRow key={tid} id={dragId('topic', tid)}>
                <TopicCard topic={topics[tid]} autoEdit={tid === justAddedId} />
              </SortableRow>
            ))}
          </div>
        </SortableContext>
      )}
    </div>
  );
}
