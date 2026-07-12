import type { AppData, Subject } from '@/lib/domain/types';
import { makeId } from '@/lib/domain/id';

const SUBJECTS: { name: string; color: string; icon: string }[] = [
  { name: 'Engineering Mathematics', color: '#6366f1', icon: 'Sigma' },
  { name: 'Strength of Materials', color: '#ef4444', icon: 'Dumbbell' },
  { name: 'Structural Analysis', color: '#f97316', icon: 'Building2' },
  { name: 'RCC', color: '#eab308', icon: 'Boxes' },
  { name: 'Steel Structures', color: '#64748b', icon: 'Frame' },
  { name: 'Fluid Mechanics', color: '#06b6d4', icon: 'Droplets' },
  { name: 'Hydrology', color: '#0ea5e9', icon: 'CloudRain' },
  { name: 'Hydraulics', color: '#3b82f6', icon: 'Waves' },
  { name: 'Transportation', color: '#22c55e', icon: 'TrafficCone' },
  { name: 'Geotechnical', color: '#a16207', icon: 'Mountain' },
  { name: 'Environmental', color: '#10b981', icon: 'Leaf' },
  { name: 'Construction Management', color: '#8b5cf6', icon: 'HardHat' },
  { name: 'Current Affairs', color: '#ec4899', icon: 'Newspaper' },
];

export function seedData(): AppData {
  const subjects: Record<string, Subject> = {};
  const subjectOrder: string[] = [];
  SUBJECTS.forEach((s, i) => {
    const id = makeId();
    subjects[id] = { id, name: s.name, color: s.color, icon: s.icon, order: i, chapterIds: [] };
    subjectOrder.push(id);
  });
  return { subjects, chapters: {}, topics: {}, subjectOrder };
}
