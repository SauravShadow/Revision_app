'use client';
import { useStore } from '@/store/useStore';
import { useFilters } from '@/store/useFilters';
import { matchingTopics, hasActiveFilters } from '@/lib/filters/predicates';
import { FilterBar } from '@/components/FilterBar';
import { TopicResultRow } from '@/components/TopicResultRow';
import { Breadcrumb } from '@/components/layout/Breadcrumb';

export default function FilteredPage() {
  const data = useStore();
  const { tagIds, statuses } = useFilters();
  const filters = { tagIds, statuses };
  const results = hasActiveFilters(filters) ? matchingTopics(data, filters, Date.now()) : [];
  return (
    <div>
      <Breadcrumb items={[{ label: 'Subjects', href: '/' }, { label: 'Filtered' }]} />
      <h1 className="mb-4 mt-4 text-2xl font-bold">Filtered Topics</h1>
      <FilterBar />
      {!hasActiveFilters(filters) ? (
        <p className="text-sm opacity-50">Pick a status or tag above to filter topics across all subjects.</p>
      ) : results.length === 0 ? (
        <p className="text-sm opacity-50">No topics match the selected filters.</p>
      ) : (
        <div className="grid gap-3">
          {results.map(({ topic, subject, chapter }) => (
            <TopicResultRow key={topic.id} topic={topic} subject={subject} chapter={chapter} />
          ))}
        </div>
      )}
    </div>
  );
}
