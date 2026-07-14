export const LADDER: readonly number[] = [1, 3, 7, 16, 35, 60, 90];

export function nextInterval(revisionCount: number): number {
  if (revisionCount <= 0) return LADDER[0];
  const idx = Math.min(revisionCount - 1, LADDER.length - 1);
  return LADDER[idx];
}
