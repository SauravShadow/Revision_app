# Frontend Completion — Design

_Date: 2026-08-01_

Closes out the remaining work from
[`docs/frontend-upgrade-plan.md`](../../frontend-upgrade-plan.md) and adds a
**mobile P2** tier derived from a live audit of the running stack
(`http://127.0.0.1:3200`, demo account, Chromium at phone viewports).

## Scope

**In:** shared UI primitives, mobile P2 touch/loading/a11y fixes, the deferred
design-system consistency items (chips + search on chapter, quick-revise,
streak on home, empty states), Phase 6b swipe-to-reveal, and a committed audit
harness.

**Out** (decided 2026-08-01, frontend-only focus): the `/about` marketing page
(has its own plan at `docs/superpowers/plans/2026-07-23-about-intro-page.md`),
the brand-green palette retune (`docs/future-improvements.md` #1), the service
worker / offline shell, and Play Store compliance (privacy policy, account
deletion — the latter is a backend cascade, not frontend work).

---

## Audit findings (evidence base)

Run 2026-08-01 against the live stack. Two scripts: a route × viewport sweep and
a throttled-hydration follow-up.

### What P0/P1 already fixed — confirmed holding

- **Zero horizontal overflow** across all 10 routes at 320 / 360 / 390 / 430px,
  including `/subject/[id]`, `/chapter/[id]` and `/topic/[id]`, which the P1
  sweep never covered.
- **Zero landscape breakage** at 844×390 — no overflow, never both sidebar and
  tab bar.
- **No form field below 16px** anywhere — the iOS zoom-lock fix held.
- **All three themes** clean at 390px.

These are regression baselines, not open work.

### P2 — open findings

| # | Finding | Evidence |
|---|---|---|
| P2-1 | Header chrome below 44px on **every route** | logo 28×28, Search 36×40, Undo/Redo 42×42, Settings 40×40, Sign out 38×38 |
| P2-2 | Topic page — 30 sub-44px body controls | **Clear plan 7×16**, revision-history edit/delete 21×21, Maximize editor 28×28, bookmark 38×38, tag chips (Formula/PYQ/Weak/Important/Revise Again) 24px tall, attachment remove 22×22 |
| P2-3 | Editor toolbar — 13 buttons at 31×31, ~4px gaps | Bold/Italic/Heading/List/Checklist/Table/Code/Math/Callout/Link/Image + edit/split/preview at 36px tall |
| P2-4 | Calendar | prev/next 30×30, Today 55×26, day-rail buttons 39px wide |
| P2-5 | Insights | 13 `RankBars` rows at 349×32 |
| P2-6 | Chapter/subject | Rename/Delete 31×31, Tags 64×24, drag handle **24px wide** |
| P2-7 | Hydration withholds the whole app | **5127ms** on `/`, **3028ms** on `/insights` (3G + 4× CPU) showing only a centred "Loading…" |
| P2-8 | Undo/Redo show no focus ring | 2 of 14 sampled controls on home |

**P2-7 detail.** `StoreHydrator` wraps `AppShell` (`app/layout.tsx:56-60`) and
early-returns a single centred `Loading…` div (`StoreHydrator.tsx:55-57`) until
`hydrate()` resolves. During that window there is no header, no tab bar, no
sidebar — the entire chrome is withheld, not merely the data. This is an
architectural problem, not a missing-skeleton problem.

---

## Core design decision: hit area ≠ visual size

Making all 30+ controls physically 44px would destroy surfaces that are
deliberately dense drafting furniture — the editor toolbar, the calendar day
rail, revision-history rows. So the design splits the two:

**Isolated controls** keep their drawn size and gain a centred pseudo-element
that floors the *hit area* at 44×44:

```css
@media (max-width: 767px) and (pointer: coarse) {
  .touch-target { position: relative; }
  .touch-target::after {
    content: '';
    position: absolute;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    width: 100%; height: 100%;
    min-width: 44px; min-height: 44px;
  }
}
```

Applies to: header icons (P2-1), calendar chevrons and Today (P2-4),
revision-history edit/delete, Clear plan, bookmark toggle, attachment remove,
Maximize editor (P2-2), Rename/Delete (P2-6). Nothing moves visually.

**Dense clusters cannot use this.** The editor toolbar's 31px buttons at ~35px
pitch would get 44px hit areas overlapping neighbours by ~9px — the pseudo-
element of one button would sit over the next, and the later sibling wins in
paint order, so taps land on the wrong tool. Worse than the current state.
These get genuinely resized to 44px with the row made horizontally scrollable
on phones (P2-3), and the same applies to the calendar day rail (P2-4, widened
from 39px) and the drag handle (P2-6, widened from 24px).

The decision rule for implementers: **pseudo-element expansion only where the
resulting 44px box cannot overlap any other interactive element** — not just a
sibling icon button, but any link, row or control it would come to sit over.
Otherwise resize for real.

Two mechanical constraints on the pseudo-element form:

- An ancestor with `overflow: hidden` clips the expanded box, silently undoing
  the fix. Such controls take the resize path or lose the clipping.
- The control must not already use `::after` for decoration; those take the
  wrapper form of `IconButton`, which supplies a positioned span instead.

---

## Batch 1 — foundations

| Artifact | Responsibility | Depends on |
|---|---|---|
| `.touch-target` in `app/globals.css` | hit-area floor, coarse pointers under 768px | — |
| `components/ui/IconButton.tsx` | icon-only button; **required** `label` prop sets `aria-label` + `title` and applies `.touch-target` | `.touch-target` |
| `components/ui/Skeleton.tsx` | shimmer block, honours `prefers-reduced-motion` | — |
| `components/insights/Sparkline.tsx` | baseline rule, subtle grid, emphasised endpoint, `role="img"` + label | — |
| `--focus-ring` token + global `:focus-visible` | one visible ring for every control | — |

`IconButton`'s required `label` is the point: an unlabelled icon button becomes
unwriteable, so P2-1/P2-2 cannot silently recur on a new surface.

`Sparkline` replaces the `ActivityBars` function duplicated in
`app/coaching/page.tsx:31` and `app/coaching/[groupId]/[userId]/page.tsx` —
the last open item from upgrade-plan Phase 7.

---

## Batch 2 — apply to P2 surfaces

1. **Header** (`AppShell.tsx`, `HeaderControls.tsx`, `CommandPalette.tsx`
   trigger) → `IconButton`; fixes P2-1 on every route at once. (P2-8, the
   missing Undo/Redo focus ring, is already fixed by the Batch 1 global
   `:focus-visible` rule — this step just stops it recurring.)
2. **Topic page** (`app/topic/[id]`, `RevisionHistoryPanel`, `TagPicker`,
   `AttachmentsPanel`) → P2-2.
3. **Editor toolbar** (`components/editor/`) → real 44px + scrollable row, P2-3.
4. **Calendar** (`MonthCalendar`, `WeekStrip`) → P2-4.
5. **Insights** (`RankBars`) → 44px rows, P2-5.
6. **Chapter/subject** (`ChapterCard`, `TopicCard`, `SortableRow`) → P2-6.

### Hydration restructure (P2-7)

Move the gate inside the shell:

- `StoreHydrator` stops early-returning a full-screen `Loading…`. It always
  renders children and publishes hydration state as a `hydrated: boolean` field
  on the existing Zustand store, read via `useStore((s) => s.hydrated)` — no new
  context, since `StoreHydrator` already drives the store directly.
- `AppShell` renders header, sidebar and tab bar immediately — they depend on
  session, not on store data.
- `<main>` renders a route-appropriate skeleton while unhydrated:
  `SubjectGridSkeleton`, `InsightsSkeleton`, `ListSkeleton`.

Result: chrome is interactive in the first paint; only the data region is
pending. The 5.1s does not shrink — it stops being a dead screen.

---

## Batch 3 — design-system consistency

- **Chapter page** gains `InlineSearch` + `FilterChips` above the existing
  `FilterBar`. They are not redundant: chips are single-select quick states
  (All/Due/Overdue/Bookmarked/Not revised), `FilterBar` is the multi-axis
  advanced filter. Closes the "home only" caveat on upgrade-plan Phases 1–2.
- **Quick-revise** on topic rows, reusing the `markRevised` action currently
  reachable only from `TodayQueue` (upgrade-plan extra #2).
- **Streak widget** on home from the existing `lib/insights/streak.ts`, today
  consumed only by `/insights` and `/coaching` (extra #3).
- **Shared `EmptyState`** replacing the single ad-hoc message at
  `app/page.tsx:89` and covering the surfaces with no empty state at all
  (extra #4).

---

## Batch 4 — swipe-to-reveal (Phase 6b)

Deferred twice; included by decision 2026-08-01.

`components/hooks/useSwipeActions.ts` drives a framer-motion horizontal drag on
`TopicCard`, revealing Archive and Bookmark. Constraints:

- **Axis lock** — a gesture is claimed as horizontal only past a threshold with
  dominant x-displacement; otherwise it belongs to vertical scroll.
- **Suppressed during reorder** — dnd-kit's `TouchSensor` owns the same rows.
  Swipe is disabled whenever a drag is active, so the two never compete.
- **Not the only path** — `RowActions` stays, so nothing becomes
  swipe-only (swipe is undiscoverable and inaccessible on its own).

**Verification limit, stated plainly:** mechanical behaviour is testable
(reveal opens, action fires, reorder still works, vertical scroll unaffected).
Gesture *feel* — threshold, rubber-banding, whether it fights natural scrolling
— cannot be judged through touch emulation. Expect retuning after real use.

---

## Testing

- **Unit (Vitest + Testing Library):** `IconButton` (renders label, applies
  class), `Skeleton` (reduced-motion), `Sparkline` (endpoint emphasis,
  accessible name), `EmptyState`, `useSwipeActions` (axis lock, suppression
  during drag), chapter chips + search composition, hydration-state skeleton
  switching.
- **Regression harness:** the audit becomes `scripts/mobile-audit.mjs`,
  committed and documented in the README. It asserts the P0/P1 baselines
  (no overflow 320–430px × 10 routes, no landscape breakage, no sub-16px
  fields) and the new P2 floors (no sub-44px hit area, focus ring present,
  hydration paints chrome under throttling). This turns P2 into a check rather
  than a finding someone re-derives as P3.
- Existing suite must stay green; `npx tsc --noEmit` and `npm run lint` clean.

## Risks

- **Pseudo-element overlap** is the main correctness risk: an expanded hit box
  that covers a neighbouring control makes taps land on the wrong thing —
  strictly worse than a small target. The audit harness gains an overlap
  assertion (any interactive element whose effective hit box intersects
  another's is a failure), which forces the resize path where it applies.
- **Clipping and `::after` collisions** — see the two mechanical constraints
  above; both fail silently in a browser and so are covered by unit tests on
  `IconButton` rather than visual checking.
- **Swipe vs. scroll** on real devices, as stated above.

## Sequencing

Batch 1 → 2 → 3 → 4. Batch 1 gates everything. Batches 2 and 3 are independent
of each other. Batch 4 is last because it is the only item whose acceptance is
subjective.
