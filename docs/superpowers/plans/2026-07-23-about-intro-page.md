# RevisionWorks About / Intro Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public `/about` marketing/intro page for RevisionWorks that tells the app's story, embeds a (later-supplied) explainer video, explains the spaced-repetition system, showcases features, and speaks to both individual learners and coaching institutes — all in the app's existing drafting-table design system.

**Architecture:** A new public Next.js route at `app/about/page.tsx`, composed from small presentational section components under `components/marketing/`. `AppShell` is taught to treat `/about` as a public path (via an extracted, unit-tested `isPublicPath` helper) so the page renders without the authenticated header/sidebar and brings its own marketing header + footer. All styling reuses `globals.css` design tokens and utility classes; no new heavy dependencies.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript (strict), Tailwind v4 (`@theme` token map in `globals.css`), framer-motion (already a dependency), Vitest + @testing-library/react.

## Global Constraints

- Next.js 15 / React 19 / TypeScript strict — copy existing patterns; no new heavy deps.
- **Subject-agnostic copy:** never imply the app is only for ESE / civil engineering. Use cross-domain examples (engineering, medicine, law, languages).
- Design-system match: reuse `globals.css` tokens (`bg-ground`, `text-ink`, `bg-panel`, `border-line`, `text-accent`, `text-go`, `text-annotation`, `text-alarm`) and classes (`.bp-ticks`, `.tblabel`, `.dim-chip`, `.bp-figure`, `.bp-rise`, `.callout*`). Fonts: Archivo (`font-sans`) + IBM Plex Mono (`font-mono`).
- All three themes (engpad default, blueprint dark, slate) must render correctly.
- Respect `prefers-reduced-motion` (framer-motion `useReducedMotion` or CSS already handles `.bp-rise`).
- Page is fully public: no auth, no data fetching, no session required. Must render for logged-out visitors with no console errors.
- Ladder numbers on the page MUST come from `LADDER` in `@revision-app/shared` (`[1, 3, 7, 16, 35, 60, 90]`) — import it, do not hardcode.
- Tests: import `{ it, expect }` from `vitest`, `{ render, screen }` from `@testing-library/react`, matching existing `*.test.tsx` files.
- Run all commands from `apps/frontend/`. Verify with `npx tsc --noEmit` and `npm run lint` at the end.

---

### Task 1: Public-path plumbing — `isPublicPath` helper + AppShell bypass + empty `/about` route

Establish the routing foundation: `/about` renders bare (no authenticated chrome), and a stub page exists to prove it. Extract the path decision into a pure, testable helper.

**Files:**
- Create: `apps/frontend/lib/routes/publicPaths.ts`
- Test: `apps/frontend/lib/routes/publicPaths.test.ts`
- Modify: `apps/frontend/components/layout/AppShell.tsx` (the `AUTH_PATHS` block near the top and the early-return guard)
- Create: `apps/frontend/app/about/page.tsx` (temporary stub, replaced in Task 10)

**Interfaces:**
- Produces: `PUBLIC_PATHS: readonly string[]`, `isPublicPath(pathname: string): boolean` — true for `/login`, `/register`, `/about`. AppShell renders children bare when `isPublicPath(pathname)` is true.

- [ ] **Step 1: Write the failing test**

```ts
// apps/frontend/lib/routes/publicPaths.test.ts
import { it, expect } from 'vitest';
import { isPublicPath } from './publicPaths';

it('treats auth and about routes as public (no app shell)', () => {
  expect(isPublicPath('/login')).toBe(true);
  expect(isPublicPath('/register')).toBe(true);
  expect(isPublicPath('/about')).toBe(true);
});

it('treats app routes as non-public', () => {
  expect(isPublicPath('/')).toBe(false);
  expect(isPublicPath('/coaching')).toBe(false);
  expect(isPublicPath('/settings')).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/routes/publicPaths.test.ts`
Expected: FAIL — cannot find module `./publicPaths`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/frontend/lib/routes/publicPaths.ts
// Paths that render WITHOUT the authenticated AppShell (header + sidebar).
// Public marketing / auth surfaces bring their own chrome.
export const PUBLIC_PATHS = ['/login', '/register', '/about'] as const;

