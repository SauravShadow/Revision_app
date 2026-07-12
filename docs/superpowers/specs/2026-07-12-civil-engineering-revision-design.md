# Civil Engineering ESE Revision Manager — Design Spec

**Date:** 2026-07-12
**Status:** Approved (design) — pending implementation planning

## 1. Overview

A single-page web application for Civil Engineering ESE (Engineering Services
Examination) revision management. It is a **revision-tracking system**, not a
notes app: it organizes study material into a Subject → Chapter → Topic
hierarchy and records a complete, timestamped revision history per topic, with a
spaced-repetition due-date engine on top.

The product target is the feel of Notion (organization) + Linear (visual polish)
+ Anki (revision workflow).

## 2. Architecture & Stack

### Stack
- **Next.js (App Router) + TypeScript** — routing and structure; client-heavy.
- **TailwindCSS + shadcn/ui** — styling and component primitives.
- **Framer Motion** — animations and transitions.
- **Lucide** — icons.
- **Zustand** — state management (chosen over Redux Toolkit for far less
  boilerplate; sufficiently powerful for a single-user app).

### Load-bearing decisions

**Storage abstraction (enables cloud migration without a rewrite).**
All data access goes through a single `RevisionRepository` interface whose
methods are **async** (e.g. `getSubjects()`, `saveTopic()`, `logRevision()`).
Phase 1 ships a `LocalStorageRepository` implementing it. A future
`SupabaseRepository` implements the *same* interface with no other code changes.
Methods are async now (despite localStorage being synchronous) specifically so a
network-backed implementation does not force a refactor. The Zustand store talks
only to this interface — never to `localStorage` directly.

**Pure domain layer.** All revision math (next-due, days-since, badge state,
interval ladder, mark-revised) lives in framework-free functions under
`lib/revision/` — no React, no store access. This makes the core logic
trivially unit-testable and reusable by a future AI / SM-2 upgrade.

**Normalized data.** Entities live in maps keyed by id; parents reference
children as **ordered id arrays**. This keeps updates cheap, makes ordering
explicit (ready for Phase 2 drag-and-drop), and mirrors a relational/Supabase
schema.

### Folder structure
```
app/                      # routes: /, /subject/[id], /chapter/[id], /topic/[id], /stats
components/               # ui/ (shadcn), cards/, editor/, layout/
lib/
  domain/                 # types: Subject, Chapter, Topic, Revision, Filter
  revision/               # pure spaced-repetition logic
  repository/             # RevisionRepository interface + LocalStorageRepository
store/                    # zustand slices + undo middleware
```

**State composition:** one store of slices — `subjectsSlice`, `revisionSlice`,
`filtersSlice`, `uiSlice`. Undo/redo (Phase 2) via a history middleware wrapping
the store.

**Seed data:** on first load, pre-seed the 13 README subjects (Engineering
Mathematics, Strength of Materials, Structural Analysis, RCC, Steel Structures,
Fluid Mechanics, Hydrology, Hydraulics, Transportation, Geotechnical,
Environmental, Construction Management, Current Affairs) — all fully
editable/deletable — so the app is not empty on first run.

## 3. Phase Roadmap

Each phase is independently useful and builds on the previous one without
rework, thanks to the repository and pure-domain layers.

### Phase 1 — Walking skeleton + revision engine (build first)
- Dashboard with animated subject cards (progress %, chapter count, pending,
  last-revised).
- Drill-down: Subject → Chapter → Topic pages; add / rename / delete /
  duplicate at every level.
- Topic page with **markdown notes** (edit textarea + live preview — not the
  rich editor yet).
- **Mark as Revised** → appends a timestamped entry to `revisionHistory[]`;
  unlimited history; relative dates ("3 days ago"); total count.
- **Fixed-interval due logic** (ladder below) with Due Today / Overdue /
  Revise Tomorrow / Recently Revised badges.
- LocalStorage persistence via the repository; dark/light mode; basic polish.

### Phase 2 — Editing power & polish
- Drag-and-drop reorder + move across the hierarchy (dnd-kit).
- Inline rename everywhere, archive, undo/redo, autosave.
- Full premium visual pass: glassmorphism, gradient borders, page transitions,
  micro-interactions.

