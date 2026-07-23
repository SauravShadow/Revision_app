# RevisionWorks — Public Intro / About Page

**Date:** 2026-07-23
**Status:** Approved design, ready for implementation plan
**Route:** `/about` (public, no auth)

## Goal

A public marketing / introduction page for RevisionWorks that tells the story of the
app, explains what it does and how it works, showcases features, and speaks to both
audiences (individual learners and coaching institutes). The app is positioned as a
**subject-agnostic spaced-repetition revision + coaching platform** — not ESE-Civil
specific.

## Audience & positioning

- **Both** individual students and coaching institutes.
- **Generic across any subject domain** — the copy must not imply it's only for ESE /
  civil engineering. Use examples across domains (engineering, medicine, law, languages,
  etc.) rather than a single field.
- Tone: confident, clear, a little "engineering drafting-table" in personality to match
  the product's aesthetic.

## Placement & routing

- New public route at **`/about`**.
- **AppShell change:** `components/layout/AppShell.tsx` currently renders the
  authenticated header + sidebar for every path except `/login` and `/register`
  (`AUTH_PATHS`). Introduce a `PUBLIC_PATHS` set (or extend the existing bypass) that
  includes `/about`, so the About page renders its children bare — no authenticated
  sidebar/header. The About page supplies its own marketing chrome.
- The page requires **no auth and no data fetching** — fully static/public. It must render
  correctly for logged-out visitors (no session).
- **Entry points:**
  - Add a "Learn more" / "About" link on the login page (`app/(auth)/login/page.tsx`)
    pointing to `/about`.
  - The About page's CTAs point to `/register` ("Get started") and `/login` ("Sign in").

## Visual & technical approach

- **Match the app design system.** Reuse `globals.css` tokens (`bg-ground`, `text-ink`,
  `--accent`, `--go`, `--annotation`, `--alarm`, panel/line vars), the Archivo +
  IBM Plex Mono type system, `tblabel` mono labels, titleblock dimension rules, and
  drafting-corner tick motifs.
- **Theme switcher works here too** — reuse the existing `components/theme/ThemePicker`.
  All three themes (engpad default, blueprint dark, slate) must look correct.
- Built as a Next.js route under `app/about/` with small, focused presentational
  components under `components/marketing/`. One component per section.
- **Framer Motion** (already a dependency) for subtle scroll-reveal animations. Keep
  motion tasteful and respect `prefers-reduced-motion`.
- Fully responsive; verified in light and dark themes.
- No new heavy dependencies.

## Page structure (top → bottom)

1. **Marketing header** — logo mark + "RevisionWorks" wordmark, `ThemePicker`, and
   `Sign in` / `Get started` buttons. Distinct from the authenticated `AppShell` header.
2. **Hero** — logo, headline + subhead positioning it as spaced-repetition revision for
   any subject, primary CTA ("Get started"), secondary ("Sign in"). Drafting-pad ground
   with corner ticks.
3. **The story / why it exists** — drafted narrative: cramming fails, spaced repetition
   works, built subject-agnostic so anyone preparing for anything can use it. Claude
   drafts; user edits wording afterward.
4. **Video explanation** — responsive 16:9 container with a branded placeholder poster +
   play button. Wired to accept a YouTube link later (single, well-marked place to drop
   the video ID/URL). Until then it shows the placeholder, not a broken embed.
5. **How it works** — the spaced-repetition interval ladder
   (1 → 3 → 7 → 16 → 35 → 60 → 90 days) and the six revision states, rendered as
   **native styled HTML/CSS** in the drafting aesthetic (NOT raw Mermaid). Source of
   truth for the numbers: `apps/frontend/lib/revision/ladder.ts` — read it and match.
6. **Features showcase** — drafting-card grid: revision engine, markdown/KaTeX editor,
   attachments, tags & bookmarks, themes, coaching dashboard.
7. **For students / For coaching** — two side-by-side value-prop panels, each addressing
   one audience.
8. **Screenshots / app preview** — real screenshots of the app UI. **Primary:** capture
   by running the app locally. **Fallback:** if capture isn't practical, tasteful
   CSS-drawn UI mock panels in the drafting style. Decide during implementation after
   attempting capture; note which was used.
9. **Final CTA + footer** — repeat primary CTA; footer with minimal links.

## Content / copy

- Claude drafts all marketing and story copy based on what the app does; user reviews and
  edits wording afterward.
- Copy must stay subject-agnostic (see positioning above).

## Non-goals (YAGNI)

- No blog, pricing page, changelog, or testimonials.
- No i18n.
- No CMS / editable content — copy lives in the components.
- No analytics/tracking wiring.
- No SEO beyond a sensible `<title>`/meta for the route (reuse existing metadata patterns).

## Open items to resolve during implementation

- **Video URL** — user provides a YouTube link later; leave a clearly-marked constant.
- **Screenshots vs CSS mock** — attempt real capture first; fall back to CSS mocks.

## Acceptance

- `/about` loads for a logged-out visitor with no authenticated chrome and no console
  errors.
- All three themes render correctly; theme switch persists.
- Responsive from mobile to desktop; no horizontal overflow.
- The ladder numbers on the page match `lib/revision/ladder.ts`.
- Login page links to `/about`; About CTAs link to `/register` and `/login`.
- Video section shows a clean placeholder (no broken embed) until a link is supplied.
- `npx tsc --noEmit` and `npm run lint` pass.
