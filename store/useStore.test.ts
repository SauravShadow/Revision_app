import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from './useStore';

function reset() {
  window.localStorage.clear();
  useStore.setState({ subjects: {}, chapters: {}, topics: {}, subjectOrder: [] });
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
});
