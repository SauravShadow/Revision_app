'use client';
import { useState } from 'react';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { MonthCalendar } from '@/components/insights/MonthCalendar';
import { Agenda } from '@/components/insights/Agenda';
import { FilterChips } from '@/components/filters/FilterChips';

export default function CalendarPage() {
  const [view, setView] = useState<'agenda' | 'month'>('agenda');
  return (
    // Narrow centred column per the prototype's 760px .wrap — the agenda is a
    // reading list, not a full-bleed dashboard.
    <div className="mx-auto w-full max-w-3xl">
      <Breadcrumb items={[{ label: 'Subjects', href: '/' }, { label: 'Calendar' }]} />
      <div className="mb-6 mt-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="tblabel mb-1.5">Schedule · Upcoming</div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Calendar</h1>
        </div>
        <FilterChips
          className="mb-0"
          aria-label="Calendar view"
          value={view}
          onChange={(k) => setView(k as 'agenda' | 'month')}
          options={[{ key: 'agenda', label: 'Agenda' }, { key: 'month', label: 'Month' }]}
        />
      </div>
      {view === 'agenda' ? <Agenda /> : <MonthCalendar />}
    </div>
  );
}