export function isPublicPath(pathname: string): boolean {
  return (PUBLIC_PATHS as readonly string[]).includes(pathname);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/routes/publicPaths.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire the helper into AppShell**

In `apps/frontend/components/layout/AppShell.tsx`, replace the `AUTH_PATHS` constant and the guard. Remove:

```ts
const AUTH_PATHS = ['/login', '/register'];
```

Add near the other imports:

```ts
import { isPublicPath } from '@/lib/routes/publicPaths';
```

Change the early-return guard from:

```ts
  if (AUTH_PATHS.includes(pathname) || (loading && !session)) {
    return <>{children}</>;
  }
```

to:

```ts
  // Public surfaces (auth pages, the /about marketing page) render bare —
  // they supply their own chrome. Also render bare while auth is still resolving.
  if (isPublicPath(pathname) || (loading && !session)) {
    return <>{children}</>;
  }
```

- [ ] **Step 6: Create the temporary stub page**

```tsx
// apps/frontend/app/about/page.tsx
// Temporary stub — replaced with the full composition in Task 10.
export default function AboutPage() {
  return <main data-testid="about-page">About RevisionWorks</main>;
}
```

- [ ] **Step 7: Verify it compiles and the app boots**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/lib/routes/publicPaths.ts apps/frontend/lib/routes/publicPaths.test.ts apps/frontend/components/layout/AppShell.tsx apps/frontend/app/about/page.tsx
git commit -m "feat(about): public-path plumbing + /about stub renders without app shell"
```

---

### Task 2: Marketing primitives — CTA buttons, section wrapper, scroll-reveal, header, footer

The reusable shell every section sits in. Small, focused components under `components/marketing/`.

**Files:**
- Create: `apps/frontend/components/marketing/CtaButtons.tsx`
- Create: `apps/frontend/components/marketing/Section.tsx`
- Create: `apps/frontend/components/marketing/Reveal.tsx`
- Create: `apps/frontend/components/marketing/MarketingHeader.tsx`
- Create: `apps/frontend/components/marketing/MarketingFooter.tsx`
- Test: `apps/frontend/components/marketing/CtaButtons.test.tsx`

**Interfaces:**
- Produces:
  - `<GetStartedButton />` → link to `/register`, label "Get started".
  - `<SignInButton variant?: 'solid' | 'ghost' />` → link to `/login`, label "Sign in".
  - `<Section id?: string, label?: string, title?: string, children>` → a `<section>` with optional mono `tblabel` eyebrow + heading, standard vertical rhythm and max width.
  - `<Reveal delay?: number, children>` → wraps children in a framer-motion fade/rise on scroll-into-view; renders children directly (visible) when reduced motion is preferred.
  - `<MarketingHeader />` → sticky top bar: logo + wordmark, theme popover (reuses `ThemePicker`), `Sign in` + `Get started`.
  - `<MarketingFooter />` → minimal footer with wordmark + `Sign in` / `Get started` links.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/frontend/components/marketing/CtaButtons.test.tsx
import { it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GetStartedButton, SignInButton } from './CtaButtons';

it('links the primary CTAs to register and login', () => {
  render(<><GetStartedButton /><SignInButton /></>);
  expect(screen.getByRole('link', { name: /get started/i })).toHaveAttribute('href', '/register');
  expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/marketing/CtaButtons.test.tsx`
Expected: FAIL — cannot find module `./CtaButtons`.

- [ ] **Step 3: Implement `CtaButtons.tsx`**

```tsx
// apps/frontend/components/marketing/CtaButtons.tsx
import Link from 'next/link';

export function GetStartedButton({ className = '' }: { className?: string }) {
  return (
    <Link
      href="/register"
      className={`inline-flex items-center justify-center rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-ground shadow-sm transition hover:opacity-90 active:translate-y-px ${className}`}
    >
      Get started
    </Link>
  );
}

export function SignInButton({
  variant = 'ghost',
  className = '',
}: {
  variant?: 'solid' | 'ghost';
  className?: string;
}) {
  const base =
    'inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-semibold transition active:translate-y-px';
  const styles =
    variant === 'solid'
      ? 'bg-panel text-ink hover:bg-panel-2'
      : 'border border-line text-ink hover:border-accent';
  return (
    <Link href="/login" className={`${base} ${styles} ${className}`}>
      Sign in
    </Link>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/marketing/CtaButtons.test.tsx`
Expected: PASS.

- [ ] **Step 5: Implement `Reveal.tsx`**

```tsx
// apps/frontend/components/marketing/Reveal.tsx
'use client';
import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

// Fade + rise a block into view once it scrolls near. Honors reduced motion by
// rendering the content already-visible.
export function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const reduce = useReducedMotion();
  if (reduce) return <>{children}</>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, ease: [0.2, 0.7, 0.2, 1], delay }}
    >
      {children}
    </motion.div>
  );
}
```

- [ ] **Step 6: Implement `Section.tsx`**

```tsx
// apps/frontend/components/marketing/Section.tsx
import type { ReactNode } from 'react';

// A page section with the standard max width, vertical rhythm, and an optional
// mono eyebrow + heading in the drafting-titleblock style.
export function Section({
  id,
  label,
  title,
  children,
  className = '',
}: {
  id?: string;
  label?: string;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-20 ${className}`}>
      {label && <p className="tblabel mb-2">{label}</p>}
      {title && (
        <h2 className="mb-8 text-2xl font-bold tracking-tight text-ink sm:text-3xl">{title}</h2>
      )}
      {children}
    </section>
  );
}
```

- [ ] **Step 7: Implement `MarketingHeader.tsx`**

```tsx
// apps/frontend/components/marketing/MarketingHeader.tsx
'use client';
import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Palette } from 'lucide-react';
import { ThemePicker } from '@/components/theme/ThemePicker';
import { GetStartedButton, SignInButton } from './CtaButtons';

