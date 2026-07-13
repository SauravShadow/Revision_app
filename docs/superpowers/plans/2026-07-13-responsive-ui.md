# Responsive UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app usable and well-proportioned from phone width up through large external monitors, replacing the current desktop-only layout (sidebar nav vanishes below 768px with no substitute; content is capped at a fixed centered width regardless of screen size).

**Architecture:** Mobile-first Tailwind CSS breakpoints (`sm` 640px, `md` 768px, `lg` 1024px, `xl` 1280px, `2xl` 1536px — Tailwind v4 defaults, no config changes needed). Grid/list views become fluid (more columns as width grows); the topic detail page (prose-heavy: notes editor + revision history) keeps a capped reading width. Sidebar navigation is extracted into a reusable `NavTree` so the same tree can render inside both the existing desktop `<aside>` and a new mobile slide-over drawer.

**Tech Stack:** Next.js 15 (App Router), React 19, Tailwind CSS v4, Framer Motion (already a dependency, used for the drawer's slide-in), lucide-react icons, @dnd-kit/core, Vitest + Testing Library.

## Global Constraints

- Use only Tailwind's default breakpoints (`sm`/`md`/`lg`/`xl`/`2xl`) — no `tailwind.config` changes, no container queries, no new dependencies.
- All new components are Client Components (`'use client'` at the top), matching every existing component in `components/`.
- Follow existing test conventions: co-located `ComponentName.test.tsx`, reset relevant Zustand store slices in `beforeEach` via `useStore.setState({ subjects: {}, chapters: {}, topics: {}, subjectOrder: [] })` (see `components/cards/SubjectCard.test.tsx`), use `@testing-library/react` `render`/`screen`/`fireEvent`. `vitest.setup.ts` already stubs `global.fetch`, so no per-test fetch mocking is needed.
- jsdom (the test environment) does not apply real CSS layout — it cannot verify flex-wrap, `@media` breakpoints, or animation timing. Tasks that are pure Tailwind-class/layout changes are verified by (a) the full existing test suite still passing (no structural regressions) and (b) an explicit manual browser check at four viewport widths: **375px** (phone), **768px** (tablet), **1280px** (laptop), **1920px** (external monitor) — resize via browser dev tools' responsive mode. Tasks with real interactive logic (state, callbacks, keyboard handling) get real automated tests.
- Run the whole suite with `npm test` (= `vitest run`); a single file with `npx vitest run <path>`.

---

## Task 1: Extract sidebar tree rendering into a reusable `NavTree` component

The subject/chapter/topic tree currently lives entirely inside `components/layout/SidebarTree.tsx`, hard-coded into the desktop-only `<aside>`. It needs to be reusable inside the mobile drawer built in Task 2, so pull the tree-rendering logic out into its own component first.

**Files:**
- Create: `components/layout/NavTree.tsx`
- Modify: `components/layout/SidebarTree.tsx`
- Test: `components/layout/NavTree.test.tsx`

**Interfaces:**
- Produces: `NavTree({ onNavigate }: { onNavigate?: () => void })` — a React component rendering the `<ul>` subject/chapter/topic tree, reading data via `useStore()`. Calls `onNavigate?.()` when any subject/chapter/topic link is clicked (Task 2's drawer uses this to close itself on navigation; the desktop `<aside>` in this task passes nothing).

- [ ] **Step 1: Write the failing test**

Create `components/layout/NavTree.test.tsx`:

```tsx
import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { NavTree } from './NavTree';
import { useStore } from '@/store/useStore';

beforeEach(() => {
  useStore.setState({ subjects: {}, chapters: {}, topics: {}, subjectOrder: [] });
});

it('renders subjects and calls onNavigate when a subject link is clicked', () => {
  useStore.getState().addSubject('Fluid Mechanics');
  const onNavigate = vi.fn();
  render(<DndContext><NavTree onNavigate={onNavigate} /></DndContext>);
  fireEvent.click(screen.getByText('Fluid Mechanics'));
  expect(onNavigate).toHaveBeenCalledTimes(1);
});

it('renders without crashing when onNavigate is omitted', () => {
  useStore.getState().addSubject('Thermodynamics');
  render(<DndContext><NavTree /></DndContext>);
  expect(screen.getByText('Thermodynamics')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/layout/NavTree.test.tsx`
Expected: FAIL — `Failed to resolve import "./NavTree"` (the file doesn't exist yet).

- [ ] **Step 3: Create `NavTree.tsx` with the tree logic moved out of `SidebarTree.tsx`**

Create `components/layout/NavTree.tsx`:

```tsx
'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { DroppableNode } from '@/components/dnd/DroppableNode';
import { nodeId } from '@/components/dnd/ids';

export function NavTree({ onNavigate }: { onNavigate?: () => void } = {}) {
  const data = useStore();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }));

  const subjects = data.subjectOrder.map((id) => data.subjects[id]).filter((s) => s && !s.archivedAt);

  return (
    <ul className="space-y-0.5">
      {subjects.map((subject) => {
        const chapters = subject.chapterIds.map((cid) => data.chapters[cid]).filter((c) => c && !c.archivedAt);
        return (
          <li key={subject.id}>
            <DroppableNode id={nodeId('subject', subject.id)}>
              <div className="flex items-center gap-1 rounded px-1 py-1 hover:bg-panel hover:text-ink">
                <button onClick={() => toggle(subject.id)} className="opacity-60" aria-label="Toggle">
                  {open[subject.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                <Link href={`/subject/${subject.id}`} onClick={onNavigate} className="truncate">{subject.name}</Link>
              </div>
            </DroppableNode>
            {open[subject.id] && (
              <ul className="ml-4 space-y-0.5 border-l border-line pl-2">
                {chapters.map((chapter) => {
                  const topics = chapter.topicIds.map((tid) => data.topics[tid]).filter((t) => t && !t.archivedAt);
                  return (
                    <li key={chapter.id}>
                      <DroppableNode id={nodeId('chapter', chapter.id)}>
                        <div className="flex items-center gap-1 rounded px-1 py-1 hover:bg-panel hover:text-ink">
                          <button onClick={() => toggle(chapter.id)} className="opacity-60" aria-label="Toggle">
                            {open[chapter.id] ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                          </button>
                          <Link href={`/chapter/${chapter.id}`} onClick={onNavigate} className="truncate">{chapter.name}</Link>
                        </div>
                      </DroppableNode>
                      {open[chapter.id] && (
                        <ul className="ml-4 space-y-0.5 border-l border-line pl-2">
                          {topics.map((topic) => (
                            <li key={topic.id} className="truncate rounded px-1 py-0.5 hover:bg-panel hover:text-ink">
                              <Link href={`/topic/${topic.id}`} onClick={onNavigate}>{topic.title}</Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run components/layout/NavTree.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Replace the inlined tree in `SidebarTree.tsx` with `<NavTree />`**

Replace the full contents of `components/layout/SidebarTree.tsx` with:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { PanelLeftClose, PanelLeft } from 'lucide-react';
import { NavTree } from './NavTree';

export function SidebarTree() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => { setCollapsed(localStorage.getItem('ce-sidebar') === 'closed'); }, []);
  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('ce-sidebar', next ? 'closed' : 'open');
  };

  if (collapsed) {
    return (
      <button onClick={toggleCollapsed} aria-label="Open sidebar"
        className="sticky top-[73px] hidden h-fit rounded-md border border-line p-2 text-ink-dim transition hover:border-line-strong hover:text-accent md:block">
        <PanelLeft size={16} />
      </button>
    );
  }

  return (
    <aside className="sticky top-[73px] hidden h-[calc(100vh-73px)] w-64 shrink-0 overflow-y-auto border-r border-line p-3 text-sm md:block">
      <div className="mb-3 flex items-center justify-between border-b border-line pb-2">
        <span className="tblabel">Navigator</span>
        <button onClick={toggleCollapsed} aria-label="Collapse sidebar" className="text-ink-faint transition hover:text-accent"><PanelLeftClose size={15} /></button>
      </div>
      <NavTree />
    </aside>
  );
}
```

Note: the collapsed-sidebar reopen button now also gets `hidden md:block` — previously it had no responsive qualifier at all, so a visitor who collapsed the sidebar on desktop and then shrank the window (or opened the app fresh on a phone with `localStorage['ce-sidebar'] === 'closed'` from a prior desktop session) would see a stray floating reopen button on mobile with nothing behind it to reopen. Task 2 gives mobile its own drawer entry point, so this button should be desktop-only like the rest of `SidebarTree`.

- [ ] **Step 6: Run the full test suite to confirm no regressions**

Run: `npm test`
Expected: all tests PASS, including the 2 new `NavTree` tests.

- [ ] **Step 7: Commit**

```bash
git add components/layout/NavTree.tsx components/layout/NavTree.test.tsx components/layout/SidebarTree.tsx
git commit -m "refactor: extract NavTree from SidebarTree for reuse in mobile drawer"
```

---

## Task 2: Mobile navigation drawer

Below `md` (768px), `SidebarTree` renders nothing (`hidden md:block`) and there is currently no substitute — the subject/chapter/topic tree, plus the header's `sm:block`-gated Bookmarks/Archive links and username, are all unreachable on a phone. Add a hamburger-triggered slide-over drawer containing that same navigation.

**Files:**
- Create: `components/layout/MobileNavDrawer.tsx`
- Modify: `components/layout/AppShell.tsx`
- Test: `components/layout/MobileNavDrawer.test.tsx`

**Interfaces:**
- Consumes: `NavTree({ onNavigate })` from Task 1. `useAuth()` from `components/AuthProvider.tsx` (returns `{ session, loading, logout, setSession }`, `session.username: string`, `session.domain: Domain`). `DOMAIN_LABELS: Record<Domain, string>` from `@/lib/auth/types`. `ThemeToggle` from `./ThemeToggle`.
- Produces: `MobileNavDrawer()` — a self-contained component (owns its own open/close state) rendering a `md:hidden` hamburger trigger plus, when open, a backdrop and slide-in panel. No props.

- [ ] **Step 1: Write the failing test**

Create `components/layout/MobileNavDrawer.test.tsx`:

```tsx
import { it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { MobileNavDrawer } from './MobileNavDrawer';
import { useStore } from '@/store/useStore';

beforeEach(() => {
  useStore.setState({ subjects: {}, chapters: {}, topics: {}, subjectOrder: [] });
});

it('is closed by default and opens on trigger click', () => {
  useStore.getState().addSubject('Structures');
  render(<DndContext><MobileNavDrawer /></DndContext>);

  expect(screen.queryByText('Structures')).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('Open menu'));
  expect(screen.getByText('Structures')).toBeInTheDocument();
});

it('closes on close-button click', () => {
  useStore.getState().addSubject('Structures');
  render(<DndContext><MobileNavDrawer /></DndContext>);
  fireEvent.click(screen.getByLabelText('Open menu'));
  fireEvent.click(screen.getByLabelText('Close menu'));
  expect(screen.queryByText('Structures')).not.toBeInTheDocument();
});

it('closes on Escape', () => {
  useStore.getState().addSubject('Structures');
  render(<DndContext><MobileNavDrawer /></DndContext>);
  fireEvent.click(screen.getByLabelText('Open menu'));
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.queryByText('Structures')).not.toBeInTheDocument();
});

it('closes when a nav link inside the tree is clicked', () => {
  useStore.getState().addSubject('Structures');
  render(<DndContext><MobileNavDrawer /></DndContext>);
  fireEvent.click(screen.getByLabelText('Open menu'));
  fireEvent.click(screen.getByText('Structures'));
  expect(screen.queryByText('Structures')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/layout/MobileNavDrawer.test.tsx`
Expected: FAIL — `Failed to resolve import "./MobileNavDrawer"`.

- [ ] **Step 3: Implement `MobileNavDrawer.tsx`**

Create `components/layout/MobileNavDrawer.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { NavTree } from './NavTree';
import { ThemeToggle } from './ThemeToggle';
import { useAuth } from '@/components/AuthProvider';
import { DOMAIN_LABELS } from '@/lib/auth/types';

export function MobileNavDrawer() {
  const [open, setOpen] = useState(false);
  const { session, logout } = useAuth();
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Open menu"
        className="rounded-md border border-line p-3 text-ink-dim transition hover:border-line-strong hover:text-ink md:hidden">
        <Menu size={18} />
      </button>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-ground-deep/70 backdrop-blur-sm" onClick={close} />
          <motion.aside
            initial={{ x: '-100%' }} animate={{ x: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="absolute inset-y-0 left-0 z-50 flex w-72 flex-col overflow-y-auto border-r border-line-strong bg-ground-deep p-3 text-sm"
          >
            <div className="mb-3 flex items-center justify-between border-b border-line pb-2">
              <span className="tblabel">Navigator</span>
              <button onClick={close} aria-label="Close menu" className="text-ink-faint transition hover:text-accent"><X size={16} /></button>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Link href="/filtered" onClick={close} className="tblabel rounded px-2 py-1 transition hover:bg-panel hover:text-ink">Filtered</Link>
              <Link href="/bookmarks" onClick={close} className="tblabel rounded px-2 py-1 transition hover:bg-panel hover:text-ink">Bookmarks</Link>
              <Link href="/archive" onClick={close} className="tblabel rounded px-2 py-1 transition hover:bg-panel hover:text-ink">Archive</Link>
            </div>

            {session && (
              <div className="mb-3 flex items-center justify-between border-b border-line pb-3">
                <div>
                  <div className="text-xs text-ink-dim">{session.username}</div>
                  <div className="tblabel text-[0.58rem]">{DOMAIN_LABELS[session.domain] ?? session.domain}</div>
                </div>
                <div className="flex items-center gap-2">
                  <ThemeToggle />
                  <button onClick={() => { close(); logout(); }} className="sidebar-logout-btn" title="Sign out" aria-label="Sign out">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                  </button>
                </div>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto">
              <NavTree onNavigate={close} />
            </div>
          </motion.aside>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run components/layout/MobileNavDrawer.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Wire the drawer into `AppShell`'s header**

In `components/layout/AppShell.tsx`, add the import:

```tsx
import { MobileNavDrawer } from './MobileNavDrawer';
```

Replace:

```tsx
        <div className="flex items-center justify-between gap-3 px-6 py-3">
          <Link href="/" className="group flex shrink-0 items-center gap-3">
```

with:

```tsx
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <MobileNavDrawer />
            <Link href="/" className="group flex shrink-0 items-center gap-3">
```

And close the new wrapping `<div>` right after the existing `</Link>` that follows the logo block — i.e. replace:

```tsx
            </span>
          </Link>

          <nav className="flex items-center gap-2">
```

with:

```tsx
            </span>
            </Link>
          </div>

          <nav className="flex items-center gap-2">
```

- [ ] **Step 6: Run the full test suite to confirm no regressions**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 7: Manual verification**

Start the dev server (`npm run dev`) and in the browser's responsive mode:
- At 375px: header shows a hamburger icon; clicking it slides in a left drawer with Filtered/Bookmarks/Archive links, username + theme toggle + logout (if logged in), and the subject tree; clicking a subject/chapter/topic link or the backdrop closes it.
- At 768px+: hamburger is gone, persistent sidebar behaves exactly as before.

- [ ] **Step 8: Commit**

```bash
git add components/layout/MobileNavDrawer.tsx components/layout/MobileNavDrawer.test.tsx components/layout/AppShell.tsx
git commit -m "feat: add mobile navigation drawer for viewports below md"
```

---

## Task 3: Fluid shell width, topic-page reading-width cap, and header wrap fix

The shell currently wraps all page content in `mx-auto max-w-7xl`, so on a large monitor everything just sits centered with dead space on either side. Per design: grid/list pages should use the freed-up width; the topic detail page (notes editor + revision history — prose-heavy) should keep a comfortable reading width regardless. The topic page's title/badge/button header row also doesn't wrap, so it can overflow on narrow screens.

**Files:**
- Modify: `components/layout/AppShell.tsx`
- Modify: `app/topic/[id]/page.tsx`

**Interfaces:**
- No new exports; both are leaf-level layout changes.

- [ ] **Step 1: Remove the fixed max-width from the shell**

In `components/layout/AppShell.tsx`, replace:

```tsx
      <div className="mx-auto flex max-w-7xl gap-4 px-4">
        <SidebarTree />
        <main className="min-w-0 flex-1 px-2 py-8">{children}</main>
      </div>
```

with:

```tsx
      <div className="flex gap-4 px-4 sm:px-6 lg:px-8">
        <SidebarTree />
        <main className="min-w-0 flex-1 px-2 py-8">{children}</main>
      </div>
```

- [ ] **Step 2: Cap the topic detail page's width and fix the header row wrap**

In `app/topic/[id]/page.tsx`, replace the return block:

```tsx
  return (
    <div>
      <Breadcrumb items={[
        { label: 'Subjects', href: '/' },
        ...(subject ? [{ label: subject.name, href: `/subject/${subject.id}` }] : []),
        ...(chapter ? [{ label: chapter.name, href: `/chapter/${chapter.id}` }] : []),
        { label: topic.title },
      ]} />
      <div className="mb-6 mt-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{topic.title}</h1>
          <RevisionBadge state={badgeState(topic.revisionHistory, Date.now())} />
          <button aria-label="Toggle bookmark" onClick={() => toggleBookmark(topic.id)} className="rounded-lg p-1.5 hover:bg-white/10">
            <Star size={18} className={topic.bookmarkedAt ? 'fill-amber-400 text-amber-400' : 'opacity-60'} />
          </button>
        </div>
        <button onClick={() => markTopicRevised(topic.id)}
          className="flex items-center gap-2 rounded-xl bg-emerald-500/90 px-4 py-2 text-sm font-medium text-black transition hover:bg-emerald-400">
          <CheckCircle2 size={16} /> Mark as Revised
        </button>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <MarkdownEditor value={topic.notes} onChange={(v) => updateTopicNotes(topic.id, v)} topicId={topic.id} />
        <div className="space-y-4">
          <RevisionHistoryPanel topic={topic} />
          <TagPicker topic={topic} />
          <AttachmentsPanel topic={topic} onInsertMarkdown={insertMarkdown} />
          <FlashcardsPanel topic={topic} />
        </div>
      </div>
    </div>
  );
```

with:

```tsx
  return (
    <div className="mx-auto w-full max-w-5xl">
      <Breadcrumb items={[
        { label: 'Subjects', href: '/' },
        ...(subject ? [{ label: subject.name, href: `/subject/${subject.id}` }] : []),
        ...(chapter ? [{ label: chapter.name, href: `/chapter/${chapter.id}` }] : []),
        { label: topic.title },
      ]} />
      <div className="mb-6 mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{topic.title}</h1>
          <RevisionBadge state={badgeState(topic.revisionHistory, Date.now())} />
          <button aria-label="Toggle bookmark" onClick={() => toggleBookmark(topic.id)} className="rounded-lg p-1.5 hover:bg-white/10">
            <Star size={18} className={topic.bookmarkedAt ? 'fill-amber-400 text-amber-400' : 'opacity-60'} />
          </button>
        </div>
        <button onClick={() => markTopicRevised(topic.id)}
          className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500/90 px-4 py-2 text-sm font-medium text-black transition hover:bg-emerald-400 sm:justify-start">
          <CheckCircle2 size={16} /> Mark as Revised
        </button>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <MarkdownEditor value={topic.notes} onChange={(v) => updateTopicNotes(topic.id, v)} topicId={topic.id} />
        <div className="space-y-4">
          <RevisionHistoryPanel topic={topic} />
          <TagPicker topic={topic} />
          <AttachmentsPanel topic={topic} onInsertMarkdown={insertMarkdown} />
          <FlashcardsPanel topic={topic} />
        </div>
      </div>
    </div>
  );
```

- [ ] **Step 3: Run the full test suite to confirm no regressions**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 4: Manual verification**

At 1920px viewport width: dashboard/subject/chapter pages (Task 4 will widen the dashboard grid further) use the full shell width; the topic detail page's content stays capped around `max-w-5xl` and doesn't stretch edge-to-edge.
At 375px: the topic page header stacks the title/badge/star on one line and the "Mark as Revised" button full-width below it, instead of overflowing.

- [ ] **Step 5: Commit**

```bash
git add components/layout/AppShell.tsx "app/topic/[id]/page.tsx"
git commit -m "feat: make shell width fluid, cap topic page to a reading width, fix header wrap"
```

---

## Task 4: Wider dashboard grid on large screens

Now that the shell (Task 3) is fluid, the dashboard's subject grid should keep adding columns on large/ultra-wide screens instead of stopping at 3.

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- None (pure layout).

- [ ] **Step 1: Extend the grid breakpoints**

In `app/page.tsx`, replace:

```tsx
        <motion.div layout className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
```

with:

```tsx
        <motion.div layout className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
```

- [ ] **Step 2: Run the full test suite to confirm no regressions**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 3: Manual verification**

At 1920px: dashboard shows 4 columns of subject cards; on an even wider window (2560px+ if available), 5 columns. At 375px: 1 column, unchanged.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat: add xl/2xl column steps to the dashboard subject grid"
```

---

## Task 5: Touch-friendly tap targets

Two concrete problems on touch devices: (1) several icon-only buttons (theme toggle, undo/redo) have a touch target under ~40px; (2) `RowActions` (rename/duplicate/delete on chapter/topic rows) is shown only via `group-hover`, which never fires on a touchscreen — those actions are currently completely unreachable on mobile.

**Files:**
- Modify: `components/layout/ThemeToggle.tsx`
- Modify: `components/layout/HeaderControls.tsx`
- Modify: `components/RowActions.tsx`
- Modify: `components/editor/MarkdownEditor.tsx`

**Interfaces:**
- None (pure layout/CSS; no prop or behavior changes).

- [ ] **Step 1: Enlarge `ThemeToggle`'s tap target below `md`**

In `components/layout/ThemeToggle.tsx`, replace:

```tsx
    <button onClick={toggle} aria-label="Toggle theme"
      className="rounded-md border border-line p-2 text-ink-dim transition hover:border-line-strong hover:bg-panel hover:text-accent">
```

with:

```tsx
    <button onClick={toggle} aria-label="Toggle theme"
      className="rounded-md border border-line p-3 text-ink-dim transition hover:border-line-strong hover:bg-panel hover:text-accent md:p-2">
```

- [ ] **Step 2: Enlarge the undo/redo buttons in `HeaderControls`**

In `components/layout/HeaderControls.tsx`, replace:

```tsx
      <button aria-label="Undo" disabled={!canUndo} onClick={undo}
        className="rounded-md border border-line p-2 text-ink-dim transition hover:border-line-strong hover:bg-panel hover:text-ink disabled:opacity-30"><Undo2 size={16} /></button>
      <button aria-label="Redo" disabled={!canRedo} onClick={redo}
        className="rounded-md border border-line p-2 text-ink-dim transition hover:border-line-strong hover:bg-panel hover:text-ink disabled:opacity-30"><Redo2 size={16} /></button>
```

with:

```tsx
      <button aria-label="Undo" disabled={!canUndo} onClick={undo}
        className="rounded-md border border-line p-3 text-ink-dim transition hover:border-line-strong hover:bg-panel hover:text-ink disabled:opacity-30 md:p-2"><Undo2 size={16} /></button>
      <button aria-label="Redo" disabled={!canRedo} onClick={redo}
        className="rounded-md border border-line p-3 text-ink-dim transition hover:border-line-strong hover:bg-panel hover:text-ink disabled:opacity-30 md:p-2"><Redo2 size={16} /></button>
```

- [ ] **Step 3: Make `RowActions` always visible below `md`, hover-revealed at `md`+**

In `components/RowActions.tsx`, replace the full contents with:

```tsx
'use client';
import { Pencil, Trash2, Copy } from 'lucide-react';

export function RowActions({ onRename, onDelete, onDuplicate }: {
  onRename: () => void; onDelete: () => void; onDuplicate?: () => void;
}) {
  return (
    <div className="flex items-center gap-1 opacity-100 transition md:opacity-0 md:group-hover:opacity-100">
      <button aria-label="Rename" onClick={(e) => { e.preventDefault(); onRename(); }} className="rounded p-2 hover:bg-white/10 md:p-1.5"><Pencil size={15} /></button>
      {onDuplicate && <button aria-label="Duplicate" onClick={(e) => { e.preventDefault(); onDuplicate(); }} className="rounded p-2 hover:bg-white/10 md:p-1.5"><Copy size={15} /></button>}
      <button aria-label="Delete" onClick={(e) => { e.preventDefault(); onDelete(); }} className="rounded p-2 hover:bg-white/10 md:p-1.5"><Trash2 size={15} /></button>
    </div>
  );
}
```

- [ ] **Step 4: Enlarge the `MarkdownEditor` toolbar buttons**

In `components/editor/MarkdownEditor.tsx`, replace:

```tsx
  const Btn = ({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) => (
    <button title={title} aria-label={title} onClick={onClick} className="rounded p-1.5 opacity-70 hover:bg-white/10 hover:opacity-100">{children}</button>
  );
```

with:

```tsx
  const Btn = ({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) => (
    <button title={title} aria-label={title} onClick={onClick} className="rounded p-2 opacity-70 hover:bg-white/10 hover:opacity-100 md:p-1.5">{children}</button>
  );
```

- [ ] **Step 5: Run the full test suite to confirm no regressions**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 6: Manual verification**

At 375px (or with dev tools' touch emulation on): open a subject page — chapter rows show rename/duplicate/delete icons without needing hover. At 1280px: those icons are hidden until the row is hovered, as before. On the topic page's editor toolbar (formatting buttons), targets are visibly larger at 375px than at 1280px.

- [ ] **Step 7: Commit**

```bash
git add components/layout/ThemeToggle.tsx components/layout/HeaderControls.tsx components/RowActions.tsx components/editor/MarkdownEditor.tsx
git commit -m "fix: enlarge touch targets and make row actions reachable on touch devices"
```

---

## Task 6: Touch-aware drag activation

`DndProvider` uses a single `PointerSensor` with a 6px activation distance. On a touchscreen this makes it easy for a vertical scroll gesture on a card grid to accidentally start a drag. Add a dedicated `TouchSensor` with a short press-and-hold delay so touch scrolling and touch dragging don't fight each other, while leaving mouse/pen drag (via `PointerSensor`) exactly as responsive as before.

**Files:**
- Modify: `components/dnd/DndProvider.tsx`
- Test: `components/dnd/DndProvider.test.tsx`

**Interfaces:**
- No change to `DndProvider`'s public shape (`{ children }: { children: React.ReactNode }`); internal sensor config only.

- [ ] **Step 1: Write the failing test**

Create `components/dnd/DndProvider.test.tsx`:

```tsx
import { it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DndProvider } from './DndProvider';

it('renders children without crashing', () => {
  render(<DndProvider><div>content</div></DndProvider>);
  expect(screen.getByText('content')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it currently passes (baseline)**

Run: `npx vitest run components/dnd/DndProvider.test.tsx`
Expected: PASS (this establishes the pre-change baseline before the sensor swap).

- [ ] **Step 3: Add a touch-specific sensor with a press delay**

In `components/dnd/DndProvider.tsx`, replace:

```tsx
'use client';
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { useStore } from '@/store/useStore';
import { parseId } from './ids';

export function DndProvider({ children }: { children: React.ReactNode }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
```

with:

```tsx
'use client';
import { DndContext, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { useStore } from '@/store/useStore';
import { parseId } from './ids';

export function DndProvider({ children }: { children: React.ReactNode }) {
  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 6 } });
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } });
  const sensors = useSensors(pointerSensor, touchSensor);
```

- [ ] **Step 4: Run the test to verify it still passes**

Run: `npx vitest run components/dnd/DndProvider.test.tsx`
Expected: PASS

- [ ] **Step 5: Run the full test suite to confirm no regressions**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 6: Manual verification**

With dev tools' touch emulation on a card grid page (e.g. the dashboard): a quick tap-and-scroll gesture scrolls the page instead of triggering a drag; a press-and-hold of ~200ms followed by a move triggers a drag/reorder.

- [ ] **Step 7: Commit**

```bash
git add components/dnd/DndProvider.tsx components/dnd/DndProvider.test.tsx
git commit -m "fix: use a delayed TouchSensor so touch scroll doesn't fight drag activation"
```

---

## Spec items requiring no code change (verified during planning, not silently dropped)

- **Auth pages** (`app/(auth)/login/page.tsx`, `app/(auth)/register/page.tsx`): the spec called for "padding/spacing tuning." On inspection, `.auth-card-wrap` in `app/globals.css` already uses `min-height: 100svh` and `padding: 2rem 1rem`, `.auth-card` is `width: 100%; max-width: 420px`, and `.domain-grid` is already `repeat(auto-fill, minmax(180px, 1fr))` — all inherently fluid. No task was added; Task 3's manual verification pass includes a quick check of both pages at 375px/1920px to confirm.
- **`CommandPalette`** and **`MarkdownEditor`'s maximized state**: already use `max-w-xl` / `sm:inset-5` and behave correctly across widths; only the toolbar button touch-target sizing needed a change (folded into Task 5).
- **`ChapterCard`/`TopicCard` list pages** (subject/chapter detail pages) and **`AttachmentsPanel`**: these render as single-column, full-width rows (title left, actions right) rather than square cards — `app/subject/[id]/page.tsx` and `app/chapter/[id]/page.tsx` use a plain `grid gap-3` with no column breakpoints today, by design. Turning them into a multi-column grid would break that row layout, so only the dashboard's actual card grid (`app/page.tsx`, Task 4) gets wider breakpoints. `AttachmentsPanel`'s `sm:grid-cols-2` grid only ever renders inside the topic page's fixed `320px` sidebar column (`lg:grid-cols-[1fr_320px]`), so `xl`/`2xl` steps would have no effect there and were left unchanged.
