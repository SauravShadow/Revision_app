import type { AppData } from '@revision-app/shared';

export type SearchKind = 'subject' | 'chapter' | 'topic' | 'tag';
export interface SearchResult {
  kind: SearchKind;
  id: string;
  label: string;
  sublabel?: string;
  href: string;
  score: number;
}

// Higher is better. 0 means no match.
function score(haystack: string, needle: string): number {
  const h = haystack.toLowerCase();
  const i = h.indexOf(needle);
  if (i < 0) return 0;
  if (h === needle) return 100;
  if (i === 0) return 80;
  if (/\s/.test(h[i - 1] ?? ' ')) return 60; // word-boundary
  return 30;
}

/** True when `text` contains `query` (case-insensitive). Empty query never matches. */
export function matchesQuery(text: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  return q ? score(text, q) > 0 : false;
}

/**
 * Inline-search predicate for the subject list: a subject matches when its own
 * name matches, or any active chapter/topic under it matches. Empty query = no
 * filter (matches everything). Reuses the same scorer as the command palette.
 */
export function subjectMatchesQuery(data: AppData, subjectId: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const subject = data.subjects[subjectId];
  if (!subject || subject.archivedAt) return false;
  if (score(subject.name, q) > 0) return true;
  for (const c of Object.values(data.chapters)) {
    if (c.subjectId !== subjectId || c.archivedAt) continue;
    if (score(c.name, q) > 0) return true;
  }
  for (const t of Object.values(data.topics)) {
    const chapter = data.chapters[t.chapterId];
    if (!chapter || chapter.subjectId !== subjectId || t.archivedAt || chapter.archivedAt) continue;
    if (score(t.title, q) > 0) return true;
  }
  return false;
}

export function search(query: string, data: AppData): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: SearchResult[] = [];

  for (const s of Object.values(data.subjects)) {
    if (s.archivedAt) continue;
    const sc = score(s.name, q);
    if (sc) out.push({ kind: 'subject', id: s.id, label: s.name, href: `/subject/${s.id}`, score: sc });
  }
  for (const c of Object.values(data.chapters)) {
    if (c.archivedAt || data.subjects[c.subjectId]?.archivedAt) continue;
    const sc = score(c.name, q);
    if (sc) out.push({ kind: 'chapter', id: c.id, label: c.name, sublabel: data.subjects[c.subjectId]?.name, href: `/chapter/${c.id}`, score: sc });
  }
  for (const t of Object.values(data.topics)) {
    if (t.archivedAt) continue;
    const chapter = data.chapters[t.chapterId];
    if (chapter?.archivedAt || (chapter && data.subjects[chapter.subjectId]?.archivedAt)) continue;
    const titleScore = score(t.title, q);
    const notesScore = t.notes ? Math.min(score(t.notes, q), 25) : 0; // notes rank below titles
    const sc = Math.max(titleScore, notesScore);
    if (sc) out.push({ kind: 'topic', id: t.id, label: t.title, sublabel: chapter?.name, href: `/topic/${t.id}`, score: sc });
  }
  for (const g of Object.values(data.tags ?? {})) {
    const sc = score(g.name, q);
    if (sc) out.push({ kind: 'tag', id: g.id, label: g.name, sublabel: 'tag', href: `/filtered`, score: sc });
  }

  return out.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label)).slice(0, 40);
}
