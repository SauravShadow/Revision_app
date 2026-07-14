import { z } from 'zod';

const revisionSchema = z.object({ id: z.string(), timestamp: z.number() });
const attachmentSchema = z.object({
  id: z.string(), name: z.string(), kind: z.enum(['image', 'pdf', 'link', 'video']),
  url: z.string(), mime: z.string().optional(), size: z.number().optional(), createdAt: z.number(),
});
const flashcardSchema = z.object({ id: z.string(), front: z.string(), back: z.string(), createdAt: z.number() });
const topicSchema = z.object({
  id: z.string(), chapterId: z.string(), title: z.string(), notes: z.string(), order: z.number(),
  difficulty: z.enum(['Easy', 'Medium', 'Hard']), priority: z.enum(['Low', 'Medium', 'High']),
  revisionHistory: z.array(revisionSchema), createdAt: z.number(), updatedAt: z.number(),
  archivedAt: z.number().optional(), attachments: z.array(attachmentSchema).optional(),
  flashcards: z.array(flashcardSchema).optional(), bookmarkedAt: z.number().optional(),
  tagIds: z.array(z.string()).optional(),
});
const chapterSchema = z.object({
  id: z.string(), subjectId: z.string(), name: z.string(), order: z.number(),
  difficulty: z.enum(['Easy', 'Medium', 'Hard']), priority: z.enum(['Low', 'Medium', 'High']),
  topicIds: z.array(z.string()), archivedAt: z.number().optional(),
});
const subjectSchema = z.object({
  id: z.string(), name: z.string(), color: z.string(), icon: z.string(), order: z.number(),
  chapterIds: z.array(z.string()), archivedAt: z.number().optional(),
});
const tagSchema = z.object({
  id: z.string(), name: z.string(), color: z.string(), icon: z.string(),
  description: z.string().optional(), order: z.number(),
});

export const appDataSchema = z.object({
  subjects: z.record(z.string(), subjectSchema),
  chapters: z.record(z.string(), chapterSchema),
  topics: z.record(z.string(), topicSchema),
  subjectOrder: z.array(z.string()),
  tags: z.record(z.string(), tagSchema),
  tagOrder: z.array(z.string()),
});