export function MarketingHeader() {
  const [themeOpen, setThemeOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 border-b border-line-strong bg-ground-deep/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-3 sm:px-8">
        <Link href="/about" className="flex items-center gap-2.5">
          <Image src="/logo-icon-original.png" alt="RevisionWorks" width={28} height={28} priority className="h-7 w-7 rounded-full" />
          <span className="text-sm tracking-tight text-ink">
            Revision<span className="font-semibold">Works</span>
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setThemeOpen((v) => !v)}
              aria-expanded={themeOpen}
              aria-label="Change theme"
              className="grid place-items-center rounded-md p-2 text-ink-dim transition hover:bg-panel hover:text-accent"
            >
              <Palette size={16} />
            </button>
            {themeOpen && (
              <div className="absolute right-0 top-full z-40 mt-2 w-64 rounded-xl border border-line bg-panel p-3 shadow-lg">
                <ThemePicker />
              </div>
            )}
          </div>
          <SignInButton className="hidden sm:inline-flex" />
          <GetStartedButton />
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 8: Implement `MarketingFooter.tsx`**

```tsx
// apps/frontend/components/marketing/MarketingFooter.tsx
import Link from 'next/link';

export function MarketingFooter() {
  return (
    <footer className="border-t border-line-strong bg-ground-deep/60">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-10 sm:flex-row sm:px-8">
        <span className="text-sm text-ink-dim">
          Revision<span className="font-semibold text-ink">Works</span>
        </span>
        <nav className="flex items-center gap-5">
          <Link href="/login" className="tblabel transition hover:text-ink">Sign in</Link>
          <Link href="/register" className="tblabel transition hover:text-ink">Get started</Link>
        </nav>
      </div>
    </footer>
  );
}
```

- [ ] **Step 9: Verify compile + test**

Run: `npx vitest run components/marketing/ && npx tsc --noEmit`
Expected: tests PASS, no type errors.

- [ ] **Step 10: Commit**

```bash
git add apps/frontend/components/marketing/
git commit -m "feat(about): marketing primitives — CTAs, Section, Reveal, header, footer"
```

---

### Task 3: Hero section

**Files:**
- Create: `apps/frontend/components/marketing/Hero.tsx`
- Test: `apps/frontend/components/marketing/Hero.test.tsx`

**Interfaces:**
- Consumes: `GetStartedButton`, `SignInButton` (Task 2).
- Produces: `<Hero />` — full-bleed hero with logo, headline, subject-agnostic subhead, CTA pair, drafting corner ticks.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/frontend/components/marketing/Hero.test.tsx
import { it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Hero } from './Hero';

it('shows the headline and a get-started CTA', () => {
  render(<Hero />);
  expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /get started/i })).toHaveAttribute('href', '/register');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/marketing/Hero.test.tsx`
Expected: FAIL — cannot find module `./Hero`.

- [ ] **Step 3: Implement `Hero.tsx`**

```tsx
// apps/frontend/components/marketing/Hero.tsx
import Image from 'next/image';
import { GetStartedButton, SignInButton } from './CtaButtons';

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="bp-ticks group mx-auto flex max-w-4xl flex-col items-center px-5 py-24 text-center sm:py-32">
        <Image src="/logo-icon-original.png" alt="RevisionWorks" width={72} height={72} priority className="mb-6 h-16 w-16 rounded-2xl sm:h-18 sm:w-18" />
        <p className="tblabel mb-4">Spaced-repetition revision · any subject</p>
        <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight text-ink sm:text-5xl">
          Remember everything you study — right up to exam day.
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-ink-dim">
          RevisionWorks schedules what to review and when, so nothing you learn slips away.
          Built for any subject — engineering, medicine, law, languages — and for the coaches
          guiding whole cohorts through it.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <GetStartedButton />
          <SignInButton />
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/marketing/Hero.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/components/marketing/Hero.tsx apps/frontend/components/marketing/Hero.test.tsx
git commit -m "feat(about): hero section"
```

---

### Task 4: Story section

**Files:**
- Create: `apps/frontend/components/marketing/StorySection.tsx`

**Interfaces:**
- Consumes: `Section`, `Reveal` (Task 2).
- Produces: `<StorySection />` — the "why it exists" narrative. Product-focused, subject-agnostic. (User edits copy afterward.)

- [ ] **Step 1: Implement `StorySection.tsx`**

```tsx
// apps/frontend/components/marketing/StorySection.tsx
import { Section } from './Section';
import { Reveal } from './Reveal';

