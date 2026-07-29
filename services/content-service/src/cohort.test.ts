import { describe, it, expect, vi, beforeEach, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import { signSession } from '@revision-app/shared/server';
import { DAY_MS } from '@revision-app/shared';
import type { AppData } from '@revision-app/shared';
import { getPool } from './db';
import { writeData } from './appDataStore';
import { createApp } from './server';
import { _clearRosterCache } from './authClient';

const app = createApp();
const NOW = Date.now();
const COACH = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STUDENT = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const coachToken = signSession({ userId: COACH, username: 'coach', domain: 'civil-engineering' });
const studentToken = signSession({ userId: STUDENT, username: 'student1', domain: 'civil-engineering' });

function roster(requesterRole: 'admin' | 'head' | null) {
  return {
    requesterRole,
    group: { id: 'g1', name: 'Batch A', orgName: 'XYZ' },
    members: [{ userId: STUDENT, username: 'student1' }],
  };
}

function stubRoster(requesterRole: 'admin' | 'head' | null) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(roster(requesterRole)), { status: 200 })));
}

function studentBlob(): AppData {
  return {
    subjects: { s1: { id: 's1', name: 'Soil', color: '', icon: '', order: 0, chapterIds: ['c1'] } },
    chapters: { c1: { id: 'c1', subjectId: 's1', name: 'Ch1', order: 0, difficulty: 'Easy', priority: 'Low', topicIds: ['t1', 't2'] } },
    topics: {
      t1: {
        id: 't1', chapterId: 'c1', title: 'Bearing capacity', notes: 'SECRET-NOTE', order: 0,
        difficulty: 'Easy', priority: 'Low',
        revisionHistory: [{ id: 'r1', timestamp: NOW - 3 * DAY_MS }], plannedAt: NOW - 2 * DAY_MS,
        createdAt: 0, updatedAt: 0,
        attachments: [{ id: 'a1', name: 'secret.pdf', kind: 'pdf', url: '/api/files/a1', createdAt: 0 }],
        flashcards: [{ id: 'f1', front: 'SECRET-FRONT', back: 'SECRET-BACK', createdAt: 0 }],
        bookmarkedAt: NOW, tagIds: ['tag1'],
      },
      t2: {
        id: 't2', chapterId: 'c1', title: 'Slope stability', notes: '', order: 1,
        difficulty: 'Easy', priority: 'Low', revisionHistory: [], createdAt: 0, updatedAt: 0,
      },
    },
    subjectOrder: ['s1'],
    tags: { tag1: { id: 'tag1', name: 'SECRET-TAG', color: '', icon: '', order: 0 } },
    tagOrder: ['tag1'],
  };
}

beforeEach(async () => {
  process.env.SERVICE_SECRET = 'test-secret';
  await getPool().query('TRUNCATE app_data, user_stats, user_activity');
  _clearRosterCache();
});
afterEach(() => vi.unstubAllGlobals());
afterAll(() => getPool().end());

describe('cohort endpoints', () => {
  it('401s without a session and 403s non-coaches', async () => {
    expect((await request(app).get('/cohort/groups/g1/summary')).status).toBe(401);
    stubRoster(null);
    const res = await request(app).get('/cohort/groups/g1/summary').set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
  });

  it('returns a summary with rollups and 30-day activity', async () => {
    await writeData(STUDENT, studentBlob(), NOW);
    stubRoster('head');
    const res = await request(app).get('/cohort/groups/g1/summary').set('Authorization', `Bearer ${coachToken}`);
    expect(res.status).toBe(200);
    expect(res.body.group).toEqual({ id: 'g1', name: 'Batch A', orgName: 'XYZ' });
    expect(res.body.totals.members).toBe(1);
    expect(res.body.totals.completionPct).toBe(50); // 1 of 2 topics revised
    expect(res.body.totals.overdue).toBe(1);        // t1 due 2 days ago
    expect(res.body.activity).toEqual([expect.objectContaining({ revisions: 1 })]);
  });

  it('lists students with a No-data row for members who never saved', async () => {
    stubRoster('admin');
    const res = await request(app).get('/cohort/groups/g1/students').set('Authorization', `Bearer ${coachToken}`);
    expect(res.status).toBe(200);
    expect(res.body.totalMembers).toBe(1);
    expect(res.body.students[0]).toMatchObject({ userId: STUDENT, username: 'student1', hasData: false, completionPct: 0 });
  });

  it('drill-down returns revision state only — never notes/attachments/tags', async () => {
    await writeData(STUDENT, studentBlob(), NOW);
    stubRoster('head');
    const res = await request(app).get(`/cohort/groups/g1/students/${STUDENT}`).set('Authorization', `Bearer ${coachToken}`);
    expect(res.status).toBe(200);
    expect(res.body.subjects[0].chapters[0].topics).toHaveLength(2);
    expect(res.body.subjects[0].chapters[0].topics[0]).toMatchObject({ title: 'Bearing capacity', state: 'Overdue', revisionCount: 1 });
    const raw = JSON.stringify(res.body);
    for (const banned of ['SECRET-NOTE', 'SECRET-FRONT', 'SECRET-TAG', 'secret.pdf', '"notes"', '"attachments"', '"flashcards"', '"bookmarkedAt"', '"tagIds"']) {
      expect(raw, `must not contain ${banned}`).not.toContain(banned);
    }
  });

  it('404s a drill-down for a non-member and 502s when auth-service is down', async () => {
    stubRoster('head');
    const nonMember = await request(app).get('/cohort/groups/g1/students/cccccccc-cccc-cccc-cccc-cccccccccccc')
      .set('Authorization', `Bearer ${coachToken}`);
    expect(nonMember.status).toBe(404);

    _clearRosterCache();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const down = await request(app).get('/cohort/groups/g1/summary').set('Authorization', `Bearer ${coachToken}`);
    expect(down.status).toBe(502);
    expect(down.body.error).toBe('authorization service unavailable');
  });

  it('paginates at 50/page and sorts worst-first', async () => {
    // 60 members, no stats rows needed — pagination/sort operate on the joined rows.
    const members = Array.from({ length: 60 }, (_, i) => ({
      userId: `${String(i).padStart(8, '0')}-0000-0000-0000-000000000000`,
      username: `student${String(i).padStart(2, '0')}`,
    }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      requesterRole: 'head',
      group: { id: 'g1', name: 'Batch A', orgName: 'XYZ' },
      members,
    }), { status: 200 })));
    // Give member 59 stats so completion sort puts the 59 no-data rows (0%) first.
    await writeData(members[59].userId, studentBlob(), NOW);

    const page1 = await request(app).get('/cohort/groups/g1/students?page=1').set('Authorization', `Bearer ${coachToken}`);
    expect(page1.body.students).toHaveLength(50);
    expect(page1.body.totalMembers).toBe(60);
    expect(page1.body.students.every((s: { completionPct: number }) => s.completionPct === 0)).toBe(true);

    const page2 = await request(app).get('/cohort/groups/g1/students?page=2').set('Authorization', `Bearer ${coachToken}`);
    expect(page2.body.students).toHaveLength(10);
    // worst-first: the one student with data (50% complete) sorts last overall
    expect(page2.body.students[9].userId).toBe(members[59].userId);
  });
});
