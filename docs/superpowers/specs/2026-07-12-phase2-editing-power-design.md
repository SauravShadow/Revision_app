# Phase 2: Editing Power & Premium Polish — Design Spec

**Date:** 2026-07-12
**Status:** Approved (design) — pending implementation planning
**Builds on:** Phase 1 (shipped) + server-side persistence (shipped)

## 1. Overview

Phase 2 turns the Phase 1 walking skeleton into a fluid editing tool. It adds
five capability tracks on top of the existing Subject → Chapter → Topic
hierarchy, all in one implementation plan:

1. **Inline rename** — replace every `window.prompt()` with in-place editing.
2. **Drag-and-drop** — reorder within a list, and reparent across the hierarchy
   via a persistent sidebar tree.
3. **Archive** — soft-archive (replaces hard delete) with a restore/purge view.
4. **Undo/redo** — session-only history over structural edits.
5. **Premium visual pass** — gradient borders, route transitions,
   micro-interactions, and an autosave status indicator.

The target feel remains Notion (organization) + Linear (polish) + Anki
(revision). The Phase 1 architecture is preserved: a pure domain layer, the
`RevisionRepository` contract (now `ApiRepository` → `/api/data` → file store),
and a single Zustand store as the only caller of the repository.

## 2. Load-bearing decisions

**No new persistence surface.** All new state (archive flags, reordering,
reparenting) flows through the existing `AppData` snapshot and the existing
`repo.save()` path. Undo/redo history is deliberately **not** persisted — it is
in-memory and session-only.

**One additive schema field.** Entities gain `archivedAt?: number` (undefined =
active). Everything else — reordering, moving — is already expressible with the
existing `order` fields and parent ordered-id arrays. Old persisted snapshots
without the field load unchanged (treated as active).

**Store split when undo/redo lands** (as flagged in the Phase 1 spec). The
history mechanism is extracted into its own module and wraps the entity
mutations. The public `useStore` hook API stays stable so components change only
where they gain new behavior (inline edit, dnd, archive).

**Correctness lives in pure/store logic, not in the dnd layer.** All move,
archive, and undo/redo logic is plain store/selector code with real unit tests.
The `@dnd-kit` wiring is a thin translation from drop events to those tested
store actions.

## 3. Data model changes

`lib/domain/types.ts`:

```ts
Subject  { …, archivedAt?: number }
Chapter  { …, archivedAt?: number }
Topic    { …, archivedAt?: number }
```

- `undefined` → active; a number → archived-at timestamp (used to sort the
  archive view, newest first).
- `AppData` shape is otherwise unchanged. Serialization is transparent.

## 4. Store: moves, archive, and history

### 4.1 Reorder + reparent (pure logic, unit-tested)

New actions on the store:

- `reorderSubjects(fromIndex, toIndex)` — reorder `subjectOrder`.
- `reorderChapters(subjectId, fromIndex, toIndex)` — reorder a subject's
  `chapterIds`.
- `reorderTopics(chapterId, fromIndex, toIndex)` — reorder a chapter's
  `topicIds`.
- `moveChapter(chapterId, toSubjectId, toIndex)` — detach from old subject's
  `chapterIds`, attach into the target at `toIndex`, update `chapter.subjectId`.
- `moveTopic(topicId, toChapterId, toIndex)` — detach from old chapter's
  `topicIds`, attach into the target, update `topic.chapterId`.

Invariants under test: no orphaned ids, no duplicate ids, `order` fields
re-normalized to array position, `subjectId`/`chapterId` back-references
consistent after a cross-move. Moving into the same parent degrades to a
reorder.

### 4.2 Archive / restore / purge

- `archiveSubject|Chapter|Topic(id)` — set `archivedAt = Date.now()`. Archiving a
  parent leaves children as-is (they are hidden transitively because their
  parent is hidden); the archive view shows top-level archived items.
- `restoreSubject|Chapter|Topic(id)` — clear `archivedAt`. Restore of a child
  whose parent is still archived surfaces it once the parent is also restored.
- `purgeSubject|Chapter|Topic(id)` — permanent delete (the Phase 1 hard-delete
  semantics: cascades to descendants, detaches from parent id-arrays).