export function StorySection() {
  return (
    <Section id="story" label="Why it exists" title="Cramming doesn't stick. Spacing does." className="border-t border-line">
      <div className="grid gap-6 text-ink-dim sm:text-lg">
        <Reveal>
          <p>
            Everyone who has ever prepared for a serious exam knows the feeling: you study a
            topic, feel confident, and three weeks later it has quietly evaporated. Cramming
            the night before buys a day of recall and a month of regret.
          </p>
        </Reveal>
        <Reveal delay={0.05}>
          <p>
            Decades of memory research point to a better way. Review something just as you're
            about to forget it, and each review buys you a longer stretch of remembering. Space
            those reviews out on a widening ladder and knowledge moves from "seen it once" to
            "know it cold" — with far less total time at the desk.
          </p>
        </Reveal>
        <Reveal delay={0.1}>
          <p>
            RevisionWorks turns that principle into a tool you actually use. You organise what
            you're learning — subjects, chapters, topics — mark what you've revised, and it
            quietly does the scheduling maths, telling you exactly what's due today and what's
            slipping. It doesn't care whether you're preparing for an engineering service exam,
            medical boards, the bar, or a language certificate. The forgetting curve is the same
            for everyone; so is the fix.
          </p>
        </Reveal>
        <Reveal delay={0.15}>
          <p>
            And because no one revises entirely alone, it grows with you: a single learner on
            their laptop, or a coaching institute steering a whole cohort toward the same finish
            line.
          </p>
        </Reveal>
      </div>
    </Section>
  );
}
```

- [ ] **Step 2: Verify compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/components/marketing/StorySection.tsx
git commit -m "feat(about): story section"
```

---

### Task 5: Video section (placeholder now, YouTube link later)

**Files:**
- Create: `apps/frontend/components/marketing/VideoSection.tsx`
- Test: `apps/frontend/components/marketing/VideoSection.test.tsx`

**Interfaces:**
- Consumes: `Section` (Task 2).
- Produces: `<VideoSection />`. Behavior driven by a single constant `YOUTUBE_ID` at the top of the file: when empty string, render a branded 16:9 placeholder with a play glyph and "Video coming soon"; when set, render a responsive 16:9 YouTube `<iframe>`. **This is the one place to drop the video link later.**

- [ ] **Step 1: Write the failing test**

```tsx
// apps/frontend/components/marketing/VideoSection.test.tsx
import { it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VideoSection } from './VideoSection';

// Ships with an empty YOUTUBE_ID, so the placeholder (not an iframe) must show.
it('renders the placeholder while no video id is set', () => {
  const { container } = render(<VideoSection />);
  expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
  expect(container.querySelector('iframe')).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/marketing/VideoSection.test.tsx`
Expected: FAIL — cannot find module `./VideoSection`.

- [ ] **Step 3: Implement `VideoSection.tsx`**

```tsx
// apps/frontend/components/marketing/VideoSection.tsx
import { Play } from 'lucide-react';
import { Section } from './Section';

// ── Drop the explainer video here ──────────────────────────────────────────
// Paste the YouTube video ID (the part after `v=`, e.g. "dQw4w9WgXcQ").
// Leave as '' to keep showing the placeholder.
const YOUTUBE_ID = '';
// ────────────────────────────────────────────────────────────────────────────

export function VideoSection() {
  return (
    <Section id="video" label="Watch" title="See it in ninety seconds" className="border-t border-line">
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-line bg-ground-deep">
        {YOUTUBE_ID ? (
          <iframe
            className="absolute inset-0 h-full w-full"
            src={`https://www.youtube.com/embed/${YOUTUBE_ID}`}
            title="RevisionWorks explainer"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center">
            <div
              className="pointer-events-none absolute inset-0 opacity-40"
              style={{
                backgroundImage:
                  'linear-gradient(var(--grid-major) 1px, transparent 1px), linear-gradient(90deg, var(--grid-major) 1px, transparent 1px)',
                backgroundSize: '28px 28px',
              }}
            />
            <div className="relative flex flex-col items-center gap-3 text-center">
              <span className="grid h-16 w-16 place-items-center rounded-full border border-accent text-accent">
                <Play size={26} className="translate-x-0.5" fill="currentColor" />
              </span>
              <span className="tblabel">Video coming soon</span>
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/marketing/VideoSection.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/components/marketing/VideoSection.tsx apps/frontend/components/marketing/VideoSection.test.tsx
git commit -m "feat(about): video section with placeholder + YouTube slot"
```

---

### Task 6: "How it works" — the interval ladder + revision states (styled HTML)

**Files:**
- Create: `apps/frontend/components/marketing/HowItWorks.tsx`
- Test: `apps/frontend/components/marketing/HowItWorks.test.tsx`

**Interfaces:**
- Consumes: `Section`, `Reveal` (Task 2); `LADDER` from `@revision-app/shared`.
- Produces: `<HowItWorks />` — renders the ladder from `LADDER` (never hardcoded) as a row of connected day-interval nodes, plus a short list of the six revision states. Pure CSS/HTML, no Mermaid.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/frontend/components/marketing/HowItWorks.test.tsx
import { it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LADDER } from '@revision-app/shared';
import { HowItWorks } from './HowItWorks';

it('renders a node for every rung of the real ladder', () => {
  render(<HowItWorks />);
  // First and last intervals must appear as "+N" node labels.
  expect(screen.getByText(`+${LADDER[0]}`)).toBeInTheDocument();
  expect(screen.getByText(`+${LADDER[LADDER.length - 1]}`)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/marketing/HowItWorks.test.tsx`
