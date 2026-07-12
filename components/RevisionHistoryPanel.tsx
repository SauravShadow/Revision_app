import type { Topic } from '@/lib/domain/types';
import { totalRevisions, relativeLabel } from '@/lib/revision/engine';

export function RevisionHistoryPanel({ topic }: { topic: Topic }) {
  const now = Date.now();
  const history = [...topic.revisionHistory].reverse();
  return (
    <div className="glass rounded-xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">Revision History</h3>
        <span className="text-sm opacity-70">Total Revisions: {totalRevisions(topic.revisionHistory)}</span>
      </div>
      {history.length === 0 ? (
        <p className="text-sm opacity-50">Not revised yet.</p>
      ) : (
        <ul className="space-y-2">
          {history.map((r, i) => {
            const d = new Date(r.timestamp);
            return (
              <li key={r.id} className="flex justify-between text-sm">
                <span>Revision {history.length - i}</span>
                <span className="opacity-70">{d.toLocaleDateString()} {d.toLocaleTimeString()} · {relativeLabel(r.timestamp, now)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
