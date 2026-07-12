import type { AppData } from '@/lib/domain/types';
import type { RevisionRepository } from './RevisionRepository';

export const DATA_ENDPOINT = '/api/data';

// Client-side repository backed by the server route (server-side persistence).
// Failures degrade gracefully: load() -> null (store seeds), save() -> logged
// and swallowed so a transient network blip never crashes the UI.
export class ApiRepository implements RevisionRepository {
  async load(): Promise<AppData | null> {
    try {
      const res = await fetch(DATA_ENDPOINT, { cache: 'no-store' });
      if (!res.ok) return null;
      const data = (await res.json()) as AppData | null;
      return data ?? null;
    } catch {
      return null;
    }
  }

  async save(data: AppData): Promise<void> {
    try {
      await fetch(DATA_ENDPOINT, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data),
      });
    } catch (err) {
      console.error('Failed to persist data to server', err);
    }
  }
}