Expected: FAIL — cannot find module `./HowItWorks`.

- [ ] **Step 3: Implement `HowItWorks.tsx`**

```tsx
// apps/frontend/components/marketing/HowItWorks.tsx
import { LADDER } from '@revision-app/shared';
import { Section } from './Section';
import { Reveal } from './Reveal';

// The six badge states, described for a first-time reader. Colour tokens mirror
// the in-app RevisionBadge palette.
const STATES: { label: string; tone: string; blurb: string }[] = [
  { label: 'Never revised', tone: 'text-ink-dim', blurb: 'On the pile, not yet started.' },
  { label: 'Recently revised', tone: 'text-go', blurb: 'Fresh in memory — nothing to do.' },
  { label: 'Upcoming', tone: 'text-ink', blurb: 'Scheduled, still comfortably ahead.' },
  { label: 'Due tomorrow', tone: 'text-annotation', blurb: 'Surfaces so it never sneaks up.' },
  { label: 'Due today', tone: 'text-accent', blurb: "Today's queue — revise to climb the ladder." },
  { label: 'Overdue', tone: 'text-alarm', blurb: 'Window missed — back to the first rung.' },
];

export function HowItWorks() {
  return (
    <Section id="how" label="How it works" title="A widening ladder of reviews" className="border-t border-line">
      <Reveal>
        <p className="mb-8 max-w-2xl text-ink-dim sm:text-lg">
          Every time you mark a topic revised, its next review is pushed further out. Keep up
          and the gaps grow from a day to three months. Miss a window and it drops straight back
          to the first rung — so the app always knows what genuinely needs your attention.
        </p>
      </Reveal>

      <Reveal delay={0.05}>
        <ol className="mb-12 flex flex-wrap items-center gap-2" aria-label="Spaced-repetition interval ladder (days)">
          {LADDER.map((days, i) => (
            <li key={days} className="flex items-center gap-2">
              <span className="dim-chip bp-figure flex flex-col items-center gap-0.5 px-3 py-2">
                <span className="text-ink">+{days}</span>
                <span className="tblabel text-[0.55rem]">{days === 1 ? 'day' : 'days'}</span>
              </span>
              {i < LADDER.length - 1 && <span aria-hidden className="text-line-strong">→</span>}
            </li>
          ))}
        </ol>
      </Reveal>

      <Reveal delay={0.1}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {STATES.map((s) => (
            <div key={s.label} className="rounded-xl border border-line bg-panel p-4">
              <p className={`tblabel ${s.tone}`}>{s.label}</p>
              <p className="mt-1.5 text-sm text-ink-dim">{s.blurb}</p>
            </div>
          ))}
        </div>
      </Reveal>
    </Section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/marketing/HowItWorks.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/components/marketing/HowItWorks.tsx apps/frontend/components/marketing/HowItWorks.test.tsx
git commit -m "feat(about): how-it-works ladder + revision states"
```

---

### Task 7: Features showcase grid

**Files:**
- Create: `apps/frontend/components/marketing/Features.tsx`

**Interfaces:**
- Consumes: `Section`, `Reveal` (Task 2); `lucide-react` icons.
- Produces: `<Features />` — a drafting-card grid of the app's real features (from README "Features" table), each with icon + title + one-liner. `.bp-ticks` on hover.

- [ ] **Step 1: Implement `Features.tsx`**

