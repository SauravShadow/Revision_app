'use client';
import { useStore } from '@/store/useStore';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { RotateCcw, Trash2 } from 'lucide-react';

export default function ArchivePage() {
  const data = useStore();
  const store = useStore.getState();

  const subjects = Object.values(data.subjects).filter((s) => s.archivedAt);
  const chapters = Object.values(data.chapters).filter((c) => c.archivedAt);
  const topics = Object.values(data.topics).filter((t) => t.archivedAt);
  const empty = subjects.length + chapters.length + topics.length === 0;

  const purgeTopicBlobs = (topicId: string) => {
    const t = data.topics[topicId];
    (t?.attachments ?? []).filter((a) => a.url.startsWith('/api/files/')).forEach((a) => {
      void fetch(`/api/files/${a.id}`, { method: 'DELETE' });
    });
  };

  const Row = ({ label, kind, onRestore, onPurge }: {
    label: string; kind: string; onRestore: () => void; onPurge: () => void;
  }) => (
    <div className="glass flex items-center justify-between rounded-xl p-4">
      <div>
        <div className="font-medium">{label}</div>
        <div className="mt-1 text-xs opacity-50">{kind}</div>
      </div>
      <div className="flex items-center gap-1">
        <button aria-label="Restore" onClick={onRestore} className="flex items-center gap-1 rounded p-1.5 text-sm hover:bg-panel-2"><RotateCcw size={15} /> Restore</button>
        <button aria-label="Delete permanently" onClick={onPurge} className="rounded p-1.5 hover:bg-panel-2"><Trash2 size={15} /></button>
      </div>
    </div>
  );

  return (
    <div>
      <Breadcrumb items={[{ label: 'Subjects', href: '/' }, { label: 'Archive' }]} />
      <div className="mb-6 mt-4"><div className="tblabel mb-1.5">Superseded · Restorable</div><h1 className="text-2xl font-semibold tracking-tight text-ink">Archive</h1></div>
      {empty ? (
        <p className="text-sm opacity-50">Nothing archived. Items you archive appear here to restore or delete permanently.</p>
      ) : (
        <div className="grid gap-3">
          {subjects.map((s) => (
            <Row key={s.id} label={s.name} kind="Subject"
              onRestore={() => store.restoreSubject(s.id)}
              onPurge={() => { if (window.confirm(`Permanently delete "${s.name}" and everything in it?`)) store.deleteSubject(s.id); }} />
          ))}
          {chapters.map((c) => (
            <Row key={c.id} label={c.name} kind="Chapter"
              onRestore={() => store.restoreChapter(c.id)}
              onPurge={() => { if (window.confirm(`Permanently delete "${c.name}" and its topics?`)) store.deleteChapter(c.id); }} />
          ))}
          {topics.map((t) => (
            <Row key={t.id} label={t.title} kind="Topic"
              onRestore={() => store.restoreTopic(t.id)}
              onPurge={() => { if (window.confirm(`Permanently delete "${t.title}"?`)) { purgeTopicBlobs(t.id); store.deleteTopic(t.id); } }} />
          ))}
        </div>
      )}
    </div>
  );
}