### Phase 3 — Rich topic editor
- Block/rich editor: LaTeX (KaTeX), images, tables, callouts/highlights,
  checklists, collapsible sections, code blocks.
- Attachments (PDF / video / external links), flashcards, bookmarks.

### Phase 4 — Filters & search
- Built-in filters (Needs Revision, Weak, Formula, PYQ, …) at global / subject /
  chapter scope.
- Unlimited custom filters (color + icon + description).
- Global search across subjects / chapters / topics / notes / tags.

### Phase 5 — Insights
- Statistics dashboard (heatmap, streak, most/least revised, averages,
  completion %).
- Calendar view (today / upcoming / missed / completed) and in-app
  notifications.

### Explicitly deferred (README "Future Ready" list)
Authentication, cloud sync, AI revision assistant, SM-2 upgrade, flashcard
generation, OCR, PDF import, voice notes, AI summaries, mobile app. The
architecture leaves room for all of them; none are built now.

## 4. Phase 1 Detailed Design

### Data model (`lib/domain/types.ts`)
```ts
Subject  { id, name, color, icon, order, chapterIds[] }
Chapter  { id, subjectId, name, order, difficulty, priority, topicIds[] }
Topic    { id, chapterId, title, notes /* markdown */, order,
           difficulty, priority, revisionHistory: Revision[],
           createdAt, updatedAt }
Revision { id, timestamp }   // date/time derived from timestamp
```
`difficulty` and `priority` are enums (e.g. Easy/Medium/Hard,
Low/Medium/High). Entities are stored in normalized maps; ordering is carried by
the parent's ordered id arrays and each entity's `order` field.

### Revision engine (`lib/revision/` — pure, unit-tested)
- `LADDER = [1, 3, 7, 16, 35, 60, 90]` (days).
- `nextInterval(revisionCount)` → ladder step for the given count, clamped to
  the last element.
- `nextDueDate(history)` → last revision timestamp + `nextInterval(history.length)`;
  undefined/never-revised handled explicitly.
- `daysSince(history)`, `totalRevisions(history)`.
- `relativeLabel(ts)` → "Today / Yesterday / 3 days ago / 1 week ago …".
- `badgeState(topic, now)` → `Overdue | DueToday | DueTomorrow |
  RecentlyRevised | Upcoming`.
- `markRevised(topic, now)` → returns a new topic with the revision appended
  (pure; the store persists the result).

### Progress rollups (selectors, not stored)
A topic is "in good standing" if its badge is not `Overdue` or `DueToday`.
Chapter progress = % of its topics in good standing. Subject progress = weighted
over its chapters. Computed via memoized selectors.

### Store & persistence
Zustand slices call the async `RevisionRepository`. `LocalStorageRepository`
serializes the normalized state under one namespaced key, debounced-saved on
mutation. The store hydrates from the repository on app mount, seeding the 13
subjects if the store is empty.

### Routes / components
- `/` Dashboard → `SubjectCard` grid (Framer Motion stagger, hover, gradient
  border, glass).
- `/subject/[id]` → `ChapterCard` list with add / rename / delete / duplicate.
- `/chapter/[id]` → `TopicCard` list showing revision count, badge,
  last-revised.
- `/topic/[id]` → markdown editor (textarea + `react-markdown` preview toggle),
  revision-history panel, prominent **Mark as Revised** button.
- Shared: `AppShell` (sidebar/breadcrumb), theme toggle, `ConfirmDialog` for
  deletes.

### Testing
- **Vitest unit tests** for every `lib/revision/` function: ladder edges, empty
  history, overdue math, relative-label boundaries.
- **Vitest tests** for `LocalStorageRepository`: round-trip serialization,
  first-run seeding, ordering preservation.
- The pure layers hold the correctness-critical logic and get real coverage; UI
  is verified by running the app.

### Phase 1 acceptance criteria
Open the app → see seeded subjects → drill into a chapter → add a topic → write
markdown notes → press **Mark as Revised** repeatedly → history and due-badges
update correctly → all state persists across a page reload.

## 5. Out of Scope for Phase 1
Rich editor, LaTeX, attachments, drag-and-drop, undo/redo, custom filters,
search, statistics, calendar, notifications, and everything in the deferred
list. These are scheduled in later phases.