```tsx
// apps/frontend/components/marketing/Features.tsx
import { CalendarClock, FileText, Paperclip, Tags, Palette, Users } from 'lucide-react';
import { Section } from './Section';
import { Reveal } from './Reveal';

const FEATURES = [
  { icon: CalendarClock, title: 'Spaced-repetition engine', body: 'An automatic review schedule that tells you what to revise today — and catches what is slipping.' },
  { icon: FileText, title: 'Rich notes editor', body: 'Markdown with math (KaTeX) and syntax-highlighted code, so technical notes look right.' },
  { icon: Paperclip, title: 'Attachments', body: 'Attach files and images to any topic, served through scoped tokens that keep them private.' },
  { icon: Tags, title: 'Tags & bookmarks', body: 'Filter, search, and bookmark across everything you are studying.' },
  { icon: Palette, title: 'Three themes', body: 'Engineering Pad, Blueprint Dark, and Slate — pick the drafting sheet that suits you.' },
  { icon: Users, title: 'Coaching dashboard', body: 'Organisations and cohorts with invite codes; coaches see completion and activity, never private notes.' },
];

export function Features() {
  return (
    <Section id="features" label="What's inside" title="Everything the revision needs" className="border-t border-line">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f, i) => (
          <Reveal key={f.title} delay={(i % 3) * 0.05}>
            <div className="bp-ticks group h-full rounded-2xl border border-line bg-panel p-5">
              <span className="mb-3 grid h-10 w-10 place-items-center rounded-lg bg-accent-soft text-accent">
                <f.icon size={20} />
              </span>
              <h3 className="text-base font-semibold text-ink">{f.title}</h3>
              <p className="mt-1.5 text-sm text-ink-dim">{f.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
```

- [ ] **Step 2: Verify compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/components/marketing/Features.tsx
git commit -m "feat(about): features showcase grid"
```

---

### Task 8: Students / Coaching split

**Files:**
- Create: `apps/frontend/components/marketing/AudienceSplit.tsx`

**Interfaces:**
- Consumes: `Section`, `Reveal`, `GetStartedButton` (Task 2).
- Produces: `<AudienceSplit />` — two side-by-side value-prop panels ("For learners" / "For coaching institutes"), each with a short bullet list and a CTA.

- [ ] **Step 1: Implement `AudienceSplit.tsx`**

```tsx
// apps/frontend/components/marketing/AudienceSplit.tsx
import { GraduationCap, Building2, Check } from 'lucide-react';
import { Section } from './Section';
import { Reveal } from './Reveal';
import { GetStartedButton } from './CtaButtons';

const LEARNER = ['Know exactly what to revise today', 'Organise any subject your way', 'Rich notes, math, code, and attachments', 'Never lose track of what is slipping'];
const COACH = ['Bring students together in cohorts', 'Track completion and activity at a glance', 'Drill into any student’s revision status', 'Private notes stay private — always'];

function Panel({
  icon: Icon,
  eyebrow,
  title,
  points,
}: {
  icon: typeof GraduationCap;
  eyebrow: string;
  title: string;
  points: string[];
}) {
  return (
    <div className="bp-ticks group flex h-full flex-col rounded-2xl border border-line bg-panel p-6 sm:p-8">
      <span className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-accent-soft text-accent">
        <Icon size={22} />
      </span>
      <p className="tblabel">{eyebrow}</p>
      <h3 className="mt-1 text-xl font-bold text-ink">{title}</h3>
      <ul className="mt-4 flex flex-1 flex-col gap-2.5">
        {points.map((p) => (
          <li key={p} className="flex items-start gap-2 text-sm text-ink-dim">
            <Check size={16} className="mt-0.5 shrink-0 text-go" />
            <span>{p}</span>
          </li>
        ))}
      </ul>
      <div className="mt-6">
        <GetStartedButton />
      </div>
    </div>
  );
}

export function AudienceSplit() {
  return (
    <Section id="audiences" label="Who it's for" title="One system, two ways to use it" className="border-t border-line">
      <div className="grid gap-4 md:grid-cols-2">
        <Reveal>
          <Panel icon={GraduationCap} eyebrow="For learners" title="Revise smarter, not longer" points={LEARNER} />
        </Reveal>
        <Reveal delay={0.06}>
          <Panel icon={Building2} eyebrow="For coaching institutes" title="Steer a whole cohort" points={COACH} />
        </Reveal>
      </div>
    </Section>
  );
}
```

- [ ] **Step 2: Verify compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/components/marketing/AudienceSplit.tsx
git commit -m "feat(about): students / coaching audience split"
```

---

### Task 9: App preview — real screenshots with CSS-mock fallback

Attempt real screenshots of the running app; fall back to a CSS-drawn mock panel if capture isn't practical. The component's shape is identical either way — it renders a framed preview image if the asset exists, otherwise the mock.

**Files:**
- Create: `apps/frontend/components/marketing/AppPreview.tsx`
- Create (if capture succeeds): `apps/frontend/public/about/preview-dashboard.png` (+ optionally `preview-coaching.png`)

**Interfaces:**
- Consumes: `Section`, `Reveal` (Task 2).
- Produces: `<AppPreview />` — a browser-framed preview. Uses `<Image>` when a screenshot exists at the referenced path; the CSS mock is the default committed state so the section always renders.

- [ ] **Step 1: Attempt to capture a real screenshot**

Try, from `apps/frontend/`:

```bash
npm run dev   # then browse http://127.0.0.1:3200, sign in with a seeded/dev user, screenshot the dashboard
```

