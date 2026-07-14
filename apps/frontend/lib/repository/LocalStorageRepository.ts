import type { AppData } from '@/lib/domain/types';
import type { RevisionRepository } from './RevisionRepository';

export const STORAGE_KEY = 'ce-revision:v1';

export class LocalStorageRepository implements RevisionRepository {
  async load(): Promise<AppData | null> {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AppData;
    } catch {
      return null;
    }
  }

  async save(data: AppData): Promise<void> {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }
}
