# Frontend Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out the remaining `docs/frontend-upgrade-plan.md` items and fix the mobile P2 tier found by auditing the running app.

**Architecture:** Four shared primitives land first (`.touch-target` CSS, `IconButton`, `Skeleton`, `Sparkline`) and every later task consumes them. Touch fixes split two ways: isolated controls keep their drawn size and gain a 44×44 `::after` hit box; dense clusters where those boxes would overlap get genuinely resized. The full-screen hydration gate moves inside the shell so chrome paints immediately.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript strict, Tailwind v4 (`@theme` map in `globals.css`), Zustand, framer-motion, dnd-kit, Vitest + @testing-library/react, Playwright (audit harness only).

**Spec:** [`docs/superpowers/specs/2026-08-01-frontend-completion-design.md`](../specs/2026-08-01-frontend-completion-design.md)

## Global Constraints

- Run all commands from `apps/frontend/`. Tests: `npx vitest run <path>`. Full suite: `npm test`.
- Finish with `npx tsc --noEmit` and `npm run lint` clean.
- Branch is `frontend-completion`, already created off `master`. Commit per task.
- Never `git add -A` — two untracked files (`docs/code-review-2026-07-19.md`, `scripts/seed-demo-user.mjs`) must stay untracked. Add explicit paths only.
- Tests import `{ it, expect }` (and `describe`/`vi` as needed) from `vitest`, `{ render, screen }` from `@testing-library/react`, matching existing `*.test.tsx` files.
- Reuse `globals.css` tokens (`--ground`, `--panel`, `--ink`, `--accent`, `--line`, `--annotation`, `--alarm`, `--go`, `--accent-soft`). No new colour literals.
- All three themes (`engpad` default, `blueprint`, `slate`) must keep working. No palette changes in this plan.
- Touch rules are `(max-width: 767px) and (pointer: coarse)` — desktop behaviour must not change.
- jsdom has no layout engine: unit tests assert **classes and wiring**, never pixel sizes. Pixel floors are asserted by the Playwright harness in Task 16.
- Existing behaviour that must not regress: no horizontal overflow 320–430px on any route, no sub-16px form fields, drag-to-reorder keeps working, `RowActions` stays reachable.

---

## Task 1: `.touch-target` utility and global focus ring

Adds the CSS foundation. No component consumes it yet.

**Files:**
- Modify: `apps/frontend/app/globals.css` (the `----- Touch ergonomics -----` block, currently lines 183–201)

**Interfaces:**
- Produces: CSS class `.touch-target`; a global `*:focus-visible` outline rule.

- [ ] **Step 1: Add the utility and the focus ring**

In `app/globals.css`, immediately after the existing `button.dim-chip:active` rule (line 201), insert:

```css
/* ----- Touch target floor ------------------------------------------------ */
/* Dense drafting furniture — the editor toolbar, revision-history rows,
   calendar chevrons — is deliberately small and must keep its drawn size, so
   the *hit area* is floored instead: a centred pseudo-element of at least
   44x44 that grows with the element.

   Coarse pointers only. On a mouse the drawn box is already the right target,
   and an invisible 44px box would swallow clicks meant for its neighbours.

   Two ways this fails silently, both checked by scripts/mobile-audit.mjs:
   an ancestor with overflow:hidden clips the box, and a control that already
   uses ::after for decoration will have its decoration replaced. Either case
   takes the real-resize path instead. */
@media (max-width: 767px) and (pointer: coarse) {
  .touch-target { position: relative; }
  .touch-target::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 100%;
    height: 100%;
    min-width: 44px;
    min-height: 44px;
  }
}

/* ----- Focus ring -------------------------------------------------------- */
/* One visible ring for every interactive element. Undo/Redo shipped without
   one; a global rule means the next control can't. outline (not box-shadow)
   so it follows each element's own border-radius. */
*:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

- [ ] **Step 2: Verify the app still builds and looks unchanged**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean. No visual change yet — nothing uses `.touch-target`.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/app/globals.css
git commit -m "feat(a11y): touch-target hit-area utility + global focus-visible ring"
```

---

## Task 2: `IconButton` primitive

An icon-only button that cannot be written without an accessible name.

**Files:**
- Create: `apps/frontend/components/ui/IconButton.tsx`
- Test: `apps/frontend/components/ui/IconButton.test.tsx`

**Interfaces:**
- Consumes: `.touch-target` (Task 1).
- Produces:
  ```ts
  interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'title'> {
    label: string;                      // required accessible name
    size?: 'compact' | 'regular';       // default 'compact'
  }
  const IconButton: React.ForwardRefExoticComponent<IconButtonProps & React.RefAttributes<HTMLButtonElement>>
  ```
  `compact` keeps the drawn box small and floors only the hit area. `regular` also floors the drawn box at 44px (`min-h-11 min-w-11`) — for controls that are not in a dense cluster and look better bigger.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/frontend/components/ui/IconButton.test.tsx
import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IconButton } from './IconButton';

it('exposes label as the accessible name and as a tooltip', () => {
  render(<IconButton label="Clear plan"><span aria-hidden>x</span></IconButton>);
  const btn = screen.getByRole('button', { name: 'Clear plan' });
  expect(btn).toHaveAttribute('title', 'Clear plan');
});

it('applies the touch-target hit-area class', () => {
  render(<IconButton label="Undo"><span aria-hidden>u</span></IconButton>);
  expect(screen.getByRole('button', { name: 'Undo' }).className).toContain('touch-target');
});

it('compact keeps the drawn box small, regular floors it at 44px', () => {
  const { rerender } = render(<IconButton label="A"><span /></IconButton>);
  expect(screen.getByRole('button', { name: 'A' }).className).not.toContain('min-h-11');
  rerender(<IconButton label="A" size="regular"><span /></IconButton>);
  expect(screen.getByRole('button', { name: 'A' }).className).toContain('min-h-11');
});

it('defaults to type=button so it never submits a surrounding form', () => {
  render(<IconButton label="Delete"><span /></IconButton>);
  expect(screen.getByRole('button', { name: 'Delete' })).toHaveAttribute('type', 'button');
});