If you can capture, save the PNG to `apps/frontend/public/about/preview-dashboard.png` and set `HAS_SCREENSHOT = true` in Step 2's file. **If capture is not practical in this environment (no browser / no seeded data), skip the file and leave `HAS_SCREENSHOT = false`** — the CSS mock ships instead. Record which path you took in the task report.

- [ ] **Step 2: Implement `AppPreview.tsx` (CSS mock is the committed default)**

```tsx
// apps/frontend/components/marketing/AppPreview.tsx
import Image from 'next/image';
import { Section } from './Section';
import { Reveal } from './Reveal';

// Flip to true once public/about/preview-dashboard.png exists (see Task 9 Step 1).
const HAS_SCREENSHOT = false;

function BrowserFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="bp-ticks group overflow-hidden rounded-2xl border border-line bg-panel shadow-lg">
      <div className="flex items-center gap-1.5 border-b border-line bg-ground-deep px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-alarm/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-annotation/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-go/70" />
        <span className="tblabel ml-3 text-[0.55rem]">revisionworks · dashboard</span>
      </div>
      {children}
    </div>
  );
}

// A drafting-style mock of the dashboard: subject rows with revision chips.
function DashboardMock() {
  const rows = [
    { name: 'Structural Analysis', chips: ['DUE TODAY', 'UPCOMING'], tone: 'text-accent' },
    { name: 'Pharmacology', chips: ['RECENTLY REVISED'], tone: 'text-go' },
    { name: 'Constitutional Law', chips: ['OVERDUE'], tone: 'text-alarm' },
    { name: 'Spanish · B2', chips: ['DUE TOMORROW'], tone: 'text-annotation' },
  ];
  return (
    <div className="space-y-2.5 p-5 sm:p-6">
      {rows.map((r) => (
        <div key={r.name} className="flex items-center justify-between rounded-lg border border-line bg-ground px-4 py-3">
          <span className="text-sm font-medium text-ink">{r.name}</span>
          <span className="flex gap-1.5">
            {r.chips.map((c) => (
              <span key={c} className={`dim-chip ${r.tone}`}>{c}</span>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

export function AppPreview() {
  return (
    <Section id="preview" label="A look inside" title="Your revision, at a glance" className="border-t border-line">
      <Reveal>
        <BrowserFrame>
          {HAS_SCREENSHOT ? (
            <Image
              src="/about/preview-dashboard.png"
              alt="RevisionWorks dashboard"
              width={1600}
              height={1000}
              className="h-auto w-full"
            />
          ) : (
            <DashboardMock />
          )}
        </BrowserFrame>
      </Reveal>
    </Section>
  );
}
```

- [ ] **Step 3: Verify compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/components/marketing/AppPreview.tsx apps/frontend/public/about 2>/dev/null; git add apps/frontend/components/marketing/AppPreview.tsx
git commit -m "feat(about): app preview section (screenshot with css-mock fallback)"
```

---

### Task 10: Final CTA + assemble the page + metadata + full verification

**Files:**
- Create: `apps/frontend/components/marketing/FinalCta.tsx`
- Modify: `apps/frontend/app/about/page.tsx` (replace the Task 1 stub)
- Create: `apps/frontend/app/about/layout.tsx` (route-scoped metadata)
- Modify: `apps/frontend/app/(auth)/login/page.tsx` (add an "About / Learn more" link)
- Test: `apps/frontend/app/about/page.test.tsx`

**Interfaces:**
- Consumes: every section component (Tasks 2–9).
- Produces: the composed `/about` page, its `<title>`/description metadata, and a login → `/about` link.

- [ ] **Step 1: Implement `FinalCta.tsx`**

```tsx
// apps/frontend/components/marketing/FinalCta.tsx
import { Section } from './Section';
import { GetStartedButton, SignInButton } from './CtaButtons';

