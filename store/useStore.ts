import { create } from 'zustand';
import type { AppData, Chapter, Subject, Topic } from '@/lib/domain/types';
import { makeId } from '@/lib/domain/id';
import { markRevised } from '@/lib/revision/engine';
import { ApiRepository } from '@/lib/repository/ApiRepository';
import { seedData } from '@/lib/repository/seed';

const repo = new ApiRepository();

interface StoreState extends AppData {
  hydrate: () => Promise<void>;
  addSubject: (name: string) => string;
  renameSubject: (id: string, name: string) => void;
  deleteSubject: (id: string) => void;
  addChapter: (subjectId: string, name: string) => string;
  renameChapter: (id: string, name: string) => void;
  deleteChapter: (id: string) => void;
  duplicateChapter: (id: string) => string;
  addTopic: (chapterId: string, title: string) => string;
  renameTopic: (id: string, title: string) => void;
  deleteTopic: (id: string) => void;
  updateTopicNotes: (id: string, notes: string) => void;
  markTopicRevised: (id: string) => void;
}

function snapshot(s: StoreState): AppData {
  return { subjects: s.subjects, chapters: s.chapters, topics: s.topics, subjectOrder: s.subjectOrder };
}

export const useStore = create<StoreState>((set, get) => {
  // persist after every mutation
  const persist = () => { void repo.save(snapshot(get())); };
  const commit = (patch: Partial<AppData>) => { set(patch as never); persist(); };

  return {
    subjects: {}, chapters: {}, topics: {}, subjectOrder: [],

    hydrate: async () => {
      const loaded = await repo.load();
      if (loaded) { set(loaded as never); return; }
      const seeded = seedData();
      set(seeded as never);
      await repo.save(seeded);
    },

    addSubject: (name) => {
      const id = makeId();
      const s = get();
      const subject: Subject = { id, name, color: '#6366f1', icon: 'BookOpen', order: s.subjectOrder.length, chapterIds: [] };
      commit({ subjects: { ...s.subjects, [id]: subject }, subjectOrder: [...s.subjectOrder, id] });
      return id;
    },

    renameSubject: (id, name) => {
      const s = get();
      if (!s.subjects[id]) return;
      commit({ subjects: { ...s.subjects, [id]: { ...s.subjects[id], name } } });
    },

    deleteSubject: (id) => {
      const s = get();
      const subject = s.subjects[id];
      if (!subject) return;
      const subjects = { ...s.subjects }; delete subjects[id];
      const chapters = { ...s.chapters };
      const topics = { ...s.topics };
      for (const cid of subject.chapterIds) {
        const chapter = chapters[cid];
        if (chapter) chapter.topicIds.forEach((tid) => delete topics[tid]);
        delete chapters[cid];
      }
      commit({ subjects, chapters, topics, subjectOrder: s.subjectOrder.filter((x) => x !== id) });
    },

    addChapter: (subjectId, name) => {
      const id = makeId();
      const s = get();
      const subject = s.subjects[subjectId];
      if (!subject) return id;
      const chapter: Chapter = { id, subjectId, name, order: subject.chapterIds.length, difficulty: 'Medium', priority: 'Medium', topicIds: [] };
      commit({
        chapters: { ...s.chapters, [id]: chapter },
        subjects: { ...s.subjects, [subjectId]: { ...subject, chapterIds: [...subject.chapterIds, id] } },
      });
      return id;
    },

    renameChapter: (id, name) => {
      const s = get();
      if (!s.chapters[id]) return;
      commit({ chapters: { ...s.chapters, [id]: { ...s.chapters[id], name } } });
    },

    deleteChapter: (id) => {
      const s = get();
      const chapter = s.chapters[id];
      if (!chapter) return;
      const chapters = { ...s.chapters }; delete chapters[id];
      const topics = { ...s.topics };
      chapter.topicIds.forEach((tid) => delete topics[tid]);
      const subject = s.subjects[chapter.subjectId];
      const subjects = subject
        ? { ...s.subjects, [subject.id]: { ...subject, chapterIds: subject.chapterIds.filter((x) => x !== id) } }
        : s.subjects;
      commit({ chapters, topics, subjects });
    },

    duplicateChapter: (id) => {
      const s = get();
      const chapter = s.chapters[id];
      if (!chapter) return id;
      const newId = makeId();
      const topics = { ...s.topics };
      const newTopicIds: string[] = [];
      chapter.topicIds.forEach((tid) => {
        const t = s.topics[tid];
        if (!t) return;
        const ntid = makeId();
        topics[ntid] = { ...t, id: ntid, chapterId: newId, revisionHistory: [] };
        newTopicIds.push(ntid);
      });
      const copy: Chapter = { ...chapter, id: newId, name: `${chapter.name} (copy)`, topicIds: newTopicIds };
      const subject = s.subjects[chapter.subjectId];
      const subjects = subject
        ? { ...s.subjects, [subject.id]: { ...subject, chapterIds: [...subject.chapterIds, newId] } }
        : s.subjects;
      commit({ chapters: { ...s.chapters, [newId]: copy }, topics, subjects });
      return newId;
    },

    addTopic: (chapterId, title) => {
      const id = makeId();
      const s = get();
      const chapter = s.chapters[chapterId];
      if (!chapter) return id;
      const now = Date.now();
      const topic: Topic = { id, chapterId, title, notes: '', order: chapter.topicIds.length, difficulty: 'Medium', priority: 'Medium', revisionHistory: [], createdAt: now, updatedAt: now };
      commit({
        topics: { ...s.topics, [id]: topic },
        chapters: { ...s.chapters, [chapterId]: { ...chapter, topicIds: [...chapter.topicIds, id] } },
      });
      return id;
    },

    renameTopic: (id, title) => {
      const s = get();
      if (!s.topics[id]) return;
      commit({ topics: { ...s.topics, [id]: { ...s.topics[id], title, updatedAt: Date.now() } } });
    },

    deleteTopic: (id) => {
      const s = get();
      const topic = s.topics[id];
      if (!topic) return;
      const topics = { ...s.topics }; delete topics[id];
      const chapter = s.chapters[topic.chapterId];
      const chapters = chapter
        ? { ...s.chapters, [chapter.id]: { ...chapter, topicIds: chapter.topicIds.filter((x) => x !== id) } }
        : s.chapters;
      commit({ topics, chapters });
    },

    updateTopicNotes: (id, notes) => {
      const s = get();
      if (!s.topics[id]) return;
      commit({ topics: { ...s.topics, [id]: { ...s.topics[id], notes, updatedAt: Date.now() } } });
    },

    markTopicRevised: (id) => {
      const s = get();
      const topic = s.topics[id];
      if (!topic) return;
      commit({ topics: { ...s.topics, [id]: markRevised(topic, Date.now()) } });
    },
  };
});
