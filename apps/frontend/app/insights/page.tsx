'use client';
import { useStore } from '@/store/useStore';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { StatTile } from '@/components/insights/StatTile';
import { HeatmapGrid } from '@/components/insights/HeatmapGrid';
import { RadialGauge } from '@/components/insights/RadialGauge';
import { SegmentBar } from '@/components/insights/SegmentBar';
import { RankBars } from '@/components/insights/RankBars';
import { SubjectCompletion } from '@/components/insights/SubjectCompletion';
import { overallStats, topicsByRevisionCount } from '@/lib/insights/rankings';
import { revisionCountsByDay } from '@/lib/insights/heatmap';
import { currentStreak, longestStreak } from '@/lib/insights/streak';
import { activeTopics } from '@/lib/insights/topics';

export default function InsightsPage() {
  const data = useStore();
  const now = Date.now();
  const stats = overallStats(data, now);
  const heat = revisionCountsByDay(data, 365, now);
  const streak = currentStreak(data, now);
  const longest = longestStreak(data);
  const { most, least } = topicsByRevisionCount(data);
  const totalRevisions = activeTopics(data).reduce((s, t) => s + t.revisionHistory.length, 0);

  // Every topic falls in exactly one band; the four sum to totalTopics.
  const onTrack = stats.totalTopics - stats.overdue - stats.dueToday - stats.neverRevised;
  const segments = [
    { label: 'On track', value: onTrack, color: 'var(--go)' },
    { label: 'Due today', value: stats.dueToday, color: 'var(--annotation)' },
    { label: 'Overdue', value: stats.overdue, color: 'var(--alarm)' },
    { label: 'Never revised', value: stats.neverRevised, color: 'var(--ink-faint)' },
  ];

  return (
    <div>
      <Breadcrumb items={[{ label: 'Subjects', href: '/' }, { label: 'Insights' }]} />
      <div className="mb-6 mt-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="tblabel mb-1.5">Progress · Statistics</div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Insights</h1>
        </div>
        {stats.totalTopics > 0 && (
          <div className="flex flex-wrap gap-2">
            <span className="dim-chip text-ink-dim">{stats.totalTopics} topics</span>
            <span className="dim-chip text-ink-dim">{totalRevisions} revisions logged</span>
            {streak > 0 && <span className="dim-chip text-accent">{streak}-day streak</span>}
          </div>
        )}
      </div>

      {stats.totalTopics === 0 ? (
        <div className="glass bp-ticks relative mt-10 flex flex-col items-center rounded-xl px-6 py-16 text-center">
          <div className="bp-figure mb-3 text-4xl text-ink-faint">0%</div>
          <p className="max-w-sm text-sm text-ink-dim">
            No revision activity yet. Mark a topic revised to start building insights &mdash; your
            streak, heatmap and completion will grow from here.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 [&>*]:min-w-0">
          {/* Row 1 — gauge + key readouts */}
          <div className="bp-rise grid gap-4 lg:grid-cols-[minmax(0,240px)_1fr]" style={{ animationDelay: '40ms' }}>
            <RadialGauge value={stats.completionPct} label="Completion" sublabel={`${stats.totalTopics} topics`} />
            <div className="grid grid-cols-2 gap-4">
              <StatTile label="Current streak" value={streak} caption="consecutive days" tone="accent" />
              <StatTile label="Longest streak" value={longest} caption="days" />
              <StatTile label="Revisions logged" value={totalRevisions} caption={`${stats.avgRevisionsPerTopic} avg / topic`} />
              <StatTile
                label="Avg interval"
                value={stats.avgDaysBetween ?? '—'}
                caption="days between revisions"
              />
            </div>
          </div>

          {/* Row 2 — status breakdown */}
          <div className="bp-rise" style={{ animationDelay: '120ms' }}>
            <SegmentBar segments={segments} />
          </div>

          {/* Row 3 — activity heatmap */}
          <div className="bp-rise" style={{ animationDelay: '200ms' }}>
            <HeatmapGrid days={heat} />
          </div>

          {/* Row 4 — most / least revised */}
          <div className="bp-rise grid gap-4 [&>*]:min-w-0 lg:grid-cols-2" style={{ animationDelay: '280ms' }}>
            <RankBars title="Most revised" rows={most} data={data} color="var(--accent)" />
            <RankBars title="Least revised" rows={least} data={data} color="var(--annotation)" />
          </div>

          {/* Row 5 — completion by subject */}
          <div className="bp-rise" style={{ animationDelay: '360ms' }}>
            <SubjectCompletion data={data} now={now} />
          </div>
        </div>
      )}
    </div>
  );
}
