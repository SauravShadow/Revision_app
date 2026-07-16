import type { AppData, Topic } from '@revision-app/shared';

// A topic is "active" only if neither it, its chapter, nor its subject is archived.
// Archiving in this app is non-cascading, so parent archived-state must be checked explicitly.
export function activeTopics(data: AppData): Topic[] {
  const result: Topic[] = [];
  for (const topic of Object.values(data.topics)) {
    if (topic.archivedAt) continue;
    const chapter = data.chapters[topic.chapterId];
    if (!chapter || chapter.archivedAt) continue;
    const subject = data.subjects[chapter.subjectId];
    if (!subject || subject.archivedAt) continue;
    result.push(topic);
  }
  return result;
}
