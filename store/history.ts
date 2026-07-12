export const MAX_HISTORY = 100;

export interface History<T> {
  past: T[];
  future: T[];
}

export function emptyHistory<T>(): History<T> {
  return { past: [], future: [] };
}

export function record<T>(h: History<T>, prev: T): History<T> {
  const past = [...h.past, prev].slice(-MAX_HISTORY);
  return { past, future: [] };
}

export function undo<T>(h: History<T>, present: T): { history: History<T>; present: T } | null {
  if (h.past.length === 0) return null;
  const prev = h.past[h.past.length - 1];
  return { history: { past: h.past.slice(0, -1), future: [present, ...h.future] }, present: prev };
}

export function redo<T>(h: History<T>, present: T): { history: History<T>; present: T } | null {
  if (h.future.length === 0) return null;
  const next = h.future[0];
  return { history: { past: [...h.past, present], future: h.future.slice(1) }, present: next };
}
