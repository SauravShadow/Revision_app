# Future Improvements

Backlog of analysed-but-not-yet-implemented improvements. Each entry records the
finding and the recommended approach so implementation can start without
re-deriving the analysis.

---

## 1. Align the theme palette with the RevisionWorks brand green

**Status:** analysed 2026-07-29 · not started

### Finding

The RevisionWorks logo is a warm-olive green circle badge with white bar-chart
marks. Pixel-sampled canonical colors:

| Color | Value | Character |
|---|---|---|
| Brand green (flat icon) | `#4a7a1f` (hue 92°) | warm olive / leaf green |
| Polished icon green | `#426a21` (hue 93°) | same family, darker |
| Banner background | ~`#e8f0e8` | pale sage tint |

None of the three themes in `apps/frontend/app/globals.css` derives from this
green. The default **engpad** theme *looks* logo-adjacent (cream paper + green
graph rules) but its greens are a different family: grid rules `#4a7c59` are
hue 139° (cool sage) and `--go` `#1f7a5c` is hue 160° (pine) versus the logo's
92° olive — near-identical R/G channels, very different B, so perceptually a
different green. The engpad interactive accent is red pencil `#c0392b`.
Blueprint (cyan `#4fc3f7`) and slate (indigo `#4f46e5`) are unrelated by design.

Brand green appears in exactly four places, all outside the in-app palette:
`app/manifest.ts:15` (PWA `theme_color`), `app/layout.tsx:41`
(`viewport.themeColor`), and `services/auth-service/src/email/templates.ts:25,36`
(email accent rule + CTA). PWA `background_color: '#faf7ef'` does reuse the
engpad cream.

### Recommendation

Lowest-risk: retune **engpad only** into the brand family —

- grid rules → olive-tinted: `rgba(74, 122, 31, 0.10)` minor / `0.17` major
- `--go` → darker olive, e.g. `#3d6519`
- optionally offer banner sage `#e8f0e8` for recessed wells (`--ground-deep`)
- keep the red-pencil accent (green ground + red accent is a classic drafting
  pairing and preserves a non-green interactive color), **or** go full-brand
  with accent `#4a7a1f` — but then re-space due/overdue/go semantics so green
  isn't doing double duty.

Alternative: add a fourth "brand" theme built around `#4a7a1f` and leave the
existing three untouched.

### Related inconsistency: flat vs polished mark

Spec `docs/superpowers/specs/2026-07-23-revisionworks-logo-integration-design.md`
("icon-consistency correction", commit `c838194`) says all surfaces were
unified on the **polished varying-height** mark via a
`logo-icon-transparent.png` master. Current code contradicts this: that master
no longer exists and the header (`AppShell.tsx`), all five auth pages, and the
PWA icons all use the **flat equal-bars** `logo-icon-original.png` (switched in
commit `dcfae29`, a docs-labelled commit). The current state is at least
self-consistent (everything flat), but either the spec doc or the assets should
be corrected depending on which mark is intended.

---

## 2. Planned revisions — schedule a subject/topic for a future date

**Status:** implemented 2026-07-29 on branch `feature/manual-first-planning` (see `docs/superpowers/plans/2026-07-29-manual-first-planning.md`)

### Finding

There is currently **no way to schedule a revision for a chosen future date** —
not from the calendar, not from the subject or topic pages. Due dates are
purely *derived*: `nextDueDate = lastRevision + LADDER[count]` (ladder
`[1, 3, 7, 16, 35, 60, 90]` days, `packages/shared/src/revision.ts`). The
calendar (`components/insights/MonthCalendar.tsx` + `lib/insights/calendar.ts`)
is a read-only projection of that; clicking a day only shows derived
due/overdue/completed topics. Never-revised topics have no due date and never
appear on the calendar at all.

### Recommended implementation — manual-first planning (ladder demoted to suggestion)

**Decision 2026-07-29:** the ladder is *removed as the scheduling authority*.
Due dates come only from an explicit `plannedAt` set by the user; the ladder
survives solely as a suggestion shown at the moment of marking a topic revised.

1. **Data model** — add `plannedAt?: number` (epoch ms, local start-of-day) to
   `Topic` in `packages/shared/src/types.ts` and the zod topic schema in
   `packages/shared/src/schema.ts` (~line 12). Optional field ⇒ backward
   compatible with existing saved AppData; content-service validation picks it
   up automatically since the schema is shared.
2. **Engine** (`packages/shared/src/revision.ts` — single source of truth for
   both browser engine and content-service stats):
   - `nextDueDate(topic)` returns `plannedAt` or `undefined` — **no ladder
     fallback**. The ladder math moves to a `suggestedNextDate(history)` helper
     (`last revision + LADDER[count]`), used only by the UI.
   - `badgeState` gains an **`Unplanned`** state: has revision history but no
     `plannedAt`. Without this, revised-but-unplanned topics would silently
     vanish from every due surface. Existing states keep their meaning
     (Overdue/DueToday/DueTomorrow/Upcoming now measured against `plannedAt`;
     NeverRevised unchanged; RecentlyRevised unchanged).
3. **Post-revise flow** (the core UX): "Mark revised" opens a lightweight
   "plan next?" popover — quick-pick chips **+1d · +3d · +7d ·
   Suggested (ladder) · custom date · Skip**, with the ladder suggestion
   pre-highlighted. Confirm stamps `plannedAt`; Skip leaves the topic
   `Unplanned`. One tap keeps the old cadence for users who liked it; nothing
   is scheduled behind the user's back.
4. **Store** (`apps/frontend/store/useStore.ts`): `planTopic(id, date)`,
   `clearPlan(id)`; `markRevised` clears `plannedAt` and triggers the
   post-revise popover. Existing history/undo + saveQueue sync unchanged
   (whole-AppData persistence).
5. **Calendar UI** (`MonthCalendar.tsx`, `lib/insights/calendar.ts`): due dots
   now reflect plans automatically. Add scheduling *from* the calendar:
   selecting a future day shows "+ Plan revision" in the day rail →
   subject→topic picker → `planTopic(id, selectedDay)`. Consider surfacing an
   "Unplanned" count/section in the Agenda so skipped topics stay visible.
6. **Topic page** (`app/topic/[id]/page.tsx`): "Schedule revision" date picker
   next to Mark revised; shows/clears the current plan.
7. **Subject page** (`app/subject/[id]/page.tsx`): "Plan revision" bulk action —
   date picker + topic multi-select (default: all unplanned/never-revised
   topics in the subject) stamping `plannedAt` on each. Covers "revise this
   subject on date X" without a second entity type.
8. **Migration** (one-time, on first load after upgrade): backfill
   `plannedAt = old derived nextDueDate` for every topic with revision history
   and no plan. Without this, existing users' calendars and badges empty out
   overnight. Never-revised topics stay unplanned.
9. **Edge cases**: planning a past date ⇒ due that day (renders overdue);
   one plan per topic (no recurring schedules — recurrence is re-planning at
   each revise).
10. **Tests**: `revision.test.ts` (no-fallback `nextDueDate`, `Unplanned`
    badge, `suggestedNextDate`), store tests for plan/clear + revise-clears-
    plan, migration test, `CalendarPage.test.tsx` for the day-rail plan flow.

Estimated effort: ~1–2 days — the shared engine is the only cross-service
touchpoint; the additions over the override-model are the post-revise popover,
the `Unplanned` state surfaces, and the migration.
