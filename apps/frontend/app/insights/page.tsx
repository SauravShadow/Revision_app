'use client';
import Link from 'next/link';
import type { AppData } from '@revision-app/shared';
import { useStore } from '@/store/useStore';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { StatTile } from '@/components/insights/StatTile';
import { HeatmapGrid } from '@/components/insights/HeatmapGrid';
import { overallStats, topicsByRevisionCount, type TopicRevisionRank } from '@/lib/insights/rankings';
import { revisionCountsByDay } from '@/lib/insights/heatmap';
import { currentStreak, longestStreak } from '@/lib/insights/streak';

function RankList({ title, rows, data }: { title: string; rows: TopicRevisionRank[]; data: AppData }) {
  return (
    <div>
      <div className="tblabel mb-2">{title}</div>
      {rows.length === 0 ? (
        <p className="text-sm opacity-50">Nothing yet.</p>
      ) : (
        <div className="grid gap-2">
          {rows.map((r) => {
            const subject = data.subjects[r.subjectId];
            const chapter = data.chapters[r.chapterId];
            return (
              <Link key={r.topicId} href={`/topic/${r.topicId}`} className="glass flex items-center justify-between gap-3 rounded-xl p-3 hover:bg-panel-2">
                <div className="min-w-0">
                  <div className="font-medium">{r.title}</div>
                  <div className="mt-0.5 truncate text-xs opacity-50">{subject?.name}{chapter ? ` · ${chapter.name}` : ''}</div>
                </div>
                <span className="tblabel shrink-0">{r.count}×</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function InsightsPage() {
  const data = useStore();
  const now = Date.now();
  const stats = overallStats(data, now);
  const heat = revisionCountsByDay(data, 365, now);
  const streak = currentStreak(data, now);
  const longest = longestStreak(data);
  const { most, least } = topicsByRevisionCount(data);

  return (
    <div>
      <Breadcrumb items={[{ label: 'Subjects', href: '/' }, { label: 'Insights' }]} />
      <div className="mb-6 mt-4">
        <div className="tblabel mb-1.5">Progress · Statistics</div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Insights</h1>
      </div>

      {stats.totalTopics === 0 ? (
        <p className="text-sm opacity-50">No revision activity yet. Mark a topic revised to start building insights.</p>
      ) : (
        <div className="grid gap-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Completion" value={`${stats.completionPct}%`} caption={`${stats.totalTopics} topics`} />
            <StatTile label="Current streak" value={streak} caption="days" />
            <StatTile label="Longest streak" value={longest} caption="days" />
            <StatTile label="Due / Overdue" value={`${stats.dueToday} / ${stats.overdue}`} caption={`${stats.neverRevised} never revised`} />
          </div>

          <div>
            <div className="tblabel mb-2">Activity · last 12 months</div>
            <HeatmapGrid days={heat} />
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <RankList title="Most revised" rows={most} data={data} />
            <RankList title="Least revised" rows={least} data={data} />
          </div>
        </div>
      )}
    </div>
  );
}
