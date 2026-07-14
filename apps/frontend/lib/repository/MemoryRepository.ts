import type { AppData } from '@/lib/domain/types';
import type { RevisionRepository } from './RevisionRepository';

// In-memory repository for tests (and a template for future backends).
export class MemoryRepository implements RevisionRepository {
  private data: AppData | null = null;
  async load(): Promise<AppData | null> {
    return this.data;
  }
  async save(data: AppData): Promise<void> {
    this.data = data;
  }
}
