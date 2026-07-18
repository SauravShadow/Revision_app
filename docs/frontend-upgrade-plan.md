# Revision OS — Frontend Upgrade Plan

_Last updated: 2026-07-17_

A phased plan to modernise the Revision OS frontend, taking ergonomic cues from
messaging-app home screens (visible search, filter chips, borderless lists,
avatar/status anchors, count badges) while keeping the app's own "Blueprint
Drafting" character.

Interactive preview / living spec: [`docs/theme-explorer.html`](./theme-explorer.html)
(serve locally with `python3 -m http.server 8137 --bind 127.0.0.1` from `docs/`,
then open `http://127.0.0.1:8137/theme-explorer.html`).

---

## Decisions locked

- **Themes shipped:** three only —
  - **Blueprint Dark** — current navy `#0a1a2b` + cyan `#4fc3f7` palette, **CAD grid removed** (minimal ground).
  - **Engineering Pad** — cream `#faf7ef`, green graph rules, graphite ink, red-pencil `#c0392b` accent.
  - **Slate Minimal** — neutral `#fafafa`, no grid, single indigo `#4f46e5` accent.
- **Accent:** each theme uses its own default accent. No per-user accent picker in v1.
- **List density:** **compact hairline rows only** — one faint `--line` divider between rows, no per-row boxes.
- **Subject cards:** **no coloured left rail.** Progress-bar fill **keeps the subject colour** (decided 2026-07-17).
- **Default theme on first load:** **Engineering Pad** (light) — decided 2026-07-17. New users land on the cream graph-paper theme; the picker still offers Blueprint Dark and Slate Minimal.
- **Theme picker placement:** **Settings only** (decided 2026-07-17) — no header cycle button.

## Surfaces in scope

This is not just the student home. The redesign spans:

- **Student surfaces** — home (`app/page.tsx`), subject / chapter / topic, filtered,
  bookmarks, archive, insights, calendar, settings.
- **Organisation & coaching surfaces** _(shipped 2026-07-17)_ —
  - [`app/coaching/page.tsx`](../apps/frontend/app/coaching/page.tsx) — cohort dashboard (stat tiles, activity bars, student table), role-gated to heads/admins.
  - [`app/coaching/[groupId]/[userId]/page.tsx`](../apps/frontend/app/coaching/[groupId]/[userId]/page.tsx) — read-only student drill-down.
  - [`components/settings/OrganisationCard.tsx`](../apps/frontend/components/settings/OrganisationCard.tsx) — org/group/invite/head management inside Settings.

Both must be verified under every theme, and the coaching surfaces have their own
redesign work (see Phase 7).

---

## Phase 0 — Theming engine _(prerequisite; fixes the dead light/dark toggle)_ — ✅ SHIPPED 2026-07-18

_Delivered on branch `feat/theming-engine` (`42c8992`): `[data-theme]` palettes
(engpad/blueprint/slate), pre-paint `<head>` script + legacy migration,
`ThemeProvider`/`useTheme`, Settings-only `ThemePicker`. Coaching/org light-theme
verification (native selects, coverage-cell contrast) still pending Phase 7._


**Problem today:** [`ThemeToggle.tsx`](../apps/frontend/components/layout/ThemeToggle.tsx)
flips a `.dark` class, but [`layout.tsx`](../apps/frontend/app/layout.tsx) hard-codes
`className="dark"`, `:root` in [`globals.css`](../apps/frontend/app/globals.css)
declares only the dark palette, and there is **no light/alternate palette block
anywhere**. The toggle is therefore purely decorative.

**Approach**
- Move the palette off `:root` onto **`[data-theme="…"]`** blocks in `globals.css`,
  one block per theme (`blueprint`, `engpad`, `slate`). Keep the existing variable
  names (`--ground`, `--panel`, `--ink`, `--accent`, `--line`, `--annotation`,
  `--alarm`, `--go`, grid vars, `--lamp`).
