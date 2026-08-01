'use client';

// A pending-content placeholder. Purely decorative — aria-hidden so screen
// readers announce the real content when it arrives instead of a row of boxes.
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton rounded-md ${className}`} />;
}
