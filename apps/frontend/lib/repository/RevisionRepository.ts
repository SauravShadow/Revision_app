import type { AppData } from '@revision-app/shared';

export interface RevisionRepository {
  load(): Promise<AppData | null>;
  // Throws on failure — callers own retry/UI. keepalive survives tab close.
  save(data: AppData, opts?: { keepalive?: boolean }): Promise<void>;
}
