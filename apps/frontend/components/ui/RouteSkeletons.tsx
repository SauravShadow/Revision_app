'use client';
import { Skeleton } from './Skeleton';

/** Home: the subject card grid. */
export function SubjectGridSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="glass flex items-center gap-3 rounded-xl p-4">
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="mt-2 h-2 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Chapter and subject pages: a hairline row list. */
export function ListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="divide-y divide-line">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-3 px-3 py-3">
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="mt-2 h-3 w-24" />
          </div>
          <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** Topic page and insights: a title plus stacked panels. */
export function DetailSkeleton() {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <Skeleton className="h-3 w-48" />
      <Skeleton className="mt-4 h-8 w-2/3" />
      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_320px]">
        <Skeleton className="h-64 w-full rounded-xl" />
        <div className="space-y-4">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
