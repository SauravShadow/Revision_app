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
}

export interface Chapter {
  id: string;
  subjectId: string;
  name: string;
  order: number;
  difficulty: Difficulty;
  priority: Priority;
  topicIds: string[];
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
  createdAt: number;
  updatedAt: number;
}

export interface AppData {
  subjects: Record<string, Subject>;
  chapters: Record<string, Chapter>;
  topics: Record<string, Topic>;
  subjectOrder: string[];
}
