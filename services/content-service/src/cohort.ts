import express from 'express';
import type {
  CohortStudentRow, GroupRoster, StudentDrilldown, SubjectCoverage,
} from '@revision-app/shared';
import { badgeState, nextDueDate, lastRevisedAt } from '@revision-app/shared';
import { sessionUserId } from './session';
import { fetchGroupRoster, AuthServiceError } from './authClient';
import { readData } from './appDataStore';
import { getPool } from './db';
import { dueCounts } from './stats';

const PAGE_SIZE = 50;

interface StatsRow {
  user_id: string;
  total_topics: number;
  completed_topics: number;
  streak_days: number;
  due_histogram: Record<string, number>;
  subject_coverage: SubjectCoverage[];
}

async function statsFor(userIds: string[]): Promise<Map<string, StatsRow>> {
  if (userIds.length === 0) return new Map();
  const { rows } = await getPool().query<StatsRow>(
    'SELECT * FROM user_stats WHERE user_id = ANY($1)',
    [userIds],
  );
  return new Map(rows.map((r) => [r.user_id, r]));
}

async function activityFor(userIds: string[]): Promise<{ day: string; revisions: number }[]> {
  if (userIds.length === 0) return [];
  const { rows } = await getPool().query<{ day: string; revisions: number }>(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day, SUM(revisions)::int AS revisions
     FROM user_activity
     WHERE user_id = ANY($1) AND day >= CURRENT_DATE - 29
     GROUP BY day ORDER BY day`,
    [userIds],
  );
  return rows;
}

export function cohortRouter(): express.Router {
  const router = express.Router();

  // Auth + roster + role check for every /cohort route. Attaches the roster
  // to res.locals; sends the error response itself when the gate fails.
  router.use('/cohort/groups/:id', async (req, res, next) => {
    const session = sessionUserId(req);
    if (!session) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const roster: GroupRoster = await fetchGroupRoster(req.params.id, session.userId);
      if (!roster.requesterRole) {
        return res.status(403).json({ error: 'You are not a head of this group' });
      }
      res.locals.roster = roster;
      next();
    } catch (err) {
      if (err instanceof AuthServiceError) {
        return res.status(err.status).json({
          error: err.status === 404 ? 'Group not found' : 'authorization service unavailable',
        });
      }
      console.error('[cohort gate]', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  router.get('/cohort/groups/:id/summary', async (_req, res) => {
    try {
      const roster: GroupRoster = res.locals.roster;
      const ids = roster.members.map((m) => m.userId);
      const stats = await statsFor(ids);
      const now = Date.now();
      let total = 0, completed = 0, dueToday = 0, overdue = 0;
      for (const row of stats.values()) {
        total += row.total_topics;
        completed += row.completed_topics;
        const d = dueCounts(row.due_histogram, now);
        dueToday += d.dueToday;
        overdue += d.overdue;
      }
      res.json({
        group: roster.group,
        totals: {
          members: ids.length,
          completionPct: total === 0 ? 0 : Math.round((100 * completed) / total),
          dueToday,
          overdue,
        },
        activity: await activityFor(ids),
      });
    } catch (err) {
      console.error('[cohort summary]', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  router.get('/cohort/groups/:id/students', async (req, res) => {
    try {
      const roster: GroupRoster = res.locals.roster;
      const stats = await statsFor(roster.members.map((m) => m.userId));
      const now = Date.now();
      const rows: CohortStudentRow[] = roster.members.map((m) => {
        const s = stats.get(m.userId);
        if (!s) {
          return {
            userId: m.userId, username: m.username, hasData: false,
            totalTopics: 0, completedTopics: 0, completionPct: 0,
            streakDays: 0, dueToday: 0, overdue: 0, subjectCoverage: [],
          };
        }
        const d = dueCounts(s.due_histogram, now);
        return {
          userId: m.userId, username: m.username, hasData: true,
          totalTopics: s.total_topics, completedTopics: s.completed_topics,
          completionPct: s.total_topics === 0 ? 0 : Math.round((100 * s.completed_topics) / s.total_topics),
          streakDays: s.streak_days, dueToday: d.dueToday, overdue: d.overdue,
          subjectCoverage: s.subject_coverage,
        };
      });
      const sort = req.query.sort === 'overdue' ? 'overdue' : 'completion';
      rows.sort(sort === 'overdue'
        ? (a, b) => b.overdue - a.overdue
        : (a, b) => a.completionPct - b.completionPct); // worst-first for coaching
      const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
      res.json({
        page, pageSize: PAGE_SIZE, totalMembers: roster.members.length,
        students: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
      });
    } catch (err) {
      console.error('[cohort students]', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  router.get('/cohort/groups/:id/students/:userId', async (req, res) => {
    try {
      const roster: GroupRoster = res.locals.roster;
      const member = roster.members.find((m) => m.userId === req.params.userId);
      if (!member) return res.status(404).json({ error: 'No such student in this group' });

      const data = await readData(member.userId);
      const now = Date.now();
      // Whitelist projection: revision status only. NEVER spread topic objects
      // here — notes/attachments/flashcards/bookmarks/tags must not leak.
      const subjects = data
        ? data.subjectOrder
            .map((sid) => data.subjects[sid])
            .filter((s) => s && !s.archivedAt)
            .map((s) => ({
              id: s.id,
              name: s.name,
              chapters: s.chapterIds
                .map((cid) => data.chapters[cid])
                .filter((c) => c && !c.archivedAt)
                .map((c) => ({
                  id: c.id,
                  name: c.name,
                  topics: c.topicIds
                    .map((tid) => data.topics[tid])
                    .filter((t) => t && !t.archivedAt)
                    .map((t) => ({
                      id: t.id,
                      title: t.title,
                      state: badgeState(t, now),
                      revisionCount: t.revisionHistory.length,
                      lastRevisedAt: lastRevisedAt(t.revisionHistory) ?? null,
                      nextDueAt: nextDueDate(t) ?? null,
                    })),
                })),
            }))
        : [];
      const drilldown: StudentDrilldown = {
        userId: member.userId,
        username: member.username,
        activity: await activityFor([member.userId]),
        subjects,
      };
      res.json(drilldown);
    } catch (err) {
      console.error('[cohort drilldown]', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  return router;
}
