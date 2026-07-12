# Hardening Pass — Design Spec

**Date:** 2026-07-12
**Status:** Approved
**Origin:** Full code-quality & architecture review of the project (general health + readiness for stats/calendar/smart-revision features). This spec covers all High and Medium findings from that review. Low findings L1 (store slicing) and L2 (PUT validation) are deferred; L3 (lint warning) is included as a trivial fix.

## Goal

Fix the correctness, security, and data-integrity defects found in the review without changing any user-facing feature. After this pass: the file API cannot be traversed, typing in notes is cheap and saves cannot land out of order, the save indicator never lies, uploaded files can never be orphaned or dangling, undo never reverts typing, the store is type-clean and backend-injectable, the syllabus has one code source of truth, and the test suite is green.

## Non-goals

- No new features (stats, calendar, notifications come later).
- No multi-tab conflict protection (version counter) — single-tab remains the supported mode.
- No per-entity delta persistence / cloud migration — the full-snapshot model stays.
- No store slicing — deferred until the stats feature adds new state.

## Findings addressed

| ID | Finding | Section |
|----|---------|---------|
| H1 | Path traversal in `/api/files/[id]` (GET/DELETE) | 1 |
| H2 | Per-keystroke full-state PUT; out-of-order saves | 2 |
| H3 | `saveState` shows "saved" on failed saves | 2 |
| H4 | Two stale tests fail on master | 7 |
| M1 | Blob orphans, undo dead-links, duplicate-chapter shared blobs | 3 |
| M2 | Syllabus seed encoded in both `seed.ts` and `gen_seed.py` | 6 |
| M3 | Store hard-instantiates `ApiRepository`; tests fire real fetches | 5 |
| M4 | `data/` not gitignored | 7 |
| M5 | Undo silently reverts notes edits | 4 |
| M6 | `as never` casts; optional `tags`/`tagOrder` guards | 5 |
| L3 | Unused `describe` import lint warning | 7 |

## 1. File API security (H1)

Add `isValidBlobId(id: string): boolean` in `lib/repository/fileBlobStore.ts` — a strict UUID-shape check matching what `makeId()` produces (`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`).

- `app/api/files/[id]/route.ts`: GET and DELETE return 400 for invalid ids before touching the filesystem.
- `readBlob` / `deleteBlob` also reject invalid ids (return `null` / no-op) as defense in depth.

**Tests:** traversal ids (`../appdata.json`, `..%2Fappdata.json` decoded form, absolute paths, empty string) are rejected and no filesystem call is made; valid UUIDs still round-trip.

## 2. Save pipeline (H2 + H3)

**Chosen approach:** debounced, serialized save queue (Approach A; version counter and delta persistence explicitly rejected as out of scope).

New module `store/saveQueue.ts`:

- `schedule(snapshotFn)` — trailing debounce (800 ms) after the last mutation.
- Single-flight: at most one PUT in flight. If mutations arrive during a flight, one follow-up save with the **latest** snapshot runs after the flight completes (coalescing). Requests can therefore never land out of order.
- `flush()` — bypasses the debounce; wired to `beforeunload`/`pagehide` using `fetch` with `keepalive: true` (PUT is not supported by `sendBeacon`), so closing the tab inside the debounce window cannot lose edits.
- Status callback drives `saveState: 'idle' | 'saving' | 'saved' | 'error'`.

`ApiRepository.save` stops swallowing errors: it throws on network failure **and** on non-2xx responses. The queue catches, sets `saveState: 'error'`, and retries on the next scheduled save. `components/layout/HeaderControls.tsx` renders the error state visibly (e.g. "save failed — retrying").

**Tests (fake timers):** debounce coalesces rapid mutations into one PUT; a mutation during an in-flight save produces exactly one follow-up with the newest snapshot; failed save → `error` state → next save recovers to `saved`; `flush` sends immediately.

## 3. Blob garbage collection (M1)

**Chosen approach:** GC sweep with grace period (Approach A; precise store-driven deletes rejected because they conflict with undo and require refcounting).