- The `@theme inline` map (globals.css:37) stays as-is, so **every component
  re-skins automatically** — no component edits required.
- Add a small **blocking inline script** in `layout.tsx` `<head>` that reads the
  stored theme from `localStorage` and sets `data-theme` on `<html>` before paint
  (prevents flash-of-wrong-theme). Replace the hard-coded `className="dark"`.
- Replace boolean `ThemeToggle` with a **theme picker** (3 options) — a small
  `ThemeProvider` (React context) writing `data-theme` + persisting to
  `localStorage`. Surface it in [Settings](../apps/frontend/app/settings/page.tsx)
  **only** (no header cycle button — decided 2026-07-17).
- **Default + migration:** default `data-theme` is **`engpad`** (Engineering Pad)
  when nothing is stored. The current toggle persists under `localStorage['ce-theme']`
  with values `dark`/`light`; migrate that key (`dark` → `blueprint`, `light` →
  `engpad`) on first load so existing users aren't reset.
- Gridless themes (Blueprint Dark, Slate) set `--grid-minor`/`--grid-major` to
  `transparent`; Engineering Pad keeps its graph rules.

**Files:** `globals.css`, `app/layout.tsx`, `components/layout/ThemeToggle.tsx`
→ `ThemeProvider` + picker, `app/settings/page.tsx`.
**Effort:** ~½ day · **Risk:** low (additive).

**Verify on coaching/org surfaces too — known light-theme risks:**
- Native `<select>` controls (group picker, sort) on the coaching dashboard render
  with OS chrome that ignores the palette — restyle or replace so they read on
  Engineering Pad / Slate.
- Coaching student table uses `bg-accent text-ground-deep` **coverage cells with
  `opacity` scaled by completion**. On light themes `--ground-deep` is light, so
  faded cells can drop below contrast — re-check, and consider encoding coverage
  with a background tint + solid text instead of opacity.
- `OrganisationCard` reuses the auth classes (`.auth-card`, `.auth-input`,
  `.auth-btn`) — these already reference palette vars, but confirm the `.auth-shell`
  glows and card contrast hold on light grounds.

---

## Phase 1 — Filter chips _(highest value; do first after Phase 0)_ — ✅ SHIPPED 2026-07-18 (home)

_Delivered on branch `feat/theming-engine` (`297ab88`): single-select
`FilterChips` on the Subjects home (All/Due/Overdue/Bookmarked/Not revised) with
live counts, backed by pure `lib/filters/quickFilters` predicates and a per-list
`useQuickFilter` store. Still to do: adopt the same chips on chapter/topic lists
and the coaching sort/filter selectors._


- New `<FilterChips>` under the "Subjects" heading on
  [`app/page.tsx`](../apps/frontend/app/page.tsx), and on chapter/topic lists.
- Options: **All · Due · Overdue · Bookmarked · Not revised** — all derivable from
  the existing revision engine ([`lib/revision/engine`](../apps/frontend/lib/revision/engine.ts):
  `badgeState`, `lastRevisedAt`, `bookmarkedAt`).
- Active chip = filled `--accent`; inactive = existing `.dim-chip` style. Show live
  counts. Persist selection per-list (store or URL query).
- Pure client-side filter; no backend change.
- **Reuse on coaching:** the dashboard's sort `<select>` (completion / overdue) and
  the "Students" filter can adopt the same chip component for a consistent control
  language.

**Effort:** ~½ day.

---

## Phase 2 — Inline search on the list — ✅ SHIPPED 2026-07-18 (home)

_Delivered on branch `feat/inline-search` (`28b8f16`): debounced, clearable
`InlineSearch` pill above the chips with `/`-to-focus, reusing the command
palette scorer via `matchesQuery`/`subjectMatchesQuery`; search composes with the
chips and chip counts are query-aware. Still to do: the same field on chapter
pages._


- Persistent pill search field at the top of home + chapter pages (reuse
  `.auth-input` rounding). Fuzzy filter over subject/chapter/topic names via
  existing [`lib/search`](../apps/frontend/lib/search).
