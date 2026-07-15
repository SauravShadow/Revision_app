# Revision App

A personal exam-revision manager for civil engineering (ESE) syllabus content, built around spaced-repetition scheduling. Each user tracks their own subjects → chapters → topics, marks what they've revised, and the app tells them what's due next.

## Features

- **Revision engine** — every topic gets a due date computed from a spaced-repetition ladder (`apps/frontend/lib/revision/engine.ts`, `ladder.ts`); the UI surfaces "needs revision," "never revised," and overdue states.
- **Content browsing** — hierarchical navigation across subject → chapter → topic, plus an archive view and a filtered/search view.
- **Rich markdown editor** — topic notes support Markdown, GFM, KaTeX math, and syntax-highlighted code blocks (`react-markdown` + `rehype-katex` + `rehype-highlight`).
- **Attachments** — upload files/images per topic, served through auth-scoped file tokens (not the session token, so a leaked file URL can't be replayed against the rest of the API).
- **Bookmarks & tags** — tag-based filtering and search, plus a dedicated bookmarks view.
- **Drag-and-drop organization** — reordering via `@dnd-kit`.
- **Multi-user auth** — per-user accounts, each scoped to an engineering domain (e.g. civil, mechanical, electrical), with fully isolated data and file storage per user.

## Architecture

This is a small microservices monorepo:

```
apps/frontend/          Next.js 15 (React 19) app — UI, revision engine, editor
services/auth-service/  Owns user accounts, login/register, session + file tokens (own Postgres DB: revision_auth)
services/content-service/  Owns each user's revision data (appdata.json equivalent, now Postgres: revision_content)
services/files-service/    Owns uploaded attachments/blobs on disk, with GC for unreferenced files
packages/shared/         Code shared across services/apps
db/init/                 Bootstrap SQL that provisions the per-service Postgres databases
```

The frontend never talks to Postgres directly — it calls `auth-service`, `content-service`, and `files-service` over HTTP (see `docker-compose.yml` for the internal URLs), each service owning its own migrations under `services/*/db/migrations`.

Design specs and implementation plans for how this evolved (single Next.js app → multi-user → Postgres → microservices split) live under `docs/superpowers/specs/` and `docs/superpowers/plans/`.

## Tech stack

- **Frontend:** Next.js 15, React 19, Zustand (state), TypeScript
- **Backend:** Node.js services (auth, content, files), Postgres 16
- **Infra:** Docker Compose, per-service Dockerfiles

## Getting started

```bash
cp .env.example .env
# Generate a real session secret and paste it into .env:
openssl rand -hex 32
# Fill in POSTGRES_PASSWORD too, then:
docker volume create revision_app-db
docker volume create revision_files-data
docker compose up -d
```

The app is served at `http://127.0.0.1:3200`. Postgres is reachable on the host at `127.0.0.1:5433` for running migrations/tests outside Docker. See `.env.example` for the full variable breakdown (including per-service `DATABASE_URL` overrides when running a service directly on the host).

## Testing

Each workspace has its own test suite (Vitest):

```bash
npm test                      # run from repo root, or per-workspace with -w
npx tsc --noEmit               # type check
npm run lint                   # lint
```

## Roadmap / not yet built

These are designed for or implied by the existing engine but not yet shipped:

- **Coaching dashboard** — a `head`/coach role that can see an aggregated view across all students instead of just their own data:
  - Per-student revision completion percentage and current streak
  - Due-today / overdue counts per student, and a leaderboard-style summary across all students
  - Subject/chapter coverage heatmap (which topics each student has and hasn't revised)
  - Time-series graphs of revision activity per student and cohort-wide
  - Drill-down from the cohort summary into a single student's full revision history
  - Would require a role field on `users` (student vs. head), an authorization check restricting the aggregate endpoints to heads, and read-only cross-user queries in `content-service` (today all queries are scoped to the requesting user's own data by design).
- **Statistics dashboard** — personal stats view (revision streaks, completion over time) for a single student, which the coaching dashboard above would build on.
- **Calendar view** — calendar-style visualization of due/overdue topics.
- **Notifications** — reminders when topics become due.