- New route `POST /api/files/gc` (`app/api/files/gc/route.ts`) with logic in `lib/repository/fileBlobStore.ts` (`sweepUnreferenced`): read `appdata.json` via `readData()`, collect the set of upload ids referenced by any topic attachment (`url` of form `/api/files/<id>`), list `filesDir()`, delete blob+meta pairs whose id is not referenced **and** whose mtime is older than 24 h. Returns `{ scanned, deleted }`.
- `components/StoreHydrator.tsx` fires `POST /api/files/gc` once after hydrate, fire-and-forget.
- **Remove** the eager client-side blob deletes: `components/AttachmentsPanel.tsx:33` and the purge loop in `app/archive/page.tsx`.
- `duplicateChapter` needs no change: shared blob ids are safe because nothing deletes a blob that any copy still references.

Consequences by design: undo restoring an attachment or a deleted subject works (blob still exists); orphans from any delete path are collected on next app load after the grace period.

**Tests:** temp-dir sweep test — referenced blob kept, unreferenced-old blob deleted, unreferenced-young blob kept (grace), meta `.json` removed alongside.

## 4. Undo vs. notes edits (M5)

Rule: **undo reverts structure, never typing.** `undo()` (and `redo()`) restore the snapshot's structure, but for every topic that exists in both the snapshot and the present state, the present `notes` and `revisionHistory` are kept.

Implementation: a pure helper `preserveSilentFields(restored: AppData, present: AppData): AppData` in `store/history.ts`, applied to the snapshot in `undo`/`redo` before `set`.

**Tests:** structural change → type notes → undo: structure reverts, notes remain; mark-revised between structural changes survives undo; redo round-trips.

## 5. Store hygiene (M3 + M6)

- `AppData.tags` and `AppData.tagOrder` become **required**. A `normalizeData(raw): AppData` (absorbing `withBuiltinTagsIfMissing`) runs at the single load boundary (`hydrate`) and guarantees the shape for legacy payloads. All `?? {}` / `?? []` guards in `useStore.ts` are deleted.
- Kill the `as never` casts by typing the store correctly: `create<StoreState>()` with `set` used at `Partial<StoreState>` — the casts exist only because state and actions were mixed untyped.
- Repository injection: export `createRevisionStore(repo: RevisionRepository)`; the app-wide `useStore` is `createRevisionStore(new ApiRepository())`. Tests build stores with an in-memory repo (new `lib/repository/MemoryRepository.ts`, ~15 lines), eliminating jsdom fetch noise and making the "swap backends later" promise real at the store boundary.

**Tests:** existing store tests migrate to the injected memory repo; `normalizeData` unit tests for legacy payloads (missing tags, missing tagOrder).

## 6. Seed single source of truth (M2)

- Delete `scripts/gen_seed.py`.
- Add `scripts/gen-seed.ts` (~15 lines, run with `npx tsx scripts/gen-seed.ts [out]`): imports `seedData()` from `lib/repository/seed.ts` and writes `appdata.json`. `lib/repository/seed.ts` is the only code encoding of the syllabus; `docs/ESE-Civil-Engineering-Syllabus.md` remains human reference only.

## 7. Repo hygiene (H4 + M4 + L3)

- Fix `components/RevisionBadge.test.tsx` and `components/cards/ChapterCard.test.tsx` to match the post-blueprint markup (uppercase chip text, new topic-count structure).
- Add `/data` to `.gitignore`.
- Remove the unused `describe` import in `components/cards/SubjectCard.test.tsx`.

## Error handling summary

- Invalid blob id → 400, filesystem untouched.
- Save failure (network or non-2xx) → visible `error` state, automatic retry on next mutation, no silent data loss claims.
- GC failures → logged server-side, never block the UI (fire-and-forget trigger).
- Malformed persisted data → `normalizeData` guarantees required fields (full schema validation deferred, L2).

## Exit criteria

- `npx tsc --noEmit` clean, `npm run lint` clean, `npm test` fully green (including the new tests listed per section).
- Manual verification: traversal DELETE returns 400; typing in notes produces coalesced saves (network tab); killing the server mid-edit shows the error indicator; blob GC deletes a planted orphan and keeps referenced files.