- Keep `CommandPalette` for power users; this just makes search **visible**.
  Debounced, clearable, `/` to focus.

**Effort:** ~½ day.

---

## Phase 3 — Bottom tab bar (mobile) — ✅ SHIPPED 2026-07-18

_Delivered on branch `feat/mobile-tabbar` (`3727ec8`): fixed, safe-area-padded
`BottomTabBar` (`md:hidden`) — Subjects/Insights/Calendar/Search + role-gated
Coaching; active tab via `aria-current`+`--accent`; Search opens the command
palette through an `open-command-palette` window event. Main gets bottom padding;
hamburger drawer retained for the deep tree. (A dedicated "More" sheet demoting
the hamburger is still a possible refinement.)_


- New `<BottomTabBar>` shown `md:hidden`, fixed to bottom, safe-area padded:
  **Subjects · Insights · Calendar · Search**. Active tab in `--accent`.
- **Role-gated tab:** for heads/admins, surface **Coaching** in the bar (the nav is
  already role-gated) — either as a fifth tab or inside a "More" sheet.
- Demote the hamburger [`MobileNavDrawer`](../apps/frontend/components/layout/MobileNavDrawer.tsx)
  from primary nav (keep it for the deep tree, opened from a "More" affordance).
- Add `pb-[env(safe-area-inset-bottom)]` to `<main>` so content clears the bar.

**Effort:** ~1 day.

---

## Phase 4 — Compact hairline lists — ✅ SHIPPED 2026-07-18

_Delivered on branch `feat/hairline-lists` (`26c0349`): `TopicCard`/`ChapterCard`
lost the glass box + accent left-rail; rows sit on the ground separated by a
single `--line` hairline (`divide-y` on the list, no outer box so drag doesn't
clip), with an `--accent-soft` hover wash. Added `--color-accent-soft` token.
Home subject grid unchanged (its avatar/progress treatment is Phase 5)._


The finalised list treatment (see preview). Applies to
[`TopicCard`](../apps/frontend/components/cards/TopicCard.tsx) &
[`ChapterCard`](../apps/frontend/components/cards/ChapterCard.tsx):

- Drop the per-row `glass` box + gradient border; render rows on the ground.
- Separate rows with a **single faint `--line` hairline** (a ruled sheet), not
  full containers — keeps the drafting feel and stays calm without feeling
  "floaty".
- Hover = subtle `--accent-soft` wash.

**Effort:** ~1 day.

---

## Phase 5 — Avatar anchor + circular count badge — ✅ SHIPPED 2026-07-18

_Delivered on branch `feat/subject-avatars` (`4f80a9f`): `SubjectCard` gained a
leading avatar (subject colour + initial) with a status ring (accent=due,
alarm=overdue, go=recent) via `subjectStatus()`, and a circular `CountBadge`
(pending topics, filled `--accent`, muted at zero). Coloured left rail removed;
progress bar keeps the subject colour (locked decision). Progress-bar colour
question is now settled._


- **Leading chip** per row: subject colour as a filled circle with the initial; a
  **status ring** encodes state — accent ring = due, `--alarm` = overdue, `--go` =
  recently revised (reuse `badgeState`).
- **Circular count badge** on the right: pending count as a mono, tabular number in
  a filled `--accent` bubble (a cousin of `RevisionBadge`); muted/outline when zero.
- Subject-card **progress bars keep the subject colour** (decided 2026-07-17; the
  colour rail is already removed, so the bar is where subject colour survives).

**Effort:** ~1 day.

---

## Phase 6 — Pin-to-top + swipe actions

- Bookmarked / high-priority topics **sort to the top** of their list with a pin
  tick (uses existing `bookmarkedAt` / `priority`).
- Mobile **swipe-to-reveal** Archive / Bookmark on rows (framer-motion drag — already
  a dependency), replacing the `RowActions` menu on touch.

