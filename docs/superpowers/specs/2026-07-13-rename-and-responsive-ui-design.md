# Rename to revision_app + Responsive UI

## Part 1: Rename

Rename the project from its current identifiers to `revision_app` in every place it's referenced. There is no git remote configured for this repo, so this is purely local — no GitHub repo rename involved.

Changes:
- Project folder: `Civil_Engineering_revision` → `revision_app`
- `package.json`: `"name": "ce-ese-revision-manager"` → `"name": "revision_app"`
- `docker-compose.yml`: image `ce-revision` → `revision_app`, `container_name: ce-revision` → `revision_app`, volume `ce-revision-data` → `revision_app-data`
  - **Caution**: the volume is declared `external: true`, meaning it must already exist on the host under the old name. Renaming the reference in compose does *not* migrate data — the app will either fail to start (volume not found) or create a fresh empty external volume under the new name, depending on Docker's behavior. This needs to be handled explicitly (create/rename the host volume, or migrate data into it) before `docker compose up` is run again, separately from this code change.
- `README.md`: update the descriptive title/opening line to reference `revision_app` instead of the current framing
- `app/layout.tsx`: page `<title>` metadata updated to match

This part is mechanical with no open design questions, so it's executed directly rather than going through a separate implementation plan.

## Part 2: Responsive UI

### Goal

The app is currently desktop-first: only 7 of 51 `.tsx` files use any Tailwind responsive prefix, and the sidebar navigation (`components/layout/SidebarTree.tsx`) is `hidden` below the `md` breakpoint with no replacement — on a phone there is currently no way to browse the subject/chapter tree at all. The goal is a full responsive pass so the app is usable and well-proportioned from phone width up through large external monitors.

### Approach

Mobile-first Tailwind CSS breakpoints, extending the pattern already partially in place, rather than introducing CSS container queries or a separate mobile build. This fits the existing Next.js + Tailwind v4 stack with the least structural change.

Breakpoints used: Tailwind defaults `sm` (640px), `md` (768px), `lg` (1024px), `xl` (1280px), `2xl` (1536px), plus consideration of a wider tier for ultra-wide monitors where useful.

Two content-width philosophies apply depending on content type:
- **Grid/list views** (dashboard, subject/chapter listings, attachment grids): fluid width, more columns as viewport grows. No fixed max-width cap — these should genuinely use more space on large screens.
- **Single-column text/prose views** (topic notes editor, revision history): capped reading width (~`max-w-3xl`–`4xl`), centered within the available space, even on very large screens. Wide text lines hurt readability, so this deliberately does not stretch.

### Component-level changes

1. **App shell / navigation** (`components/layout/AppShell.tsx`, `components/layout/SidebarTree.tsx`)
   - Below `md`: sidebar becomes a slide-over drawer, triggered by a hamburger icon added to the header. The drawer contains the subject/chapter/topic tree (currently in `SidebarTree`) plus the nav links that are currently hidden below `sm` (Bookmarks, Archive) — nothing that exists in the header today should become permanently inaccessible on small screens.
   - At `md` and above: current persistent/collapsible sidebar behavior is unchanged.
   - The fixed `max-w-7xl mx-auto` wrapper around the shell's content area (`AppShell.tsx`) is removed/loosened so pages can opt into fluid vs. capped width per the philosophy above, rather than the shell imposing one width for everything.

2. **Cards & grids** (`components/cards/SubjectCard.tsx`, `ChapterCard.tsx`, `TopicCard.tsx`, `components/AttachmentsPanel.tsx`, dashboard/subject/chapter pages)
   - Existing responsive grid classes (e.g. `sm:grid-cols-2 lg:grid-cols-3`) are extended with additional steps at `xl`/`2xl` so column count keeps growing on large screens instead of leaving 3 huge cards stretched across an ultra-wide monitor.

3. **Topic detail page** (`app/topic/[id]/page.tsx`)
   - The header row (title + revision badge + bookmark star + "Mark as Revised" button) currently assumes a single line and will overflow on narrow viewports. It needs to wrap or stack vertically below a breakpoint instead of overflowing/clipping.
   - Editor `split` mode (`components/editor/MarkdownEditor.tsx`) already stacks to one column below `md` — kept as-is.

4. **Modals/overlays** (`components/CommandPalette.tsx`, maximized state of `MarkdownEditor.tsx`)
   - Already reasonably responsive (`max-w-xl`, `sm:inset-5`); only minor padding/tap-target adjustments needed, no structural change.

5. **Auth pages** (`app/(auth)/login/page.tsx`, `app/(auth)/register/page.tsx`)
   - Constrained-width form card, centered at all viewport sizes; padding/spacing tuning only, no structural change.

6. **Touch targets & drag-and-drop**
   - Interactive icon buttons/controls sized for a minimum ~40px touch target on small screens where currently smaller.
   - `components/dnd/DndProvider.tsx` uses `PointerSensor` with a 6px activation distance, which already works across mouse/touch/pen. Add a short activation delay specifically for touch input so initiating a drag doesn't conflict with vertical page scrolling on a touchscreen. This is a small sensor-config tweak, not a rewrite of drag/drop logic.

### Explicitly out of scope

- No new dependencies (no container-query polyfill, no separate mobile framework).
- No dark/light theme changes.
- No changes to the data model, store, or drag-and-drop reordering logic beyond the touch-scroll activation-delay tweak.
- No change to `docker-compose.yml`'s runtime behavior beyond the Part 1 rename.

### Testing / verification

- Existing component tests (`*.test.tsx`) should continue to pass unchanged — this is a styling/layout pass, not a behavior change, so no test logic should need to change except where a test asserts on a class name or DOM structure that responsive changes directly alter (e.g. sidebar becoming a drawer may change how `SidebarTree` renders/is queried in tests).
- Manual verification across representative viewport widths (phone ~375px, tablet ~768px, laptop ~1280px, external monitor ~1920px+) using browser dev tools, checking: sidebar drawer open/close on mobile, grid column counts at each tier, topic page header wrapping, editor split-mode stacking, modal sizing, touch drag-and-drop on a touch-emulated viewport.
