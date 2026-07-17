// Shared types for the organisation / coaching-dashboard feature.
// See services/auth-service/db/migrations/0004_organisations.sql for the schema these mirror.

export type OrgRole = 'admin' | 'head' | 'member';

export interface MembershipSummary {
  orgId: string;
  orgName: string;
  groupId: string | null;
  groupName: string | null;
  role: OrgRole;
}

export interface RosterMember {
  userId: string;
  username: string;
}

export interface GroupRoster {
  requesterRole: 'admin' | 'head' | null;
  group: { id: string; name: string; orgName: string };
  members: RosterMember[];
}

export interface SubjectCoverage {
  subject: string;
  total: number;
  revised: number;
}

export interface CohortStudentRow {
  userId: string;
  username: string;
  hasData: boolean;
  totalTopics: number;
  completedTopics: number;
  completionPct: number;
  streakDays: number;
  dueToday: number;
  overdue: number;
  subjectCoverage: SubjectCoverage[];
}

export interface CohortSummary {
  group: { id: string; name: string; orgName: string };
  totals: { members: number; completionPct: number; dueToday: number; overdue: number };
  activity: { day: string; revisions: number }[];
}

export interface DrilldownTopic {
  id: string;
  title: string;
  state: string;
  revisionCount: number;
  lastRevisedAt: number | null;
  nextDueAt: number | null;
}

export interface StudentDrilldown {
  userId: string;
  username: string;
  activity: { day: string; revisions: number }[];
  subjects: { id: string; name: string; chapters: { id: string; name: string; topics: DrilldownTopic[] }[] }[];
}