**Effort:** ~1–1.5 days.

---

## Phase 7 — Organisation & coaching redesign

The coaching surfaces shipped functionally but haven't had the design pass the
student side is getting. Bring them up to the same bar.

**Coaching dashboard** ([`app/coaching/page.tsx`](../apps/frontend/app/coaching/page.tsx))
- Apply the shared **chip** control language to sort/group selectors (see Phase 1).
- Give the **student table** the row treatment from Phases 4–5: a leading avatar
  (initial + status ring for on-track / overdue), completion as a small bar or
  count badge, and a compact hairline layout. Keep it a real table for the
  per-subject coverage columns, but make rows scan like the topic list.
- Treat **coverage cells** as a proper heatmap (background tint + solid legible
  text, not `opacity`) so they read on light themes — coordinate with the
  `dataviz` skill for the scale.
- Give **ActivityBars** the sparkline treatment (baseline, subtle grid, emphasised
  endpoint) — shares work with the "streak/momentum" extra.
- Consistent **empty state** ("not a head of any group yet") matching the student
  empty-state style (extra #4).

**Student drill-down** ([`app/coaching/[groupId]/[userId]/page.tsx`](../apps/frontend/app/coaching/[groupId]/[userId]/page.tsx))
- Reuse the restyled subject cards / hairline topic rows in read-only mode so a
  coach sees a familiar layout. Make the read-only/redacted state visually explicit.

**Organisation management** ([`components/settings/OrganisationCard.tsx`](../apps/frontend/components/settings/OrganisationCard.tsx))
- The `AdminPanel` group/invite/head UI is currently raw `<ul>/<li>` + bare
  `<code>`. Rebuild as proper rows: each group a hairline row with its name, member
  count, an **invite code as a copy-to-clipboard chip** (`.dim-chip` + copy icon),
  and inline "assign head" affordance.
- Turn the membership list into labelled rows with **role badges** (admin / head /
  member) using the semantic palette.
- Keep the auth-class form styling for create/join, but wrap the whole card so it
  sits correctly inside the redesigned Settings page.

**Effort:** ~2–2.5 days.

---

## Beyond the six — product improvements

1. **"Today's queue"** — ✅ SHIPPED 2026-07-18 (`c3d677d`). Revise-now worklist at
   the top of home: every Overdue / Due-Today topic (overdue first) with
   subject·chapter context, a badge, and one-tap mark-revised. `lib/revision/todayQueue.ts`
   + `components/TodayQueue.tsx`; hidden when empty.
2. **Quick-revise without navigating** — one-tap "mark revised" on each row (updates
   `revisionHistory` in place), so a session is tap-tap-tap down the list.
3. **Streak / momentum widget** — revisions-per-day sparkline + current streak on
   home; ties into existing [insights](../apps/frontend/app/insights/page.tsx).
4. **Real empty & loading states** — blueprint-styled empty sheets + skeleton rows
   during hydration.
5. **PWA / installable + offline** — store/localStorage-driven already; add a
   manifest + service worker for phone install and offline use.
6. **Accessibility pass** — contrast-check the light themes (Engineering Pad, Slate),
   visible `:focus-visible` rings, honour `prefers-reduced-motion` app-wide.
7. **Command palette discoverability** — a visible `⌘K` hint (currently hidden).

---

## Suggested sequencing

**Phase 0 → 1 → 2** first (foundation + two high-value, low-risk wins that reuse
existing styles), then slot **"Today's queue"** (extras #1) as the biggest product
win, then **3** (mobile nav), then **4 → 5 → 6** as a refinement batch. **Phase 7**
(coaching/org) lands after **5**, since it reuses the row/avatar/badge work — but
its Phase 0 theming verification (native selects, coverage-cell contrast) happens
up front with everything else.

## Resolved questions (2026-07-17)

- **Default theme on first load:** Engineering Pad (light).
- **Subject-card progress bars:** keep per-subject colour.
- **Theme picker placement:** Settings only.
