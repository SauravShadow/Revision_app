import { create } from 'zustand';
import type { StatusFilter } from '@/lib/filters/predicates';

interface FilterState {
  tagIds: string[];
  statuses: StatusFilter[];
  query: string;
  toggleTag: (id: string) => void;
  toggleStatus: (s: StatusFilter) => void;
  setQuery: (q: string) => void;
  clear: () => void;
}

const toggle = <T>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export const useFilters = create<FilterState>((set) => ({
  tagIds: [],
  statuses: [],
  query: '',
  toggleTag: (id) => set((s) => ({ tagIds: toggle(s.tagIds, id) })),
  toggleStatus: (st) => set((s) => ({ statuses: toggle(s.statuses, st) })),
  setQuery: (q) => set({ query: q }),
  clear: () => set({ tagIds: [], statuses: [], query: '' }),
}));
