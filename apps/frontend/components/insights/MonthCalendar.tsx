'use client';
import { useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { AppData } from '@revision-app/shared';
import { useStore } from '@/store/useStore';
import { calendarMonth, type CalendarDay } from '@/lib/insights/calendar';
import { startOfDay } from '@/lib/insights/day';
import { TopicResultRow } from '@/components/TopicResultRow';
import { PlanTopicPicker } from '@/components/PlanTopicPicker';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Status → semantic drafting colour (matches RevisionBadge: overdue redline,
// due amber annotation, completed green "go").
const LEGEND = [
  { key: 'overdue', label: 'Overdue', color: 'var(--alarm)' },
  { key: 'due', label: 'Due', color: 'var(--annotation)' },
  { key: 'completed', label: 'Completed', color: 'var(--go)' },
] as const;

function StatusDots({ cell }: { cell: CalendarDay }) {
  return (
    <div className="mt-1 flex min-h-[6px] justify-center gap-1">
      {cell.overdueTopicIds.length > 0 && <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--alarm)' }} title="Overdue" />}
      {cell.dueTopicIds.length > 0 && <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--annotation)' }} title="Due" />}
      {cell.completedTopicIds.length > 0 && <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--go)' }} title="Completed" />}
    </div>
  );
}

function SelectedDayTopics({ cell, data }: { cell: CalendarDay; data: AppData }) {
  const ids = [...new Set([...cell.overdueTopicIds, ...cell.dueTopicIds, ...cell.completedTopicIds])];
  if (ids.length === 0) {
    return <p className="text-sm text-ink-faint">Nothing scheduled or completed on this day.</p>;
  }
  return (
    <div className="grid gap-2">
      {ids.map((id) => {
        const topic = data.topics[id];
        if (!topic) return null;
        const chapter = data.chapters[topic.chapterId];
        const subject = chapter ? data.subjects[chapter.subjectId] : undefined;
        return <TopicResultRow key={id} topic={topic} subject={subject} chapter={chapter} />;
      })}
    </div>
  );
}

export function MonthCalendar() {
  const data = useStore();
  // Freeze "now" for the component's lifetime: a calendar view doesn't need a live-ticking
  // clock, and a stable value keeps the cells memo from recomputing on unrelated re-renders.
  const [now] = useState(() => Date.now());
  const todayStart = startOfDay(now);
  const todayDate = new Date(todayStart);

  const [view, setView] = useState({ year: todayDate.getFullYear(), month: todayDate.getMonth() });
  const [selected, setSelected] = useState<number>(todayStart);
  const [planOpen, setPlanOpen] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const cells = useMemo(() => calendarMonth(data, view.year, view.month, now), [data, view, now]);
  const selectedCell = cells.find((c) => c.day === selected);

  const goto = (year: number, month: number, day: number) => {
    setView({ year, month });
    setSelected(day);
  };

  const step = (delta: number) => {
    const d = new Date(view.year, view.month + delta, 1);
    const year = d.getFullYear();
    const month = d.getMonth();
    // Re-anchor the selected day into the newly-viewed month so the day panel never
    // silently disappears: land on today when navigating to the current month, else the 1st.
    const isCurrentMonth = year === todayDate.getFullYear() && month === todayDate.getMonth();
    goto(year, month, isCurrentMonth ? todayStart : startOfDay(new Date(year, month, 1).getTime()));
  };

  const jumpToday = () => goto(todayDate.getFullYear(), todayDate.getMonth(), todayStart);

  // Month totals across in-month cells (overdue is only surfaced on today's cell).
  const totals = cells.reduce(
    (a, c) => (c.inMonth
      ? { due: a.due + c.dueTopicIds.length, over: a.over + c.overdueTopicIds.length, done: a.done + c.completedTopicIds.length }
      : a),
    { due: 0, over: 0, done: 0 },
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      {/* Calendar sheet */}
      <div className="glass bp-ticks relative rounded-xl p-4">
        <div className="mb-4 flex items-center justify-between gap-2">
          <button onClick={() => step(-1)} aria-label="Previous month" className="rounded-lg border border-line p-2.5 text-ink-dim transition hover:border-accent hover:text-accent active:border-accent active:text-accent md:p-1.5"><ChevronLeft size={16} /></button>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-semibold tracking-tight text-ink">{MONTHS[view.month]}</span>
            <span className="bp-figure text-lg text-ink-dim">{view.year}</span>
          </div>
          <button onClick={() => step(1)} aria-label="Next month" className="rounded-lg border border-line p-2.5 text-ink-dim transition hover:border-accent hover:text-accent active:border-accent active:text-accent md:p-1.5"><ChevronRight size={16} /></button>
        </div>

        {/* Horizontal swipe steps the month — the chevrons are the only other
            way to navigate and they're deliberately small. */}
        <div
          className="grid grid-cols-7 gap-1.5 text-center"
          onTouchStart={(e) => { touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
          onTouchEnd={(e) => {
            const start = touchStart.current;
            touchStart.current = null;
            if (!start) return;
            const dx = e.changedTouches[0].clientX - start.x;
            const dy = e.changedTouches[0].clientY - start.y;
            // Ignore mostly-vertical drags so page scrolling never flips months.
            if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
            step(dx < 0 ? 1 : -1);
          }}
        >
          {DOW.map((d) => <div key={d} className="tblabel py-1 text-[10px]">{d}</div>)}
          {cells.map((c) => {
            const isSelected = c.day === selected;
            const isToday = c.day === todayStart;
            const has = c.overdueTopicIds.length + c.dueTopicIds.length + c.completedTopicIds.length > 0;
            return (
              <button
                key={c.day}
                onClick={() => setSelected(c.day)}
                aria-current={isToday ? 'date' : undefined}
                aria-label={new Date(c.day).toDateString()}
                className={`group relative flex aspect-square flex-col items-center justify-center rounded-lg border text-xs transition
                  ${c.inMonth ? 'border-line bg-ground-deep/40 hover:border-line-strong hover:bg-panel-2' : 'border-transparent text-ink-faint opacity-40'}
                  ${isSelected ? 'border-accent bg-panel-2' : ''}
                  ${isToday ? 'bp-today' : ''}`}
              >
                <span className={`bp-figure ${isToday ? 'text-accent' : c.inMonth ? 'text-ink' : 'text-ink-faint'}`}>
                  {new Date(c.day).getDate()}
                </span>
                <StatusDots cell={c} />
                {has && c.inMonth && (
                  <span className="pointer-events-none absolute right-1 top-1 h-1 w-1 rounded-full bg-accent opacity-0 transition group-hover:opacity-60" />
                )}
              </button>
            );
          })}
        </div>

        {/* Legend + month totals */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
          <div className="flex flex-wrap items-center gap-3">
            {LEGEND.map((l) => (
              <span key={l.key} className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: l.color }} />
                <span className="tblabel text-[10px]">{l.label}</span>
              </span>
            ))}
          </div>
          <div className="flex gap-2 text-[10px]">
            <span className="dim-chip" style={{ color: 'var(--alarm)' }}>{totals.over} overdue</span>
            <span className="dim-chip" style={{ color: 'var(--annotation)' }}>{totals.due} due</span>
            <span className="dim-chip" style={{ color: 'var(--go)' }}>{totals.done} done</span>
          </div>
        </div>
      </div>

      {/* Selected-day detail rail */}
      <div className="glass rounded-xl p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="tblabel mb-1">Selected day</div>
            {selectedCell && (
              <div className="text-sm font-medium text-ink">
                {new Date(selectedCell.day).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {selected >= todayStart && (
              <button onClick={() => setPlanOpen(true)} className="dim-chip text-ink-dim transition hover:border-accent hover:text-accent">+ Plan</button>
            )}
            <button onClick={jumpToday} className="dim-chip text-ink-dim transition hover:border-accent hover:text-accent">Today</button>
          </div>
        </div>
        {selectedCell && <SelectedDayTopics cell={selectedCell} data={data} />}
        {planOpen && <PlanTopicPicker day={selected} onClose={() => setPlanOpen(false)} />}
      </div>
    </div>
  );
}