it('forwards clicks and extra props', async () => {
  const onClick = vi.fn();
  render(<IconButton label="Redo" onClick={onClick} disabled={false} data-testid="redo"><span /></IconButton>);
  await userEvent.click(screen.getByTestId('redo'));
  expect(onClick).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/ui/IconButton.test.tsx`
Expected: FAIL — cannot resolve `./IconButton`.

- [ ] **Step 3: Implement**

```tsx
// apps/frontend/components/ui/IconButton.tsx
'use client';
import { forwardRef } from 'react';

export interface IconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'title'> {
  /**
   * Accessible name. Required on purpose: an icon-only button without one is
   * unusable with a screen reader, and every sub-44px control the mobile audit
   * found was hand-rolled. Sets both aria-label and the native tooltip.
   */
  label: string;
  /**
   * 'compact' keeps the drawn box at its dense drafting size and floors only
   * the hit area (via .touch-target). 'regular' also floors the drawn box —
   * use it where the control is isolated and reads better bigger.
   */
  size?: 'compact' | 'regular';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton({ label, size = 'compact', className = '', children, ...rest }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        title={label}
        className={`touch-target grid place-items-center rounded-md transition ${
          size === 'regular' ? 'min-h-11 min-w-11 p-2.5' : 'p-1.5'
        } ${className}`}
        {...rest}
      >
        {children}
      </button>
    );
  },
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/ui/IconButton.test.tsx`
Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/components/ui/IconButton.tsx apps/frontend/components/ui/IconButton.test.tsx
git commit -m "feat(ui): IconButton primitive with required accessible label"
```

---

## Task 3: `Skeleton` primitive

**Files:**
- Create: `apps/frontend/components/ui/Skeleton.tsx`
- Test: `apps/frontend/components/ui/Skeleton.test.tsx`
- Modify: `apps/frontend/app/globals.css` (add the shimmer keyframes)

**Interfaces:**
- Produces: `Skeleton({ className }: { className?: string })` — a block with `aria-hidden="true"` and class `skeleton`. Callers size it with Tailwind classes.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/frontend/components/ui/Skeleton.test.tsx
import { it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Skeleton } from './Skeleton';

it('is hidden from assistive tech — it conveys no information', () => {
  const { container } = render(<Skeleton />);
  expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
});

it('carries the skeleton class and merges caller sizing', () => {
  const { container } = render(<Skeleton className="h-4 w-32" />);
  const el = container.firstChild as HTMLElement;
  expect(el.className).toContain('skeleton');
  expect(el.className).toContain('h-4');
  expect(el.className).toContain('w-32');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/ui/Skeleton.test.tsx`
Expected: FAIL — cannot resolve `./Skeleton`.

- [ ] **Step 3: Implement the component**

```tsx
// apps/frontend/components/ui/Skeleton.tsx
// A pending-content placeholder. Purely decorative — aria-hidden so screen
// readers announce the real content when it arrives instead of a row of boxes.
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton rounded-md ${className}`} />;
}
```

- [ ] **Step 4: Add the shimmer to globals.css**

Append after the focus-ring rule added in Task 1:

```css
/* ----- Skeletons --------------------------------------------------------- */
.skeleton {
  background: linear-gradient(90deg, var(--panel) 25%, var(--panel-2) 37%, var(--panel) 63%);
  background-size: 400% 100%;
  animation: skeleton-sheen 1.4s ease-in-out infinite;
}
@keyframes skeleton-sheen {
  0% { background-position: 100% 50%; }
  100% { background-position: 0 50%; }
}
/* A shimmer is motion. Users who asked for less of it get a static block. */
@media (prefers-reduced-motion: reduce) {
  .skeleton { animation: none; }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run components/ui/Skeleton.test.tsx`
Expected: 2 passing.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/components/ui/Skeleton.tsx apps/frontend/components/ui/Skeleton.test.tsx apps/frontend/app/globals.css
git commit -m "feat(ui): Skeleton primitive with reduced-motion fallback"
```

---

## Task 4: `Sparkline` primitive, replacing duplicated `ActivityBars`

Closes the last open item of upgrade-plan Phase 7. `ActivityBars` is currently defined **twice** — `app/coaching/page.tsx:31` and `app/coaching/[groupId]/[userId]/page.tsx`.

**Files:**
- Create: `apps/frontend/components/insights/Sparkline.tsx`
- Test: `apps/frontend/components/insights/Sparkline.test.tsx`
- Modify: `apps/frontend/app/coaching/page.tsx` (delete local `ActivityBars`, import `Sparkline`)
- Modify: `apps/frontend/app/coaching/[groupId]/[userId]/page.tsx` (same)

**Interfaces:**
- Produces:
  ```ts
  interface SparklinePoint { day: string; revisions: number }
  function Sparkline(props: { points: SparklinePoint[]; label: string; className?: string }): JSX.Element
  ```

- [ ] **Step 1: Write the failing test**

```tsx
// apps/frontend/components/insights/Sparkline.test.tsx
import { it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sparkline } from './Sparkline';

const points = [
  { day: '2026-07-01', revisions: 2 },
  { day: '2026-07-02', revisions: 0 },
  { day: '2026-07-03', revisions: 5 },
];

it('exposes one accessible image with the caller label', () => {
  render(<Sparkline points={points} label="Cohort revision activity" />);
  expect(screen.getByRole('img', { name: /Cohort revision activity/ })).toBeInTheDocument();
});

it('summarises the range in the accessible name so it is not an empty image', () => {
  render(<Sparkline points={points} label="Activity" />);
  const el = screen.getByRole('img');
  expect(el.getAttribute('aria-label')).toMatch(/7 revisions/);
});

it('emphasises the final point', () => {
  const { container } = render(<Sparkline points={points} label="Activity" />);
  expect(container.querySelectorAll('[data-endpoint="true"]')).toHaveLength(1);
});

it('renders one bar per point', () => {
  const { container } = render(<Sparkline points={points} label="Activity" />);
  expect(container.querySelectorAll('[data-bar]')).toHaveLength(3);
});

it('survives an all-zero series without dividing by zero', () => {
  const { container } = render(
    <Sparkline points={[{ day: 'a', revisions: 0 }, { day: 'b', revisions: 0 }]} label="Activity" />,
  );
  expect(container.querySelectorAll('[data-bar]')).toHaveLength(2);
});

it('renders nothing for an empty series', () => {
  const { container } = render(<Sparkline points={[]} label="Activity" />);
  expect(container.querySelector('[data-bar]')).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/insights/Sparkline.test.tsx`
Expected: FAIL — cannot resolve `./Sparkline`.

- [ ] **Step 3: Implement**

```tsx
// apps/frontend/components/insights/Sparkline.tsx
'use client';

export interface SparklinePoint {
  day: string;
  revisions: number;
}

/**
 * Daily-activity sparkline: a baseline rule the bars sit on, a faint mid grid
 * line for scale, and an emphasised final bar so "where are we now" reads at a
 * glance. Replaces the bare bar list that was duplicated across both coaching
 * pages.
 */
export function Sparkline({
  points,
  label,
  className = '',
}: {
  points: SparklinePoint[];
  label: string;
  className?: string;
}) {
  const max = Math.max(1, ...points.map((p) => p.revisions));
  const total = points.reduce((sum, p) => sum + p.revisions, 0);
  const last = points.length > 0 ? points[points.length - 1] : undefined;

  return (
    <div className={`glass bp-ticks relative rounded-xl p-4 ${className}`}>
      <div className="tblabel mb-2 flex items-baseline justify-between gap-2">
        <span>{label}</span>
        {last && (
          <span className="bp-figure text-xs text-ink-dim">
            {last.revisions} today
          </span>
        )}
      </div>
      <div
        role="img"
        aria-label={`${label}: ${total} revisions over ${points.length} days, peak ${max} in a day`}
        className="relative flex h-24 items-end gap-1"
      >
        {/* Mid-scale grid line — gives the bars something to be measured against. */}
        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-line" />
        {points.map((p, i) => {
          const isLast = i === points.length - 1;
          return (
            <span
              key={p.day}
              data-bar=""
              data-endpoint={isLast ? 'true' : undefined}
              title={`${p.day}: ${p.revisions}`}
              className={`relative z-10 w-2 rounded-t ${isLast ? 'bg-accent' : 'bg-accent/45'}`}
              style={{ height: `${Math.max(2, Math.round((p.revisions / max) * 100))}%` }}
            />
          );
        })}
      </div>
      {/* Baseline the bars stand on. */}
      <div aria-hidden className="mt-0 h-px w-full bg-line-strong" />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/insights/Sparkline.test.tsx`
Expected: 6 passing.

- [ ] **Step 5: Replace both `ActivityBars` copies**

In `app/coaching/page.tsx`: delete the local `function ActivityBars(...)` (starts line 31, ends line 48), add `import { Sparkline } from '@/components/insights/Sparkline';`, and replace the usage at line 151:

```tsx
<Sparkline points={summary.activity} label="Revision activity (last 30 days)" />
```

Do the identical replacement in `app/coaching/[groupId]/[userId]/page.tsx` — find its local `ActivityBars` definition and usage with `grep -n "ActivityBars" 'app/coaching/[groupId]/[userId]/page.tsx'`.

- [ ] **Step 6: Verify no `ActivityBars` remains and coaching tests pass**

Run: `grep -rn "ActivityBars" app/ components/ ; npx vitest run app/coaching`
Expected: grep prints nothing; coaching tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/components/insights/Sparkline.tsx apps/frontend/components/insights/Sparkline.test.tsx "apps/frontend/app/coaching/page.tsx" "apps/frontend/app/coaching/[groupId]/[userId]/page.tsx"
git commit -m "feat(insights): Sparkline primitive replaces duplicated ActivityBars"
```

---

## Task 5: Header chrome touch targets (P2-1)

The six controls the audit found sub-44px on **every** route: logo 28×28, Search 36×40, Undo/Redo 42×42, Settings 40×40, Sign out 38×38.

**Files:**
- Modify: `apps/frontend/components/layout/HeaderControls.tsx:24-27`
- Modify: `apps/frontend/components/layout/AppShell.tsx:35-55` (logo link), `:74-95` (Settings, Sign out)
- Modify: `apps/frontend/components/CommandPalette.tsx:44-49` (trigger button)
- Test: `apps/frontend/components/layout/HeaderControls.test.tsx`

**Interfaces:**
- Consumes: `IconButton` (Task 2), `.touch-target` (Task 1).

These are all isolated controls separated by `gap-2` (8px) — but Undo and Redo sit adjacent, so check: two 42×42 boxes with an 8px gap need only 1px growth each to reach 44. No overlap. Pseudo-element path is safe for all six.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/frontend/components/layout/HeaderControls.test.tsx
import { it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HeaderControls } from './HeaderControls';

it('undo and redo carry the touch-target hit-area floor', () => {
  render(<HeaderControls />);
  for (const name of ['Undo', 'Redo']) {
    expect(screen.getByRole('button', { name }).className).toContain('touch-target');
  }
});

it('undo and redo keep their disabled state when there is no history', () => {
  render(<HeaderControls />);
  expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/layout/HeaderControls.test.tsx`
Expected: FAIL — className does not contain `touch-target`.

- [ ] **Step 3: Convert `HeaderControls` to `IconButton`**

Replace lines 24–27 of `components/layout/HeaderControls.tsx`:

```tsx
      <IconButton label="Undo" disabled={!canUndo} onClick={undo}
        className="border border-line text-ink-dim hover:border-line-strong hover:bg-panel hover:text-ink disabled:opacity-30 p-3 md:p-2"><Undo2 size={16} /></IconButton>
      <IconButton label="Redo" disabled={!canRedo} onClick={redo}
        className="border border-line text-ink-dim hover:border-line-strong hover:bg-panel hover:text-ink disabled:opacity-30 p-3 md:p-2"><Redo2 size={16} /></IconButton>
```

and add at the top: `import { IconButton } from '@/components/ui/IconButton';`

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/layout/HeaderControls.test.tsx`
Expected: 2 passing.

- [ ] **Step 5: Apply the same treatment to the remaining four header controls**

`components/layout/AppShell.tsx` — add `className="touch-target"` to the brand `Link` (line 35, keep all existing classes) and convert the Settings link and Sign-out button. The Settings link is an `<a>`, not a button, so it takes the class directly rather than `IconButton`:

```tsx
                  <Link
                    href="/settings"
                    title="Settings"
                    aria-label="Settings"
                    className="touch-target grid place-items-center rounded-md p-3 text-ink-dim transition hover:bg-panel hover:text-accent active:bg-panel-2 active:text-accent md:p-2"
                  >
                    <Settings size={16} />
                  </Link>
```

For Sign out (line 82), add `touch-target` to the existing `sidebar-logout-btn` class:

```tsx
                  <button
                    id="header-logout-btn"
                    onClick={logout}
                    className="sidebar-logout-btn touch-target"
                    title="Sign out"
                    aria-label="Sign out"
                  >
```

`components/CommandPalette.tsx` line 44 — add `touch-target` to the trigger's className, keeping everything else:

```tsx
      <button onClick={() => setOpen(true)} aria-label="Search"
        className="touch-target tblabel flex items-center gap-2 rounded-md border border-line px-2.5 py-3 text-ink-dim transition hover:border-line-strong hover:text-ink active:bg-panel-2 active:text-ink md:py-1.5">
```

- [ ] **Step 6: Verify nothing regressed**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/components/layout/HeaderControls.tsx apps/frontend/components/layout/HeaderControls.test.tsx apps/frontend/components/layout/AppShell.tsx apps/frontend/components/CommandPalette.tsx
git commit -m "fix(mobile): P2 header chrome clears the 44px touch floor on every route"
```

---

## Task 6: Topic page controls (P2-2)

The worst surface: 30 sub-44px body controls. Two are worse than small —
`Clear plan` is **7×16**, and the revision-history edit/delete buttons are
`opacity-0` until `group-hover`, so on a touch device they are **invisible as
well as 21×21**.

**Files:**
- Modify: `apps/frontend/app/topic/[id]/page.tsx:50-52` (bookmark), `:59-64` (Clear plan chip)
- Modify: `apps/frontend/components/RevisionHistoryPanel.tsx:68-71`
- Modify: `apps/frontend/components/AttachmentsPanel.tsx` (Remove attachment, 22×22)
- Test: `apps/frontend/components/RevisionHistoryPanel.test.tsx` (extend existing)

**Interfaces:**
- Consumes: `IconButton` (Task 2), `.touch-target` (Task 1).

- [ ] **Step 1: Write the failing test**

Append to `apps/frontend/components/RevisionHistoryPanel.test.tsx`:

```tsx
it('row actions are always visible on touch, not hover-gated', () => {
  const topic = {
    id: 't1', chapterId: 'c1', title: 'T', notes: '', tagIds: [], attachments: [], flashcards: [],
    revisionHistory: [{ id: 'r1', timestamp: Date.now() }],
  } as never;
  render(<RevisionHistoryPanel topic={topic} />);
  const edit = screen.getByRole('button', { name: 'Edit revision time' });
  // opacity-0 + group-hover:opacity-100 makes the control unreachable on a
  // device with no hover. It must be visible by default and merely dim.
  expect(edit.className).not.toContain('opacity-0');
  expect(edit.className).toContain('touch-target');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/RevisionHistoryPanel.test.tsx`
Expected: FAIL — className contains `opacity-0`.

- [ ] **Step 3: Fix the revision-history actions**

Replace lines 68–71 of `components/RevisionHistoryPanel.tsx`. Add `import { IconButton } from '@/components/ui/IconButton';` at the top, then:

```tsx
                  <IconButton label="Edit revision time" onClick={() => setEditingId(r.id)}
                    className="p-1 text-ink-dim opacity-60 transition-opacity hover:bg-white/10 hover:opacity-100 focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"><Pencil size={13} /></IconButton>
                  <IconButton label="Delete revision" onClick={() => remove(r.id, n, r.timestamp)}
                    className="p-1 text-ink-dim opacity-60 transition-opacity hover:bg-white/10 hover:opacity-100 focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"><Trash2 size={13} /></IconButton>
```

The `md:` prefix preserves the desktop reveal-on-hover behaviour while making the controls permanently visible (at 60% opacity) on phones.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/RevisionHistoryPanel.test.tsx`
Expected: all passing.

- [ ] **Step 5: Fix the 7×16 Clear plan button and the bookmark toggle**

In `app/topic/[id]/page.tsx`, add `import { IconButton } from '@/components/ui/IconButton';` and replace lines 59–64:

```tsx
            {topic.plannedAt != null && (
              <span className="dim-chip flex items-center gap-1.5 text-ink-dim">
                Planned · {new Date(topic.plannedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                <IconButton label="Clear plan" onClick={() => clearPlan(topic.id)}
                  className="-mr-1 p-0.5 text-base leading-none transition hover:text-alarm">×</IconButton>
              </span>
            )}
```

and the bookmark toggle at lines 50–52:

```tsx
            <IconButton label="Toggle bookmark" onClick={() => toggleBookmark(topic.id)}
              className="rounded-lg p-2.5 hover:bg-white/10 active:bg-white/10 md:p-1.5">
              <Star size={18} className={topic.bookmarkedAt ? 'fill-amber-400 text-amber-400' : 'opacity-60'} />
            </IconButton>
```

- [ ] **Step 6: Fix the attachment remove button**

Find it: `grep -n "Remove attachment" components/AttachmentsPanel.tsx`. Convert that `<button>` to `IconButton` with `label="Remove attachment"`, keeping its existing className and appending nothing else — `IconButton` supplies `touch-target`.

- [ ] **Step 7: Fix the tag chips (66×24)**

`components/TagPicker.tsx` line 20–21 rolls its own chip instead of using
`.dim-chip`, which is why the `button.dim-chip { min-height: 2.75rem }` rule
added in P0 never reached it. Give it a real 44px floor on phones:

```tsx
            <button key={id} onClick={() => toggleTopicTag(topic.id, id)}
              className="min-h-11 rounded-full px-3 text-xs transition md:min-h-0 md:px-2.5 md:py-1"
```

Keep the existing `style` prop (the per-tag colour) exactly as it is.

- [ ] **Step 8: Verify**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add "apps/frontend/app/topic/[id]/page.tsx" apps/frontend/components/RevisionHistoryPanel.tsx apps/frontend/components/RevisionHistoryPanel.test.tsx apps/frontend/components/AttachmentsPanel.tsx apps/frontend/components/TagPicker.tsx
git commit -m "fix(mobile): P2 topic page — 7x16 Clear plan, hover-gated revision actions, tag chips"
```

---

## Task 7: Editor toolbar — real resize, not hit-area expansion (P2-3)

13 buttons at 31×31 with `gap-0.5` (2px). Their 44px hit boxes would overlap by
~13px each side and steal each other's taps, so this cluster takes the
**resize** path: real 44px buttons on phones, in a horizontally scrollable row.

**Files:**
- Modify: `apps/frontend/components/editor/MarkdownEditor.tsx:76` (the shared `ToolBtn`), `:81-82` (toolbar row), `:96-99` (mode toggles), `:101-106` (Maximize)
- Test: `apps/frontend/components/editor/MarkdownEditor.test.tsx` (extend existing)

**Interfaces:**
- Consumes: nothing from earlier tasks — deliberately not `IconButton`, because
  these need a real 44px box, which is `IconButton`'s `size="regular"`… but they
  also need the scroll container, so they stay local. Use `IconButton` with
  `size="regular"` for the buttons themselves.

- [ ] **Step 1: Write the failing test**

Append to `apps/frontend/components/editor/MarkdownEditor.test.tsx`:

```tsx
it('toolbar buttons are real 44px targets on phones, not hit-area expanded', () => {
  render(<MarkdownEditor value="" onChange={() => {}} topicId="t1" />);
  const bold = screen.getByRole('button', { name: 'Bold' });
  // Dense cluster: expanded ::after boxes would overlap, so the drawn box grows.
  expect(bold.className).toContain('min-h-11');
  expect(bold.className).toContain('min-w-11');
});

it('the toolbar row scrolls horizontally instead of wrapping into the notes', () => {
  const { container } = render(<MarkdownEditor value="" onChange={() => {}} topicId="t1" />);
  const row = container.querySelector('[data-toolbar]');
  expect(row).not.toBeNull();
  expect(row!.className).toContain('overflow-x-auto');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/editor/MarkdownEditor.test.tsx`
Expected: FAIL — no `min-h-11`, no `[data-toolbar]`.

- [ ] **Step 3: Resize the buttons**

Replace the `ToolBtn` helper at line 76 of `components/editor/MarkdownEditor.tsx`. Add `import { IconButton } from '@/components/ui/IconButton';` at the top, then:

```tsx
    <IconButton label={title} onClick={onClick} size="regular"
      className="opacity-70 hover:bg-white/10 hover:opacity-100 active:bg-white/15 active:opacity-100 md:min-h-0 md:min-w-0 md:p-1.5">{children}</IconButton>
```

`size="regular"` gives the 44px floor; `md:min-h-0 md:min-w-0 md:p-1.5` restores the dense desktop toolbar.

- [ ] **Step 4: Make the row scrollable instead of wrapping**

Replace line 82 (`<div className="flex flex-wrap items-center gap-0.5">`):

```tsx
        <div data-toolbar className="-mx-1 flex items-center gap-0.5 overflow-x-auto px-1 [scrollbar-width:none] md:flex-wrap md:overflow-x-visible">
```

Wrapping 13 × 44px buttons would push the notes field far down the screen; scrolling keeps the editor usable. Desktop keeps wrapping.

- [ ] **Step 5: Fix the mode toggles and Maximize**

Line 98, mode toggle buttons — the `edit`/`split`/`preview` row measured 36px tall:

```tsx
              <button key={m} onClick={() => setMode(m)} className={`min-h-11 rounded px-3 capitalize md:min-h-0 md:px-2 md:py-1 ${mode === m ? 'bg-white/15' : 'opacity-60 hover:bg-white/10 hover:opacity-100 active:bg-white/10'}`}>{m}</button>
```

Line 101–106, Maximize (28×28) — isolated, so hit-area expansion is fine. Convert to `IconButton` with `label="Maximize editor"` (read the existing `aria-label` first with `sed -n '101,107p' components/editor/MarkdownEditor.tsx` and preserve the exact label text, which toggles between maximize/minimize).

- [ ] **Step 6: Run tests**

Run: `npx vitest run components/editor && npx tsc --noEmit`
Expected: all passing.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/components/editor/MarkdownEditor.tsx apps/frontend/components/editor/MarkdownEditor.test.tsx
git commit -m "fix(mobile): P2 editor toolbar — real 44px buttons in a scrollable row"
```

---

## Task 8: Calendar controls (P2-4)

Prev/next 30×30, Today 55×26. **Next and Today are adjacent with `gap-2` (8px)** — expanding both hit boxes by 14px total would overlap by 6px, so this trio takes the resize path. The 7-column day rail is a documented exception (see Step 4).

**Files:**
- Modify: `apps/frontend/components/insights/WeekStrip.tsx:35` (`navBtn`), `:47-50` (Today)
- Modify: `apps/frontend/components/insights/MonthCalendar.tsx` (its own chevrons)
- Test: `apps/frontend/components/insights/WeekStrip.test.tsx` (create)

**Interfaces:**
- Consumes: nothing; pure class changes.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/frontend/components/insights/WeekStrip.test.tsx
import { it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WeekStrip } from './WeekStrip';

const noLoads = new Map();

it('week nav buttons are real 44px targets — their hit boxes would otherwise overlap Today', () => {
  render(<WeekStrip loads={noLoads} now={Date.parse('2026-08-01T10:00:00Z')} />);
  for (const name of ['Previous week', 'Next week']) {
    expect(screen.getByRole('button', { name }).className).toContain('h-11');
  }
  expect(screen.getByRole('button', { name: 'Today' }).className).toContain('min-h-11');
});

it('still renders seven day buttons', () => {
  render(<WeekStrip loads={noLoads} now={Date.parse('2026-08-01T10:00:00Z')} />);
  expect(screen.getAllByRole('button').filter((b) => /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) \d+/.test(b.getAttribute('aria-label') ?? ''))).toHaveLength(7);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/insights/WeekStrip.test.tsx`
Expected: FAIL — `h-[30px]` not `h-11`.

- [ ] **Step 3: Resize the nav cluster**

`components/insights/WeekStrip.tsx` line 35:

```tsx
  const navBtn = 'grid h-11 w-11 place-items-center rounded-lg border border-line text-ink-dim transition-colors hover:border-accent hover:text-accent md:h-[30px] md:w-[30px]';
```

and the Today button at lines 47–50:

```tsx
          <button type="button" onClick={goToday}
            className="min-h-11 rounded-md border border-line px-3 font-mono text-[0.66rem] uppercase tracking-wider text-ink-dim transition-colors hover:border-accent hover:text-accent md:min-h-0 md:px-2.5 md:py-1">
            Today
          </button>
```

- [ ] **Step 4: Record the day-rail exception**

The 7 day buttons measure 39×84. Seven 44px columns do not fit inside the strip's padding at 320px, and horizontal scrolling a week view would be worse than a 39px column. A 39×84 target has ample area and no vertical neighbours, so it is accepted as-is. Add this comment above the `grid grid-cols-7` div (line 54):

```tsx
      {/* Day columns measure ~39px wide at 320px. Seven 44px columns don't fit,
          and scrolling a week view is worse than a narrow column — at 39x84
          with no vertical neighbour these are comfortably tappable. Registered
          as an explicit exception in scripts/mobile-audit.mjs. */}
```

- [ ] **Step 5: Apply the same to `MonthCalendar` chevrons**

Run `grep -n "aria-label" components/insights/MonthCalendar.tsx` to find its month nav buttons, and give them the same `h-11 w-11 md:h-[30px] md:w-[30px]` treatment.

- [ ] **Step 6: Run tests**

Run: `npx vitest run components/insights && npx tsc --noEmit`
Expected: all passing.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/components/insights/WeekStrip.tsx apps/frontend/components/insights/WeekStrip.test.tsx apps/frontend/components/insights/MonthCalendar.tsx
git commit -m "fix(mobile): P2 calendar nav — 44px week/month controls"
```

---

## Task 9: Insights list rows (P2-5)

13 rows at 349×32 in `SubjectCompletion`. Rows are stacked with `gap-3.5`
(14px), so a 44px hit box grows 6px each way into a 14px gap — no overlap. Hit-area
expansion applies.

**Files:**
- Modify: `apps/frontend/components/insights/SubjectCompletion.tsx:22`
- Modify: `apps/frontend/components/insights/RankBars.tsx:31`
- Test: `apps/frontend/components/insights/SubjectCompletion.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

```tsx
// apps/frontend/components/insights/SubjectCompletion.test.tsx
import { it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SubjectCompletion } from './SubjectCompletion';

const data = {
  subjects: { s1: { id: 's1', name: 'Hydrology', colour: '#888' } },
  subjectOrder: ['s1'],
  chapters: {},
  topics: {},
  tags: {},
} as never;

it('subject rows carry the touch-target hit-area floor', () => {
  render(<SubjectCompletion data={data} now={Date.now()} />);
  expect(screen.getByRole('link', { name: /Hydrology/ }).className).toContain('touch-target');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/insights/SubjectCompletion.test.tsx`
Expected: FAIL — no `touch-target`.

- [ ] **Step 3: Add the class to both row components**

`components/insights/SubjectCompletion.tsx` line 22:

```tsx
            <Link key={s.id} href={`/subject/${s.id}`} className="touch-target group block">
```

`components/insights/RankBars.tsx` line 31:

```tsx
              <Link key={r.topicId} href={`/topic/${r.topicId}`} className="touch-target group block min-w-0">
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run components/insights`
Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/components/insights/SubjectCompletion.tsx apps/frontend/components/insights/SubjectCompletion.test.tsx apps/frontend/components/insights/RankBars.tsx
git commit -m "fix(mobile): P2 insights rows clear the touch floor"
```

---

## Task 10: Chapter and subject row controls (P2-6)

Rename/Delete 31×31 in `RowActions`, drag handle 24px wide.

**Files:**
- Modify: `apps/frontend/components/RowActions.tsx:9-11`
- Modify: `apps/frontend/components/dnd/SortableRow.tsx` (drag handle width)
- Test: `apps/frontend/components/RowActions.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

```tsx
// apps/frontend/components/RowActions.test.tsx
import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RowActions } from './RowActions';

it('rename and delete carry the touch-target floor', () => {
  render(<RowActions onRename={() => {}} onDelete={() => {}} />);
  for (const name of ['Rename', 'Delete']) {
    expect(screen.getByRole('button', { name }).className).toContain('touch-target');
  }
});

it('duplicate only renders when a handler is supplied', () => {
  const { rerender } = render(<RowActions onRename={() => {}} onDelete={() => {}} />);
  expect(screen.queryByRole('button', { name: 'Duplicate' })).toBeNull();
  rerender(<RowActions onRename={() => {}} onDelete={() => {}} onDuplicate={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Duplicate' })).toBeInTheDocument();
});

it('suppresses the parent link navigation when an action is pressed', () => {
  const onRename = vi.fn();
  render(<RowActions onRename={onRename} onDelete={() => {}} />);
  const evt = new MouseEvent('click', { bubbles: true, cancelable: true });
  screen.getByRole('button', { name: 'Rename' }).dispatchEvent(evt);
  expect(onRename).toHaveBeenCalledOnce();
  expect(evt.defaultPrevented).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/RowActions.test.tsx`
Expected: FAIL — no `touch-target`.

- [ ] **Step 3: Convert `RowActions` to `IconButton`**

Replace the body of `components/RowActions.tsx`:

```tsx
'use client';
import { Pencil, Trash2, Copy } from 'lucide-react';
import { IconButton } from '@/components/ui/IconButton';

export function RowActions({ onRename, onDelete, onDuplicate }: {
  onRename: () => void; onDelete: () => void; onDuplicate?: () => void;
}) {
  const cls = 'p-2 hover:bg-white/10 active:bg-white/15 md:p-1.5';
  return (
    <div className="flex items-center gap-1 opacity-100 transition md:opacity-0 md:group-hover:opacity-100">
      <IconButton label="Rename" onClick={(e) => { e.preventDefault(); onRename(); }} className={cls}><Pencil size={15} /></IconButton>
      {onDuplicate && <IconButton label="Duplicate" onClick={(e) => { e.preventDefault(); onDuplicate(); }} className={cls}><Copy size={15} /></IconButton>}
      <IconButton label="Delete" onClick={(e) => { e.preventDefault(); onDelete(); }} className={cls}><Trash2 size={15} /></IconButton>
    </div>
  );
}
```

Note: three adjacent buttons at `gap-1` (4px). At 31px drawn, 44px hit boxes overlap by ~9px. **These must not use hit-area expansion.** Change `cls` to floor the drawn box on phones instead:

```tsx
  const cls = 'min-h-11 min-w-11 p-2 hover:bg-white/10 active:bg-white/15 md:min-h-0 md:min-w-0 md:p-1.5';
```

`IconButton` still applies `touch-target`, which is harmless once the drawn box is already ≥44px (the pseudo-element matches the element size).

- [ ] **Step 4: Widen the drag handle**

`components/dnd/SortableRow.tsx` line 13 — the handle gets its 24px width from
`px-1` alone. It measured 24×86. Give it a real 44px width on phones while
desktop keeps its tight gutter. Replace the className on that element:

```tsx
        className="flex w-11 cursor-grab touch-none items-center justify-center px-1 opacity-30 transition hover:opacity-70 active:cursor-grabbing md:w-auto md:justify-start"
```

`justify-center` keeps the grip icon optically centred in the now-wider column;
`md:w-auto md:justify-start` restores the original desktop layout exactly.

- [ ] **Step 5: Run tests, and confirm reorder still works**

Run: `npx vitest run components/RowActions.test.tsx components/dnd && npm test`
Expected: all passing — especially any existing drag-reorder tests.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/components/RowActions.tsx apps/frontend/components/RowActions.test.tsx apps/frontend/components/dnd/SortableRow.tsx
git commit -m "fix(mobile): P2 row actions and drag handle clear the touch floor"
```

---

## Task 11: Hydration restructure and route skeletons (P2-7)

Today `StoreHydrator` wraps `AppShell` (`app/layout.tsx:56-60`) and early-returns
a centred `Loading…` (`StoreHydrator.tsx:55-57`), so for **5127ms** on `/` under
3G/4×CPU there is no header, no tab bar, no sidebar. This moves the gate inside
the shell.

**Danger this introduces:** `app/topic/[id]/page.tsx:27`, `app/chapter/[id]`
and `app/subject/[id]` all call `notFound()` when their record is missing. Once
children render before hydration, that fires on every deep link. Each must check
`hydrated` first. This is the single most important part of the task.

**Files:**
- Modify: `apps/frontend/store/useStore.ts` (add `hydrated` state)
- Modify: `apps/frontend/components/StoreHydrator.tsx`
- Create: `apps/frontend/components/ui/RouteSkeletons.tsx`
- Modify: `apps/frontend/app/page.tsx`, `app/insights/page.tsx`, `app/topic/[id]/page.tsx`, `app/chapter/[id]/page.tsx`, `app/subject/[id]/page.tsx`
- Test: `apps/frontend/components/StoreHydrator.test.tsx` (extend existing)

**Interfaces:**
- Consumes: `Skeleton` (Task 3).
- Produces: `useStore((s) => s.hydrated): boolean`; `SubjectGridSkeleton`, `ListSkeleton`, `DetailSkeleton` from `RouteSkeletons.tsx`.

- [ ] **Step 1: Write the failing test**

Append to `apps/frontend/components/StoreHydrator.test.tsx`:

```tsx
it('renders children immediately instead of withholding the whole app', () => {
  // The old behaviour returned a centred "Loading…" in place of children,
  // which meant no header, no tab bar and no sidebar for the whole hydrate.
  render(<StoreHydrator><div data-testid="child">content</div></StoreHydrator>);
  expect(screen.getByTestId('child')).toBeInTheDocument();
  expect(screen.queryByText('Loading…')).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/StoreHydrator.test.tsx`
Expected: FAIL — child not rendered, `Loading…` present.

- [ ] **Step 3: Add `hydrated` to the store**

In `store/useStore.ts`, add to the state interface (near `hydrate:` on line 15):

```ts
  /** True once hydrate() has resolved for the current user. Drives route skeletons. */
  hydrated: boolean;
```

Add `hydrated: false,` to the initial state object, and set it at the end of the `hydrate` action (line 88). Find the end of `hydrate`'s success path and set `hydrated: true` in the same `set(...)` that installs the loaded data, so there is never a frame where data is present but `hydrated` is false. Also set `hydrated: false` at the start of `hydrate`.

- [ ] **Step 4: Stop `StoreHydrator` blocking**

Replace lines 48–58 of `components/StoreHydrator.tsx`:

```tsx
  // Always render children. The shell (header, sidebar, tab bar) depends only
  // on the session, so it can paint immediately; each route renders its own
  // skeleton for the data region while `hydrated` is false. Blocking here cost
  // 5.1s of dead screen on a throttled connection.
  return <>{children}</>;
```

and delete the now-unused local `ready` state and its `setReady` calls, replacing them with the store flag — the store is now the single source of truth. Keep the `hydratedUserRef` logic exactly as-is: it prevents cross-account data leaks and is unrelated to this change.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run components/StoreHydrator.test.tsx`
Expected: passing.

- [ ] **Step 6: Create the route skeletons**

```tsx
// apps/frontend/components/ui/RouteSkeletons.tsx
import { Skeleton } from './Skeleton';

/** Home: the subject card grid. */
export function SubjectGridSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="glass flex items-center gap-3 rounded-xl p-4">
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="mt-2 h-2 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Chapter and subject pages: a hairline row list. */
export function ListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="divide-y divide-line">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-3 px-3 py-3">
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="mt-2 h-3 w-24" />
          </div>
          <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** Topic page and insights: a title plus stacked panels. */
export function DetailSkeleton() {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <Skeleton className="h-3 w-48" />
      <Skeleton className="mt-4 h-8 w-2/3" />
      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_320px]">
        <Skeleton className="h-64 w-full rounded-xl" />
        <div className="space-y-4">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Gate each route — and fix the `notFound()` hazard**

In `app/topic/[id]/page.tsx`, add after the existing `useStore` selectors (before line 27's `if (!topic) return notFound();`):

```tsx
  const hydrated = useStore((s) => s.hydrated);
  // Children now render before the store has loaded, so a missing record means
  // "not loaded yet", not "does not exist". Without this guard every deep link
  // 404s during hydration.
  if (!hydrated) return <DetailSkeleton />;
  if (!topic) return notFound();
```

with `import { DetailSkeleton } from '@/components/ui/RouteSkeletons';`.

Apply the identical guard in `app/chapter/[id]/page.tsx` (before its `if (!chapter) return notFound();`) using `<ListSkeleton />`, and in `app/subject/[id]/page.tsx` using `<ListSkeleton />`.

In `app/page.tsx`, render `<SubjectGridSkeleton />` in place of the subject grid while `!hydrated`. In `app/insights/page.tsx`, render `<DetailSkeleton />` while `!hydrated`.

- [ ] **Step 8: Verify deep links do not 404 during hydration**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all green. Then start the dev server and hard-reload `/topic/<id>` directly — it must show the skeleton and then the topic, never a 404.

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/store/useStore.ts apps/frontend/components/StoreHydrator.tsx apps/frontend/components/StoreHydrator.test.tsx apps/frontend/components/ui/RouteSkeletons.tsx apps/frontend/app/page.tsx apps/frontend/app/insights/page.tsx "apps/frontend/app/topic/[id]/page.tsx" "apps/frontend/app/chapter/[id]/page.tsx" "apps/frontend/app/subject/[id]/page.tsx"
git commit -m "fix(mobile): paint the shell during hydration instead of a 5s dead screen"
```

---

## Task 12: Filter chips and inline search on the chapter page

Closes the "home only" caveat on upgrade-plan Phases 1–2. Chips and `FilterBar`
are complementary: chips are single-select quick states, `FilterBar` is the
multi-axis advanced filter.

**Files:**
- Modify: `apps/frontend/lib/filters/quickFilters.ts` (add `topicQuickCounts`)
- Test: `apps/frontend/lib/filters/quickFilters.test.ts` (extend existing)
- Modify: `apps/frontend/app/chapter/[id]/page.tsx`

**Interfaces:**
- Consumes: `FilterChips` (`{ options: {key,label,count?}[], value, onChange, 'aria-label'?, className? }`), `InlineSearch` (`{ onChange, placeholder?, debounceMs? }`), `useQuickFilter` (`get(key)`, `set(key, value)`), `topicMatchesQuick(topic, qf, now)`, `matchesQuery` from `@/lib/search`.
- Produces: `topicQuickCounts(topics: Topic[], now: number): Record<QuickFilter, number>`.

- [ ] **Step 1: Write the failing test**

Append to `apps/frontend/lib/filters/quickFilters.test.ts`:

```ts
import { topicQuickCounts } from './quickFilters';

it('counts topics per quick filter', () => {
  const now = Date.parse('2026-08-01T10:00:00Z');
  const mk = (over: Partial<Topic>): Topic => ({
    id: 'x', chapterId: 'c', title: 't', notes: '', tagIds: [], attachments: [],
    flashcards: [], revisionHistory: [], ...over,
  } as Topic);
  const topics = [
    mk({ id: 'a' }),                                    // never revised
    mk({ id: 'b', bookmarkedAt: now }),                 // bookmarked, never revised
    mk({ id: 'c', revisionHistory: [{ id: 'r', timestamp: now }], plannedAt: now }), // due today
  ];
  const counts = topicQuickCounts(topics, now);
  expect(counts.all).toBe(3);
  expect(counts['not-revised']).toBe(2);
  expect(counts.bookmarked).toBe(1);
  expect(counts.due).toBe(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/filters/quickFilters.test.ts`
Expected: FAIL — `topicQuickCounts` is not exported.

- [ ] **Step 3: Implement `topicQuickCounts`**

Append to `lib/filters/quickFilters.ts`:

```ts
/** Live chip counts for a topic list: how many topics match each quick filter. */
export function topicQuickCounts(topics: Topic[], now: number): Record<QuickFilter, number> {
  const counts = Object.fromEntries(QUICK_FILTERS.map((k) => [k, 0])) as Record<QuickFilter, number>;
  for (const topic of topics) {
    for (const qf of QUICK_FILTERS) {
      if (topicMatchesQuick(topic, qf, now)) counts[qf] += 1;
    }
  }
  return counts;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/filters/quickFilters.test.ts`
Expected: passing.

- [ ] **Step 5: Wire chips and search into the chapter page**

In `app/chapter/[id]/page.tsx` add imports:

```tsx
import { FilterChips } from '@/components/filters/FilterChips';
import { InlineSearch } from '@/components/filters/InlineSearch';
import { useQuickFilter } from '@/store/useQuickFilter';
import { QUICK_FILTERS, QUICK_FILTER_LABELS, topicMatchesQuick, topicQuickCounts } from '@/lib/filters/quickFilters';
import { matchesQuery } from '@/lib/search';
```

Inside the component, after `orderedTopicIds` is computed:

```tsx
  const listKey = `chapter:${id}`;
  const quick = useQuickFilter((s) => s.byList[listKey] ?? 'all');
  const setQuick = useQuickFilter((s) => s.set);
  const [query, setQuery] = useState('');
  const now = Date.now();

  const visibleTopicIds = orderedTopicIds.filter((tid) => {
    const t = topics[tid];
    if (!topicMatchesQuick(t, quick, now)) return false;
    return query.trim() === '' || matchesQuery(t.title, query);
  });
  const counts = topicQuickCounts(orderedTopicIds.map((tid) => topics[tid]), now);
```

Render above `<FilterBar />`:

```tsx
      <InlineSearch onChange={setQuery} placeholder="Search topics…" />
      <FilterChips
        aria-label="Quick filters"
        value={quick}
        onChange={(k) => setQuick(listKey, k as typeof quick)}
        options={QUICK_FILTERS.map((k) => ({ key: k, label: QUICK_FILTER_LABELS[k], count: counts[k] }))}
      />
      <FilterBar />
```

and use `visibleTopicIds` in place of `orderedTopicIds` in **both** the `SortableContext` `items` array and the `.map()` that renders `SortableRow`s, so drag indices match what is on screen.

Add an empty state when the list filters down to nothing (uses `EmptyState` from Task 14 — if executing out of order, render a plain `<p className="text-sm text-ink-faint">No topics match.</p>` and switch it in Task 14).

- [ ] **Step 6: Verify**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/lib/filters/quickFilters.ts apps/frontend/lib/filters/quickFilters.test.ts "apps/frontend/app/chapter/[id]/page.tsx"
git commit -m "feat(chapter): quick-filter chips + inline search, matching the home list"
```

---

## Task 13: One-tap revise on topic rows

Upgrade-plan extra #2. `markTopicRevised` is currently reachable only from
`TodayQueue` and the topic page.

**Files:**
- Modify: `apps/frontend/components/cards/TopicCard.tsx`
- Test: `apps/frontend/components/cards/TopicCard.test.tsx` (create)

**Interfaces:**
- Consumes: `IconButton` (Task 2), `useStore().markTopicRevised(id: string): void`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/frontend/components/cards/TopicCard.test.tsx
import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TopicCard } from './TopicCard';
import { useStore } from '@/store/useStore';

const topic = {
  id: 't1', chapterId: 'c1', title: 'Bernoulli', notes: '', tagIds: [],
  attachments: [], flashcards: [], revisionHistory: [],
} as never;

beforeEach(() => { vi.restoreAllMocks(); });

it('offers a one-tap revise action on the row', () => {
  render(<TopicCard topic={topic} />);
  expect(screen.getByRole('button', { name: 'Mark revised' })).toBeInTheDocument();
});

it('marks the topic revised without navigating to the topic page', async () => {
  const markTopicRevised = vi.fn();
  vi.spyOn(useStore, 'getState').mockReturnValue({
    ...useStore.getState(), markTopicRevised,
  } as never);
  render(<TopicCard topic={topic} />);
  const evt = screen.getByRole('button', { name: 'Mark revised' });
  await userEvent.click(evt);
  expect(markTopicRevised).toHaveBeenCalledWith('t1');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/cards/TopicCard.test.tsx`
Expected: FAIL — no button named `Mark revised`.

- [ ] **Step 3: Implement**

In `components/cards/TopicCard.tsx`, add `CheckCircle2` to the lucide import, `import { IconButton } from '@/components/ui/IconButton';`, and pull the action:

```tsx
  const { renameTopic, archiveTopic, markTopicRevised } = useStore.getState();
```

Insert before `<RowActions .../>` in the right-hand control cluster (line 39):

```tsx
        <IconButton
          label="Mark revised"
          onClick={(e) => { e.preventDefault(); markTopicRevised(topic.id); }}
          className="min-h-11 min-w-11 text-ink-dim hover:bg-white/10 hover:text-go active:bg-white/15 md:min-h-0 md:min-w-0"
        >
          <CheckCircle2 size={16} />
        </IconButton>
```

`e.preventDefault()` is required — the whole row is a `Link`, and without it the tap navigates. The drawn box is floored at 44px rather than hit-area expanded because this button sits `gap-2.5` (10px) from `RowActions`, and two expanded boxes would overlap.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/cards/TopicCard.test.tsx`
Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/components/cards/TopicCard.tsx apps/frontend/components/cards/TopicCard.test.tsx
git commit -m "feat(topics): one-tap mark-revised on list rows"
```

---

## Task 14: Streak widget on home and a shared `EmptyState`

Upgrade-plan extras #3 and #4. `lib/insights/streak.ts` already exports
`currentStreak(data, now)` and `longestStreak(data)`, consumed only by
`/insights` and `/coaching`.

**Files:**
- Create: `apps/frontend/components/ui/EmptyState.tsx`
- Test: `apps/frontend/components/ui/EmptyState.test.tsx`
- Create: `apps/frontend/components/StreakCard.tsx`
- Test: `apps/frontend/components/StreakCard.test.tsx`
- Modify: `apps/frontend/app/page.tsx` (mount `StreakCard`, replace the ad-hoc empty message at line 89)

**Interfaces:**
- Consumes: `currentStreak`, `longestStreak` from `@/lib/insights/streak`; `Sparkline` (Task 4) is **not** used here — the streak card is numeric.
- Produces: `EmptyState({ title, hint }: { title: string; hint?: string })`, `StreakCard()`.

- [ ] **Step 1: Write the failing tests**

```tsx
// apps/frontend/components/ui/EmptyState.test.tsx
import { it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from './EmptyState';

it('shows the title and optional hint', () => {
  render(<EmptyState title="No topics match" hint="Try clearing a filter." />);
  expect(screen.getByText('No topics match')).toBeInTheDocument();
  expect(screen.getByText('Try clearing a filter.')).toBeInTheDocument();
});

it('renders without a hint', () => {
  render(<EmptyState title="Nothing here" />);
  expect(screen.getByText('Nothing here')).toBeInTheDocument();
});
```

```tsx
// apps/frontend/components/StreakCard.test.tsx
import { it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StreakCard } from './StreakCard';

it('renders nothing when there is no streak to celebrate', () => {
  const { container } = render(<StreakCard />);
  // Empty store in tests => zero streak => the card stays out of the way.
  expect(container.firstChild).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/ui/EmptyState.test.tsx components/StreakCard.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `EmptyState`**

```tsx
// apps/frontend/components/ui/EmptyState.tsx
// A blueprint-styled empty sheet. One component so every list says "nothing
// here" the same way instead of each inventing its own sentence.
export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="glass bp-ticks rounded-xl px-4 py-10 text-center">
      <p className="text-sm text-ink-dim">{title}</p>
      {hint && <p className="mt-1.5 text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Implement `StreakCard`**

```tsx
// apps/frontend/components/StreakCard.tsx
'use client';
import { Flame } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { currentStreak, longestStreak } from '@/lib/insights/streak';

/**
 * Current revision streak on the home screen. Hidden at zero — a "0 day streak"
 * badge is a reprimand, not a motivator.
 */
export function StreakCard() {
  const data = useStore();
  const now = Date.now();
  const current = currentStreak(data, now);
  if (current === 0) return null;
  const best = longestStreak(data);
  return (
    <div className="glass mb-5 flex items-center gap-3 rounded-xl px-4 py-3">
      <Flame size={18} className="shrink-0 text-annotation" />
      <div className="min-w-0">
        <span className="bp-figure text-lg text-ink">{current}</span>
        <span className="ml-1.5 text-sm text-ink-dim">day{current === 1 ? '' : 's'} in a row</span>
      </div>
      {best > current && (
        <span className="tblabel ml-auto shrink-0 text-ink-faint">best {best}</span>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run components/ui/EmptyState.test.tsx components/StreakCard.test.tsx`
Expected: 3 passing.

- [ ] **Step 6: Mount on home and replace the ad-hoc empty message**

In `app/page.tsx`: import both, render `<StreakCard />` above the subject grid (below `TodayQueue`), and replace the message at lines 88–90 with:

```tsx
              <EmptyState
                title={query.trim()
                  ? `No subjects match “${query.trim()}”.`
                  : `No subjects with ${QUICK_FILTER_LABELS[filter].toLowerCase()} topics.`}
                hint="Try a different filter, or add a subject."
              />
```

Then switch the chapter-page placeholder from Task 12 Step 5 to `<EmptyState title="No topics match." hint="Try a different filter or search." />`.

- [ ] **Step 7: Verify**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/components/ui/EmptyState.tsx apps/frontend/components/ui/EmptyState.test.tsx apps/frontend/components/StreakCard.tsx apps/frontend/components/StreakCard.test.tsx apps/frontend/app/page.tsx "apps/frontend/app/chapter/[id]/page.tsx"
git commit -m "feat(home): streak card + shared EmptyState across lists"
```

---

## Task 15: Swipe-to-reveal row actions (Phase 6b)

Deferred twice. dnd-kit's `TouchSensor` owns the same rows, so the two gestures
must never both claim a touch.

**Files:**
- Create: `apps/frontend/components/hooks/useSwipeActions.ts`
- Test: `apps/frontend/components/hooks/useSwipeActions.test.ts`
- Modify: `apps/frontend/components/cards/TopicCard.tsx`

**Interfaces:**
- Consumes: `useStore().archiveTopic(id)`, `useStore().toggleBookmark(topicId)`, `isDragging` from `useSortable` (already destructured at `components/dnd/SortableRow.tsx:7`).
- Produces:
  ```ts
  function useSwipeActions(opts: {
    onArchive: () => void;
    onBookmark: () => void;
    disabled?: boolean;      // true while a dnd drag is active
    threshold?: number;      // px before the gesture is claimed, default 12
  }): {
    offset: number;
    revealed: boolean;
    close: () => void;
    handlers: {
      onPointerDown: (e: React.PointerEvent) => void;
      onPointerMove: (e: React.PointerEvent) => void;
      onPointerUp: (e: React.PointerEvent) => void;
    };
    actions: { onArchive: () => void; onBookmark: () => void };
  }
  ```
  Plain pointer events, not framer-motion drag — framer's drag competes with
  dnd-kit's `TouchSensor` for the same pointer, which is what made this phase
  get deferred twice.

- [ ] **Step 1: Write the failing test**

```ts
// apps/frontend/components/hooks/useSwipeActions.test.ts
import { it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSwipeActions } from './useSwipeActions';

const pointer = (x: number, y: number) => ({
  clientX: x, clientY: y, pointerId: 1,
  currentTarget: { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() },
}) as never;

it('ignores a mostly-vertical drag so the page can still scroll', () => {
  const { result } = renderHook(() => useSwipeActions({ onArchive: vi.fn(), onBookmark: vi.fn() }));
  act(() => { result.current.handlers.onPointerDown(pointer(200, 100)); });
  act(() => { result.current.handlers.onPointerMove(pointer(196, 160)); });
  expect(result.current.offset).toBe(0);
});

it('claims a mostly-horizontal drag past the threshold', () => {
  const { result } = renderHook(() => useSwipeActions({ onArchive: vi.fn(), onBookmark: vi.fn() }));
  act(() => { result.current.handlers.onPointerDown(pointer(200, 100)); });
  act(() => { result.current.handlers.onPointerMove(pointer(150, 104)); });
  expect(result.current.offset).toBeLessThan(0);
});

it('reveals the actions once dragged past the reveal distance', () => {
  const { result } = renderHook(() => useSwipeActions({ onArchive: vi.fn(), onBookmark: vi.fn() }));
  act(() => { result.current.handlers.onPointerDown(pointer(300, 100)); });
  act(() => { result.current.handlers.onPointerMove(pointer(200, 102)); });
  act(() => { result.current.handlers.onPointerUp(pointer(200, 102)); });
  expect(result.current.revealed).toBe(true);
});

it('springs back when released short of the reveal distance', () => {
  const { result } = renderHook(() => useSwipeActions({ onArchive: vi.fn(), onBookmark: vi.fn() }));
  act(() => { result.current.handlers.onPointerDown(pointer(300, 100)); });
  act(() => { result.current.handlers.onPointerMove(pointer(285, 102)); });
  act(() => { result.current.handlers.onPointerUp(pointer(285, 102)); });
  expect(result.current.revealed).toBe(false);
  expect(result.current.offset).toBe(0);
});

it('does nothing at all while a reorder drag is active', () => {
  const { result } = renderHook(() => useSwipeActions({ onArchive: vi.fn(), onBookmark: vi.fn(), disabled: true }));
  act(() => { result.current.handlers.onPointerDown(pointer(300, 100)); });
  act(() => { result.current.handlers.onPointerMove(pointer(200, 100)); });
  expect(result.current.offset).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/hooks/useSwipeActions.test.ts`
Expected: FAIL — cannot resolve `./useSwipeActions`.

- [ ] **Step 3: Implement the hook**

```ts
// apps/frontend/components/hooks/useSwipeActions.ts
'use client';
import { useRef, useState, useCallback } from 'react';

const CLAIM_THRESHOLD = 12;  // px of travel before the gesture belongs to us
const REVEAL_DISTANCE = 64;  // px past which release snaps open
const MAX_OFFSET = 128;      // width of the revealed action strip

/**
 * Horizontal swipe-to-reveal for list rows.
 *
 * Three things share a touch on these rows: page scroll, dnd-kit's TouchSensor
 * (reorder), and this. The rules that keep them apart:
 *   - `disabled` is set while a reorder drag is active — we never compete.
 *   - A gesture is only claimed once it has travelled CLAIM_THRESHOLD px *and*
 *     is more horizontal than vertical; otherwise it stays with the scroller.
 *   - Once claimed, the axis is locked for the rest of the gesture.
 */
export function useSwipeActions({
  onArchive,
  onBookmark,
  disabled = false,
  threshold = CLAIM_THRESHOLD,
}: {
  onArchive: () => void;
  onBookmark: () => void;
  disabled?: boolean;
  threshold?: number;
}) {
  const [offset, setOffset] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const claimed = useRef(false);
  // Mirrors `offset` so pointerup can decide open-vs-closed without calling
  // setState from inside another setState updater (a render-phase side effect).
  const offsetRef = useRef(0);

  const applyOffset = useCallback((next: number) => {
    offsetRef.current = next;
    setOffset(next);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (disabled) return;
    start.current = { x: e.clientX, y: e.clientY };
    claimed.current = false;
  }, [disabled]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (disabled || !start.current) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    if (!claimed.current) {
      if (Math.abs(dx) < threshold) return;
      // More vertical than horizontal: this belongs to the scroller. Give up
      // for the rest of the gesture rather than fighting it.
      if (Math.abs(dy) >= Math.abs(dx)) { start.current = null; return; }
      claimed.current = true;
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    // Left-swipe only; clamp so the row can't be flung off-screen.
    applyOffset(Math.max(-MAX_OFFSET, Math.min(0, dx)));
  }, [disabled, threshold, applyOffset]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!claimed.current) { start.current = null; return; }
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    const open = offsetRef.current <= -REVEAL_DISTANCE;
    setRevealed(open);
    applyOffset(open ? -MAX_OFFSET : 0);
    start.current = null;
    claimed.current = false;
  }, [applyOffset]);

  const close = useCallback(() => { setRevealed(false); applyOffset(0); }, [applyOffset]);

  return {
    offset,
    revealed,
    close,
    handlers: { onPointerDown, onPointerMove, onPointerUp },
    actions: { onArchive, onBookmark },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/hooks/useSwipeActions.test.ts`
Expected: 5 passing.

- [ ] **Step 5: Expose drag state from `SortableRow`**

`components/dnd/SortableRow.tsx:7` already destructures `isDragging` but only
uses it for opacity. Publish it to children through context so `TopicCard` can
suppress swipe during a reorder. Add above the component:

```tsx
import { createContext, useContext } from 'react';

const DraggingContext = createContext(false);
/** True while this row is being dragged for reorder. Swipe must stand down. */
export const useRowDragging = () => useContext(DraggingContext);
```

and wrap the returned markup's `{children}` slot (line 19):

```tsx
      <div className="min-w-0 flex-1">
        <DraggingContext.Provider value={isDragging}>{children}</DraggingContext.Provider>
      </div>
```

- [ ] **Step 6: Wire the swipe into `TopicCard`**

In `components/cards/TopicCard.tsx`, add the imports and hook:

```tsx
import { Archive, Star as StarIcon } from 'lucide-react';
import { useSwipeActions } from '@/components/hooks/useSwipeActions';
import { useRowDragging } from '@/components/dnd/SortableRow';
```

```tsx
  const dragging = useRowDragging();
  const { toggleBookmark } = useStore.getState();
  const swipe = useSwipeActions({
    onArchive: () => archiveTopic(topic.id),
    onBookmark: () => toggleBookmark(topic.id),
    disabled: dragging,
  });
```

Then wrap the existing `<Link>` return value. The action strip sits *behind* the
row and is uncovered as the row slides left:

```tsx
  return (
    <div className="relative overflow-hidden">
      {/* Revealed strip. aria-hidden + tabIndex -1: RowActions already exposes
          these same actions accessibly, and announcing them twice is noise. */}
      <div aria-hidden={!swipe.revealed} className="absolute inset-y-0 right-0 flex w-32 items-stretch">
        <button tabIndex={-1} aria-label="Bookmark"
          onClick={() => { swipe.actions.onBookmark(); swipe.close(); }}
          className="flex flex-1 items-center justify-center bg-annotation/20 text-annotation">
          <StarIcon size={18} />
        </button>
        <button tabIndex={-1} aria-label="Archive"
          onClick={() => { swipe.actions.onArchive(); swipe.close(); }}
          className="flex flex-1 items-center justify-center bg-alarm/20 text-alarm">
          <Archive size={18} />
        </button>
      </div>
      <Link href={`/topic/${topic.id}`}
        {...swipe.handlers}
        style={{ transform: `translateX(${swipe.offset}px)` }}
        className="group relative flex items-center justify-between gap-3 rounded-md bg-ground px-3 py-3 transition-colors hover:bg-accent-soft active:bg-accent-soft">
        {/* ...existing row contents unchanged... */}
      </Link>
    </div>
  );
```

Two details that matter: the `Link` needs an opaque `bg-ground` or the strip
shows through it, and `transition-colors` (not `transition`) so the translate
follows the finger without easing lag.

Keep `RowActions` mounted inside the row. Swipe is undiscoverable and unavailable
to keyboard and screen-reader users; it is an accelerator, never the only path.

- [ ] **Step 7: Verify reorder still works**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all green, including existing dnd tests.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/components/hooks/useSwipeActions.ts apps/frontend/components/hooks/useSwipeActions.test.ts apps/frontend/components/cards/TopicCard.tsx apps/frontend/components/dnd/SortableRow.tsx
git commit -m "feat(mobile): swipe-to-reveal archive/bookmark on topic rows (Phase 6b)"
```

---

## Task 16: Commit the audit harness as a regression check

Turns the one-off audit into a repeatable check, so P2 does not silently return
as P3.

**Files:**
- Create: `apps/frontend/scripts/mobile-audit.mjs`
- Modify: `README.md` (document how to run it)

**Interfaces:**
- Consumes: a running stack at `http://127.0.0.1:3200` and the `demo`/`demo1234` seed account (`scripts/seed-demo-user.mjs`).

- [ ] **Step 1: Write the harness**

Create `apps/frontend/scripts/mobile-audit.mjs`. The measurement core — the part
that is easy to get wrong — is the effective hit rect, which must account for
the `.touch-target` pseudo-element:

```js
// Effective hit rect: for a .touch-target element the real target is its
// ::after box (>=44px, centred), not the border box. Everything else is
// measured as drawn.
const hitRects = () => {
  const SEL = 'button, a[href], input:not([type=hidden]), select, textarea, [role="button"], summary';
  const out = [];
  for (const el of document.querySelectorAll(SEL)) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (el.tagName === 'A' && cs.display === 'inline' && el.closest('p')) continue;

    let { width: w, height: h } = r;
    if (el.classList.contains('touch-target')) {
      const after = getComputedStyle(el, '::after');
      // min-width/min-height resolve to px in the computed style.
      w = Math.max(w, parseFloat(after.minWidth) || 0);
      h = Math.max(h, parseFloat(after.minHeight) || 0);
    }
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    out.push({
      label: (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40),
      w, h,
      left: cx - w / 2, right: cx + w / 2, top: cy - h / 2, bottom: cy + h / 2,
    });
  }
  return out;
};
```

Documented exceptions, checked by label:

```js
// Each exception needs a reason. An exception without one is a bug being hidden.
const TARGET_EXCEPTIONS = [
  { match: /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) \d+/, why: 'week rail: 7 columns cannot all be 44px at 320px; 39x84 is ample' },
];
const excused = (label) => TARGET_EXCEPTIONS.some((e) => e.match.test(label));
```

The two assertions built on it:

```js
// (a) every hit box clears 44x44
const tooSmall = rects.filter((r) => (r.w < 44 || r.h < 44) && !excused(r.label));

// (b) no two hit boxes overlap — this is what catches .touch-target applied to
// a dense cluster, where expanded boxes steal each other's taps.
const overlaps = [];
for (let i = 0; i < rects.length; i++) {
  for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) {
      overlaps.push(`${a.label} <-> ${b.label}`);
    }
  }
}
```

Reuse the login and route-discovery preamble from the derivation script, then run
these checks plus:

1. **No horizontal overflow** — `/`, `/insights`, `/calendar`, `/bookmarks`, `/archive`, `/settings`, `/coaching`, plus a discovered subject/chapter/topic, at 320/360/390/430px: `document.documentElement.scrollWidth <= window.innerWidth`.
2. **No form field under 16px** — the iOS zoom-lock guard.
3. **Landscape** 844×390 — no overflow, and never both `aside` and `nav[aria-label="Primary"]` visible.
4. **Chrome paints during hydration** — with CDP `Network.emulateNetworkConditions` (latency 400ms, 1.6Mbps) and `Emulation.setCPUThrottlingRate({ rate: 4 })`, `document.querySelector('header')` must be visible within 1500ms.
5. **Focus ring present** — focus a sample of 14 controls; each must report a non-`none` `outlineStyle` or a `boxShadow`.

Collect failures into an array and finish with:

```js
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log('mobile audit: all checks passed');
```

- [ ] **Step 2: Run it against the live stack**

Run: `node scripts/mobile-audit.mjs`
Expected: exit 0, all checks reported passing. If the overlap check fails, that
control took the wrong path — switch it from `.touch-target` to a real resize.

- [ ] **Step 3: Document it in the README**

Add under the development section:

```markdown
### Mobile audit

`node apps/frontend/scripts/mobile-audit.mjs` checks the running stack
(`http://127.0.0.1:3200`, demo account) for horizontal overflow, sub-44px touch
targets, overlapping hit areas, iOS zoom-lock triggers, landscape breakage, and
whether the shell paints during hydration. Exits non-zero on any regression.
```

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/scripts/mobile-audit.mjs README.md
git commit -m "test(mobile): commit the audit harness as a regression check"
```

---

## Final verification

- [ ] `npm test` — full suite green
- [ ] `npx tsc --noEmit` — clean
- [ ] `npm run lint` — clean
- [ ] `node scripts/mobile-audit.mjs` — exit 0
- [ ] Manual pass on a real phone (or DevTools device mode) at 390×844: tap Clear plan, a revision-history delete, an editor toolbar button, the week nav; swipe a topic row; reorder a topic row; hard-reload a deep `/topic/<id>` link and confirm a skeleton rather than a 404.
- [ ] Sweep all three themes at 390px.