export function FinalCta() {
  return (
    <Section id="start" className="border-t border-line">
      <div className="bp-ticks group flex flex-col items-center rounded-3xl border border-line bg-panel px-6 py-14 text-center sm:py-16">
        <h2 className="max-w-2xl text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          Start remembering more, today.
        </h2>
        <p className="mt-3 max-w-xl text-ink-dim">
          Create a free account, add your first subject, and let RevisionWorks handle the
          when-to-review.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <GetStartedButton />
          <SignInButton />
        </div>
      </div>
    </Section>
  );
}
```

- [ ] **Step 2: Create `app/about/layout.tsx` with metadata**

```tsx
// apps/frontend/app/about/layout.tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'RevisionWorks — Spaced-repetition revision for any subject',
  description:
    'RevisionWorks schedules what to review and when, so nothing you study slips away. For individual learners and coaching institutes, across any subject.',
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
```

- [ ] **Step 3: Replace the stub `app/about/page.tsx` with the full composition**

```tsx
// apps/frontend/app/about/page.tsx
import { MarketingHeader } from '@/components/marketing/MarketingHeader';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import { Hero } from '@/components/marketing/Hero';
import { StorySection } from '@/components/marketing/StorySection';
import { VideoSection } from '@/components/marketing/VideoSection';
import { HowItWorks } from '@/components/marketing/HowItWorks';
import { Features } from '@/components/marketing/Features';
import { AudienceSplit } from '@/components/marketing/AudienceSplit';
import { AppPreview } from '@/components/marketing/AppPreview';
import { FinalCta } from '@/components/marketing/FinalCta';

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-ground text-ink">
      <MarketingHeader />
      <main>
        <Hero />
        <StorySection />
        <VideoSection />
        <HowItWorks />
        <Features />
        <AudienceSplit />
        <AppPreview />
        <FinalCta />
      </main>
      <MarketingFooter />
    </div>
  );
}
```

- [ ] **Step 4: Add the "About" link on the login page**

In `apps/frontend/app/(auth)/login/page.tsx`, locate the footer/link area near the bottom of the returned JSX (where the "register" link lives — search for `href="/register"` or the `auth-footer` / `auth-link` classes). Add an About link alongside it. Example, adapt to the exact surrounding markup:

```tsx
<p className="auth-footer">
  New here? <Link href="/register" className="auth-link">Create an account</Link>
  {' · '}
  <Link href="/about" className="auth-link">What is RevisionWorks?</Link>
</p>
```

If `Link` isn't already imported in that file, it is (the login page imports `Link from 'next/link'` — confirmed). Keep the existing register link; only add the About link.

- [ ] **Step 5: Write the page composition test**

```tsx
// apps/frontend/app/about/page.test.tsx
import { it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AboutPage from './page';

it('composes the marketing page with hero, sections, and CTAs', () => {
  render(<AboutPage />);
  expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  // Section headings from How-it-works, Features, Audiences all present.
  expect(screen.getByText(/A widening ladder of reviews/i)).toBeInTheDocument();
  expect(screen.getByText(/Everything the revision needs/i)).toBeInTheDocument();
  // At least one register CTA is wired.
  const ctas = screen.getAllByRole('link', { name: /get started/i });
  expect(ctas.length).toBeGreaterThan(0);
  expect(ctas[0]).toHaveAttribute('href', '/register');
});
```

- [ ] **Step 6: Run the page test**

Run: `npx vitest run app/about/page.test.tsx`
Expected: PASS.

- [ ] **Step 7: Full verification**

Run: `npx vitest run components/marketing app/about lib/routes && npx tsc --noEmit && npm run lint`
Expected: all tests PASS, no type errors, no lint errors.

- [ ] **Step 8: Manual smoke check (browser)**

Run `npm run dev`, open `http://127.0.0.1:3200/about` while logged out. Confirm: no authenticated sidebar/header; all sections render; theme popover switches all three themes correctly; no console errors; no horizontal scroll on a narrow viewport; login page shows the "What is RevisionWorks?" link.

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/components/marketing/FinalCta.tsx apps/frontend/app/about/ apps/frontend/app/\(auth\)/login/page.tsx
git commit -m "feat(about): assemble /about page, metadata, and login link"
```

---

## Self-Review

**Spec coverage check** (against `2026-07-23-about-intro-page-design.md`):
- Placement `/about` + AppShell bypass → Task 1. ✓
- Login link + CTAs to register/login → Tasks 2, 10. ✓
- No auth / no data fetching → Tasks 1 & 10 (page is presentational). ✓
- Design-system match (tokens, fonts, tblabel, bp-ticks, themes) → all component tasks. ✓
- Theme switcher on page → Task 2 (MarketingHeader reuses ThemePicker). ✓
- Marketing header → Task 2; Hero → Task 3; Story → Task 4; Video slot → Task 5; How-it-works styled HTML from LADDER → Task 6; Features → Task 7; Students/Coaching → Task 8; Screenshots w/ CSS fallback → Task 9; Final CTA + footer → Tasks 2 & 10. ✓
- Reduced motion → Task 2 (`Reveal` uses `useReducedMotion`). ✓
- Ladder numbers from `@revision-app/shared` `LADDER` → Task 6 (imported, tested). ✓
- Subject-agnostic copy → Tasks 3, 4, 9 use cross-domain examples. ✓
- Video shows clean placeholder until link supplied → Task 5 (tested). ✓
- `tsc`/`lint` pass → Task 10 Step 7. ✓

**Placeholder scan:** No "TBD"/"handle edge cases" placeholders; the only deliberately deferred values are `YOUTUBE_ID = ''` and `HAS_SCREENSHOT = false`, both spec-sanctioned open items with clear flip instructions.

**Type consistency:** `GetStartedButton`/`SignInButton` signatures (Task 2) match every call site (Tasks 3, 8, 10). `Section` props (`id/label/title/children/className`) consistent across Tasks 4–10. `Reveal` `delay` prop consistent. `LADDER` usage matches its `readonly number[]` type.
