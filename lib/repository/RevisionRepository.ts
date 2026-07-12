import type { AppData } from '@/lib/domain/types';

export interface RevisionRepository {
  load(): Promise<AppData | null>;
  save(data: AppData): Promise<void>;
}
