import { create } from 'zustand';
import type { QuickFilter } from '@/lib/filters/quickFilters';

// Per-list quick-filter selection (Phase 1). Keyed so the home subject list,
// each chapter, and each topic list remember their own chip within a session.
interface QuickFilterState {
  byList: Record<string, QuickFilter>;
  get: (key: string) => QuickFilter;
  set: (key: string, value: QuickFilter) => void;
  reset: () => void;
}

export const useQuickFilter = create<QuickFilterState>((set, get) => ({
  byList: {},
  get: (key) => get().byList[key] ?? 'all',
  set: (key, value) => set((s) => ({ byList: { ...s.byList, [key]: value } })),
  reset: () => set({ byList: {} }),
}));
