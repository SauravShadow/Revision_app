'use client';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { MonthCalendar } from '@/components/insights/MonthCalendar';

export default function CalendarPage() {
  return (
    <div>
      <Breadcrumb items={[{ label: 'Subjects', href: '/' }, { label: 'Calendar' }]} />
      <div className="mb-6 mt-4">
        <div className="tblabel mb-1.5">Schedule · Upcoming</div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Calendar</h1>
      </div>
      <MonthCalendar />
    </div>
  );
}
