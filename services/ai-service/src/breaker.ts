/**
 * Stops hammering a rate-limited provider. One 429 opens the breaker for a
 * cool-off window; while open, requests are refused locally without a
 * provider call. It closes itself when the window elapses — there is nothing
 * to reset by hand.
 *
 * Deliberately in-process: a single ai-service container is the whole
 * deployment, and a shared-state breaker would need a round trip to check,
 * which defeats the point.
 */
export const COOL_OFF_MS = 60_000;

let openUntil = 0;

export function isOpen(now: number = Date.now()): boolean {
  return now < openUntil;
}

export function trip(now: number = Date.now()): void {
  openUntil = now + COOL_OFF_MS;
}

export function reset(): void {
  openUntil = 0;
}
