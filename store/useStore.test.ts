import { describe, it, expect, beforeEach } from 'vitest';
import { useStore, createRevisionStore } from './useStore';
import { MemoryRepository } from '@/lib/repository/MemoryRepository';
import { seedData } from '@/lib/repository/seed';

function reset() {
  window.localStorage.clear();
  useStore.setState({ subjects: {}, chapters: {}, topics: {}, subjectOrder: [], tags: {}, tagOrder: [] });
}

describe('useStore', () => {
  beforeEach(reset);

  it('hydrate seeds 13 subjects on first run', async () => {
    await useStore.getState().hydrate();
    expect(useStore.getState().subjectOrder).toHaveLength(13);
  });

  it('adds a chapter under a subject', async () => {
    await useStore.getState().hydrate();
    const subjectId = useStore.getState().subjectOrder[0];
    const chapterId = useStore.getState().addChapter(subjectId, 'Flow through Pipes');
    const state = useStore.getState();
    expect(state.chapters[chapterId].name).toBe('Flow through Pipes');
    expect(state.subjects[subjectId].chapterIds).toContain(chapterId);
  });

  it('adds a topic and marks it revised', () => {
    const subjectId = useStore.getState().addSubject('S');
    const chapterId = useStore.getState().addChapter(subjectId, 'C');
    const topicId = useStore.getState().addTopic(chapterId, 'Bernoulli');
    useStore.getState().markTopicRevised(topicId);
    expect(useStore.getState().topics[topicId].revisionHistory).toHaveLength(1);
  });

  it('deleteChapter removes its topics and detaches from subject', () => {
    const subjectId = useStore.getState().addSubject('S');
    const chapterId = useStore.getState().addChapter(subjectId, 'C');
    const topicId = useStore.getState().addTopic(chapterId, 'T');
    useStore.getState().deleteChapter(chapterId);
    const state = useStore.getState();
    expect(state.chapters[chapterId]).toBeUndefined();
    expect(state.topics[topicId]).toBeUndefined();
    expect(state.subjects[subjectId].chapterIds).not.toContain(chapterId);
  });

  it('duplicateChapter copies chapter and its topics with fresh ids', () => {
    const subjectId = useStore.getState().addSubject('S');
    const chapterId = useStore.getState().addChapter(subjectId, 'C');
    useStore.getState().addTopic(chapterId, 'T');
    const copyId = useStore.getState().duplicateChapter(chapterId);
    const state = useStore.getState();
    expect(copyId).not.toBe(chapterId);
    expect(state.chapters[copyId].topicIds).toHaveLength(1);
    expect(state.chapters[copyId].topicIds[0]).not.toBe(state.chapters[chapterId].topicIds[0]);
  });

  it('archiveTopic sets archivedAt and restoreTopic clears it', () => {
    const s = useStore.getState().addSubject('S');
    const c = useStore.getState().addChapter(s, 'C');
    const t = useStore.getState().addTopic(c, 'T');
    useStore.getState().archiveTopic(t);
    expect(useStore.getState().topics[t].archivedAt).toBeTypeOf('number');
    useStore.getState().restoreTopic(t);
    expect(useStore.getState().topics[t].archivedAt).toBeUndefined();
  });

  it('archiveChapter then restoreChapter round-trips archivedAt', () => {
    const s = useStore.getState().addSubject('S');
    const c = useStore.getState().addChapter(s, 'C');
    useStore.getState().archiveChapter(c);
    expect(useStore.getState().chapters[c].archivedAt).toBeTypeOf('number');
    useStore.getState().restoreChapter(c);
    expect(useStore.getState().chapters[c].archivedAt).toBeUndefined();
  });

  it('reorderTopics moves a topic within its chapter', () => {
    const s = useStore.getState().addSubject('S');
    const c = useStore.getState().addChapter(s, 'C');
    const t1 = useStore.getState().addTopic(c, 'A');
    const t2 = useStore.getState().addTopic(c, 'B');
    const t3 = useStore.getState().addTopic(c, 'C');
    useStore.getState().reorderTopics(t1, t3); // move A to C's slot
    expect(useStore.getState().chapters[c].topicIds).toEqual([t2, t3, t1]);
  });

  it('moveTopic reparents a topic to another chapter (appended)', () => {
    const s = useStore.getState().addSubject('S');
    const c1 = useStore.getState().addChapter(s, 'C1');
    const c2 = useStore.getState().addChapter(s, 'C2');
    const t = useStore.getState().addTopic(c1, 'T');
    useStore.getState().moveTopic(t, c2);
    const state = useStore.getState();
    expect(state.chapters[c1].topicIds).not.toContain(t);
    expect(state.chapters[c2].topicIds).toContain(t);
    expect(state.topics[t].chapterId).toBe(c2);
  });

  it('moveChapter reparents a chapter to another subject (appended)', () => {
    const s1 = useStore.getState().addSubject('S1');
    const s2 = useStore.getState().addSubject('S2');
    const c = useStore.getState().addChapter(s1, 'C');
    useStore.getState().moveChapter(c, s2);
    const state = useStore.getState();
    expect(state.subjects[s1].chapterIds).not.toContain(c);
    expect(state.subjects[s2].chapterIds).toContain(c);
    expect(state.chapters[c].subjectId).toBe(s2);
  });

  it('moveTopic to the same chapter is a no-op (no duplicate)', () => {
    const s = useStore.getState().addSubject('S');
    const c = useStore.getState().addChapter(s, 'C');
    const t = useStore.getState().addTopic(c, 'T');
    useStore.getState().moveTopic(t, c);
    expect(useStore.getState().chapters[c].topicIds).toEqual([t]);
  });

  it('undo reverts a structural change; redo re-applies it', () => {
    const s = useStore.getState().addSubject('S');
    const c1 = useStore.getState().addChapter(s, 'C1');
    useStore.getState().addChapter(s, 'C2');
    expect(useStore.getState().subjects[s].chapterIds).toHaveLength(2);
    useStore.getState().undo();
    expect(useStore.getState().subjects[s].chapterIds).toHaveLength(1);
    expect(useStore.getState().subjects[s].chapterIds).toContain(c1);
    useStore.getState().redo();
    expect(useStore.getState().subjects[s].chapterIds).toHaveLength(2);
  });

  it('editing notes does not create an undo entry', () => {
    const s = useStore.getState().addSubject('S');
    const c = useStore.getState().addChapter(s, 'C');
    const t = useStore.getState().addTopic(c, 'T');
    const before = useStore.getState().history.past.length;
    useStore.getState().updateTopicNotes(t, 'hello');
    expect(useStore.getState().history.past.length).toBe(before);
  });

  it('marking a mutation sets saveState to saving', () => {
    useStore.getState().addSubject('S');
    expect(useStore.getState().saveState).toBe('saving');
  });

  it('addAttachment / removeAttachment update the topic and are undoable', () => {
    const s = useStore.getState().addSubject('S');
    const c = useStore.getState().addChapter(s, 'C');
    const t = useStore.getState().addTopic(c, 'T');
    const att = { id: 'a1', name: 'x.png', kind: 'image' as const, url: '/api/files/a1', createdAt: 1 };
    const before = useStore.getState().history.past.length;
    useStore.getState().addAttachment(t, att);
    expect(useStore.getState().topics[t].attachments).toEqual([att]);
    expect(useStore.getState().history.past.length).toBe(before + 1);
    useStore.getState().removeAttachment(t, 'a1');
    expect(useStore.getState().topics[t].attachments).toEqual([]);
  });

  it('addFlashcard / updateFlashcard / deleteFlashcard manage the card list', () => {
    const s = useStore.getState().addSubject('S');
    const c = useStore.getState().addChapter(s, 'C');
    const t = useStore.getState().addTopic(c, 'T');
    const cid = useStore.getState().addFlashcard(t, 'Q', 'A');
    expect(useStore.getState().topics[t].flashcards).toHaveLength(1);
    useStore.getState().updateFlashcard(t, cid, 'Q2', 'A2');
    expect(useStore.getState().topics[t].flashcards![0]).toMatchObject({ front: 'Q2', back: 'A2' });
    useStore.getState().deleteFlashcard(t, cid);
    expect(useStore.getState().topics[t].flashcards).toHaveLength(0);
  });

  it('toggleBookmark flips bookmarkedAt', () => {
    const s = useStore.getState().addSubject('S');
    const c = useStore.getState().addChapter(s, 'C');
    const t = useStore.getState().addTopic(c, 'T');
    useStore.getState().toggleBookmark(t);
    expect(useStore.getState().topics[t].bookmarkedAt).toBeTypeOf('number');
    useStore.getState().toggleBookmark(t);
    expect(useStore.getState().topics[t].bookmarkedAt).toBeUndefined();
  });

  it('addTag adds a tag; toggleTopicTag adds then removes it on a topic', () => {
    const s = useStore.getState().addSubject('S');
    const c = useStore.getState().addChapter(s, 'C');
    const t = useStore.getState().addTopic(c, 'T');
    const tagId = useStore.getState().addTag('Formula', '#f00', 'Sigma');
    expect(useStore.getState().tags![tagId].name).toBe('Formula');
    useStore.getState().toggleTopicTag(t, tagId);
    expect(useStore.getState().topics[t].tagIds).toContain(tagId);
    useStore.getState().toggleTopicTag(t, tagId);
    expect(useStore.getState().topics[t].tagIds).not.toContain(tagId);
  });

  it('deleteTag removes it and strips it from all topics', () => {
    const s = useStore.getState().addSubject('S');
    const c = useStore.getState().addChapter(s, 'C');
    const t = useStore.getState().addTopic(c, 'T');
    const tagId = useStore.getState().addTag('Weak', '#f00', 'TriangleAlert');
    useStore.getState().toggleTopicTag(t, tagId);
    useStore.getState().deleteTag(tagId);
    expect(useStore.getState().tags![tagId]).toBeUndefined();
    expect(useStore.getState().tagOrder).not.toContain(tagId);
    expect(useStore.getState().topics[t].tagIds ?? []).not.toContain(tagId);
  });

  it('updateTag patches fields', () => {
    const tagId = useStore.getState().addTag('Old', '#f00', 'Star');
    useStore.getState().updateTag(tagId, { name: 'New', color: '#0f0' });
    expect(useStore.getState().tags![tagId]).toMatchObject({ name: 'New', color: '#0f0' });
  });

  it('hydrate loads from the injected repository', async () => {
    const repo = new MemoryRepository();
    await repo.save(seedData());
    const store = createRevisionStore(repo);
    await store.getState().hydrate();
    expect(store.getState().subjectOrder).toHaveLength(13);
  });
});
