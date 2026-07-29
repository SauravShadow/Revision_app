export type Difficulty = 'Easy' | 'Medium' | 'Hard';
export type Priority = 'Low' | 'Medium' | 'High';

export interface Revision {
  id: string;
  timestamp: number; // epoch ms
}

export interface Subject {
  id: string;
  name: string;
  color: string;
  icon: string;
  order: number;
  chapterIds: string[];
  archivedAt?: number;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  icon: string;
  description?: string;
  order: number;
}

export interface Chapter {
  id: string;
  subjectId: string;
  name: string;
  order: number;
  difficulty: Difficulty;
  priority: Priority;
  topicIds: string[];
  archivedAt?: number;
}

export type AttachmentKind = 'image' | 'pdf' | 'link' | 'video';

export interface Attachment {
  id: string;
  name: string;
  kind: AttachmentKind;
  url: string;        // '/api/files/<id>' for uploads; external URL otherwise
  mime?: string;
  size?: number;
  createdAt: number;
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  createdAt: number;
}

export interface Topic {
  id: string;
  chapterId: string;
  title: string;
  notes: string; // markdown
  order: number;
  difficulty: Difficulty;
  priority: Priority;
  revisionHistory: Revision[];
  // Manual-first scheduling: number = user-planned due date (local start-of-day
  // epoch ms), null = deliberately unplanned, undefined = legacy snapshot
  // (backfilled from the ladder at the load boundary).
  plannedAt?: number | null;
  createdAt: number;
  updatedAt: number;
  archivedAt?: number;
  attachments?: Attachment[];
  flashcards?: Flashcard[];
  bookmarkedAt?: number;
  tagIds?: string[];
}

export interface AppData {
  subjects: Record<string, Subject>;
  chapters: Record<string, Chapter>;
  topics: Record<string, Topic>;
  subjectOrder: string[];
  tags: Record<string, Tag>;
  tagOrder: string[];
}
