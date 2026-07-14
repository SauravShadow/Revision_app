// Auth domain types — server-side and shared session shape.

export type Domain =
  | 'civil-engineering'
  | 'software-engineering'
  | 'gate-cs'
  | 'mechanical-engineering'
  | 'electrical-engineering';

export const DOMAIN_LABELS: Record<Domain, string> = {
  'civil-engineering': 'Civil Engineering',
  'software-engineering': 'Software Engineering',
  'gate-cs': 'GATE CS',
  'mechanical-engineering': 'Mechanical Engineering',
  'electrical-engineering': 'Electrical Engineering',
};

export const DOMAIN_ICONS: Record<Domain, string> = {
  'civil-engineering': 'Building2',
  'software-engineering': 'Code2',
  'gate-cs': 'Cpu',
  'mechanical-engineering': 'Cog',
  'electrical-engineering': 'Zap',
};

export const DOMAIN_COLORS: Record<Domain, string> = {
  'civil-engineering': '#f97316',
  'software-engineering': '#6366f1',
  'gate-cs': '#8b5cf6',
  'mechanical-engineering': '#ef4444',
  'electrical-engineering': '#eab308',
};

/** Persisted user record (server-only, never sent to client). */
export interface UserRecord {
  id: string;
  username: string;
  passwordHash: string;
  domain: Domain;
  createdAt: number;
}

/** Safe subset sent to the client (no password). */
export interface Session {
  userId: string;
  username: string;
  domain: Domain;
}
