import type { AppData } from '@/lib/domain/types';
import type { RevisionRepository } from './RevisionRepository';
import { authFetch } from '@/lib/auth/client';

export const DATA_ENDPOINT = '/api/data';

// Client-side repository backed by the server route (server-side persistence).
// Failures degrade gracefully: load() -> null (store seeds).
export class ApiRepository implements RevisionRepository {
  async load(): Promise<AppData | null> {
    try {
      const res = await authFetch(DATA_ENDPOINT, { cache: 'no-store' });
      if (!res.ok) return null;
      const data = (await res.json()) as AppData | null;
      return data ?? null;
    } catch {
      return null;
    }
  }

  async save(data: AppData, opts: { keepalive?: boolean } = {}): Promise<void> {
    const res = await authFetch(DATA_ENDPOINT, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
      keepalive: opts.keepalive ?? false,
    });
    if (!res.ok) throw new Error(`save failed: ${res.status}`);
  }
}
