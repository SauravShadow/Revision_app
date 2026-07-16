'use client';
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { AppData } from '@revision-app/shared';
import { useStore } from '@/store/useStore';
import { calendarMonth, type CalendarDay } from '@/lib/insights/calendar';
import { startOfDay } from '@/lib/insights/day';
import { TopicResultRow } from '@/components/TopicResultRow';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function SelectedDayTopics({ cell, data }: { cell: CalendarDay; data: AppData }) {
  const ids = [...new Set([...cell.overdueTopicIds, ...cell.dueTopicIds, ...cell.completedTopicIds])];
  if (ids.length === 0) return <p className="text-sm opacity-50">Nothing scheduled or completed on this day.</p>;
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

  const cells = useMemo(() => calendarMonth(data, view.year, view.month, now), [data, view, now]);
  const selectedCell = cells.find((c) => c.day === selected);

  const step = (delta: number) => {
    const d = new Date(view.year, view.month + delta, 1);
    const year = d.getFullYear();
    const month = d.getMonth();
    setView({ year, month });
    // Re-anchor the selected day into the newly-viewed month so the day panel never
    // silently disappears: land on today when navigating to the current month, else the 1st.
    const isCurrentMonth = year === todayDate.getFullYear() && month === todayDate.getMonth();
    setSelected(isCurrentMonth ? todayStart : startOfDay(new Date(year, month, 1).getTime()));
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button onClick={() => step(-1)} aria-label="Previous month" className="rounded p-1 transition hover:bg-panel"><ChevronLeft size={16} /></button>
        <div className="font-medium">{MONTHS[view.month]} {view.year}</div>
        <button onClick={() => step(1)} aria-label="Next month" className="rounded p-1 transition hover:bg-panel"><ChevronRight size={16} /></button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {DOW.map((d) => <div key={d} className="tblabel py-1">{d}</div>)}
        {cells.map((c) => {
          const isSelected = c.day === selected;
          return (
            <button
              key={c.day}
              onClick={() => setSelected(c.day)}
              className={`aspect-square rounded-lg p-1 text-xs transition ${c.inMonth ? 'bg-panel hover:bg-panel-2' : 'opacity-30'} ${isSelected ? 'ring-1 ring-accent' : ''}`}
            >
              <div>{new Date(c.day).getDate()}</div>
              <div className="mt-0.5 flex justify-center gap-0.5">
                {c.overdueTopicIds.length > 0 && <span className="h-1 w-1 rounded-full bg-red-400" title="Overdue" />}
                {c.dueTopicIds.length > 0 && <span className="h-1 w-1 rounded-full bg-amber-400" title="Due" />}
                {c.completedTopicIds.length > 0 && <span className="h-1 w-1 rounded-full bg-emerald-400" title="Completed" />}
              </div>
            </button>
          );
        })}
      </div>

      {selectedCell && (
        <div className="mt-4">
          <div className="tblabel mb-2">{new Date(selectedCell.day).toLocaleDateString()}</div>
          <SelectedDayTopics cell={selectedCell} data={data} />
        </div>
      )}
    </div>
  );
}