Selectors and lists exclude archived entities:
- Dashboard shows non-archived subjects only.
- Subject/chapter pages list non-archived children only.
- `chapterProgress` / `subjectProgress` / `subjectStats` count non-archived
  topics/chapters only (archived items don't drag down or inflate progress).

### 4.3 Undo/redo (`store/history.ts`)

- In-memory `past: AppData[]` and `future: AppData[]`, plus `canUndo` /
  `canRedo` booleans exposed on the store.
- `commitHistory(patch)` — push the pre-mutation `AppData` snapshot onto `past`,
  clear `future`, apply the patch, persist. Used by: add*, rename*, duplicate*,
  reorder*, move*, archive*, restore*, purge*.
- `commitSilent(patch)` — apply + persist with **no** history entry. Used by:
  `updateTopicNotes`, `markTopicRevised`, `hydrate`.
- `undo()` — move current snapshot to `future`, pop `past` to current, persist.
  `redo()` — the mirror. Both are silent with respect to creating new history.
- History depth capped at 100 (oldest dropped).
- History is cleared on `hydrate` (fresh session) and never persisted.

### 4.4 Keyboard + controls

- `useUndoRedoShortcuts()` hook (mounted in `AppShell`): Ctrl/Cmd+Z → `undo`,
  Shift+Ctrl/Cmd+Z (and Ctrl+Y) → `redo`. Ignored when
  `document.activeElement` is an `input`/`textarea`/`contenteditable`, so the
  notes editor keeps native text undo.
- Header shows Undo/Redo icon buttons wired to `canUndo`/`canRedo`.

## 5. Inline rename

`components/InlineEditable.tsx`:

- Props: `value`, `onCommit(next: string)`, plus styling passthrough.
- Renders text until activated (click, or an edit affordance); becomes a
  controlled `<input>`; **Enter** or **blur** commits a trimmed non-empty value,
  **Escape** cancels. Empty/whitespace commit is ignored (keeps old value).
- Replaces the `window.prompt` rename flows in `SubjectCard`, `ChapterCard`,
  `TopicCard`, and the subject/chapter/topic page `<h1>`s.
- `AddButton` flow: create the entity with a default name, then immediately put
  its `InlineEditable` into edit mode so the user types the real name in place.

## 6. Drag-and-drop + sidebar tree

Dependencies: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/modifiers`.

### 6.1 Within-list reorder
- Dashboard subject grid, subject-page chapter list, and chapter-page topic list
  each become a `SortableContext`; dropping calls the matching `reorder*`
  action.

### 6.2 Sidebar tree (cross-hierarchy move + navigation)
- New persistent, collapsible left sidebar in `AppShell`:
  `components/layout/SidebarTree.tsx`. Lists non-archived Subjects, expandable to
  their Chapters, expandable to their Topics. Current route is highlighted; nodes
  are links (navigation) **and** dnd drop targets.
- Cross-move: drag a topic (from the main list) onto a Chapter node → `moveTopic`.
  Drag a chapter onto a Subject node → `moveChapter`. Dropping onto a node
  appends to the end of that parent (index = length); fine-grained ordering is
  done by within-list reorder afterward.
- One `DndContext` at the shell level coordinates both the main-content sortable
  lists and the sidebar drop targets. Draggable item ids are namespaced
  (`topic:<id>`, `chapter:<id>`, `subject:<id>`) so the drop handler knows what
  moved and where.
- The sidebar collapses (toggle persisted in `localStorage`, like the theme) and
  is hidden below a mobile breakpoint (drawer/off-canvas), keeping the main
  content usable on small screens.

## 7. Premium visual pass

- **Gradient-border cards:** a `.gradient-border` utility (padding-box +
  border-box gradient, or a masked pseudo-element) applied to Subject cards,
  tuned per subject color.
- **Route transitions:** `app/template.tsx` wraps children in framer-motion
  `AnimatePresence` for fade/slide between routes.
- **Micro-interactions:** spring hover/tap on cards and buttons; animated
  progress bars (width tween) and badge entrance; drag overlay styling.
- **Autosave indicator:** the store exposes a `saveState: 'idle' | 'saving' |
  'saved'`; `ApiRepository.save` transitions it (saving → saved, with a brief
  settle). A small header pill shows "Saving…" / "Saved ✓". This surfaces the
  persistence that already happens on every mutation.
- **Theme:** existing dark/light toggle retained; new tokens defined as CSS
  variables so both themes stay consistent.

## 8. Testing

Unit (Vitest), correctness-critical:
- Reorder + move actions: id-array integrity, no dupes/orphans, `order`
  normalization, back-reference consistency, same-parent move == reorder.
- Archive/restore/purge: `archivedAt` transitions; selectors exclude archived;
  purge still cascades.
- Undo/redo: sequences of structural ops push/pop correctly; `undo` then `redo`
  round-trips `AppData`; notes edit and mark-revised create **no** history entry;
  depth cap drops oldest; `canUndo`/`canRedo` reflect stack state.

Component (Vitest + Testing Library):
- `InlineEditable`: Enter commits trimmed value, Escape cancels, empty ignored.
- Archive view renders archived items and wires Restore/Delete.
- Undo/Redo header buttons disabled when stacks are empty.

Not unit-tested (verified by build + manual): `@dnd-kit` pointer wiring and
sidebar drag interactions — these are thin over the tested store actions.

## 9. Routes / components summary

- New: `app/archive/page.tsx`, `app/template.tsx`,
  `components/InlineEditable.tsx`, `components/layout/SidebarTree.tsx`,
  `store/history.ts`, and header controls (undo/redo buttons + save pill).
- Modified: `types.ts` (+`archivedAt`), `store/useStore.ts` (history split, move
  & archive actions, `saveState`), `lib/revision/progress.ts` (archived
  filtering), `AppShell` (sidebar + shortcuts + controls + `DndContext`), the
  three card components (InlineEditable, draggable), the three list pages
  (SortableContext + dnd wiring).

## 10. Out of scope for Phase 2 (per roadmap)

Rich editor (LaTeX/images/tables/attachments), built-in and custom filters,
global search, statistics/heatmap/streaks, calendar, notifications,
authentication, cloud sync, AI/SM-2. These remain Phases 3–5 and the deferred
list.
