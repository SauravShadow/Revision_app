# RevisionWorks Logo Integration — Design

**Date:** 2026-07-23
**Status:** Approved (design)

## Goal

Integrate the new **RevisionWorks** brand into the app's most visible surface — the header — and rename the app's user-facing name from "REVISION OS" / `revision_app` to **RevisionWorks**.

## Assets

Brand assets are committed under `Logo/` and mirrored into `apps/frontend/public/`:

| File (in `public/`) | What it is |
|---|---|
| `logo-icon.png` (1024×1024) | Polished app icon — green circle badge, white bar-chart mark. **Used in this change.** |
| `logo-icon-original.png` | Flat variant, 5 equal bars. Not used here. |
| `logo-banner-green.png` | Horizontal lockup on light-green background. Reserved for auth pages / emails (future). |
| `logo-banner-white.png` | Horizontal lockup on white background. Reserved for later. |

## Scope

**In scope:**

1. **Header wordmark** — `apps/frontend/components/layout/AppShell.tsx` (lines ~33–46).
2. **App name / page title** — `apps/frontend/app/layout.tsx` (line 31, `metadata.title`).
3. **Auth-page brand labels** — the app name also appears as the text `RevisionOS`
   (no space) inside `<span className="auth-brand-name">` on the five auth pages:
   `login`, `register`, `verify-email`, `forgot-password`, `reset-password`. Per the
   full-rename decision, all five text labels become `RevisionWorks`. (An initial
   grep for the spaced form "REVISION OS" missed these; found during implementation.)

**Out of scope for the header pass** (delivered in the follow-up below or still pending):
favicon.ico, Open Graph image, the auth-page brand **icon** (the house-shaped SVG next to
the `auth-brand-name` text stays as-is — auth-page logo *visuals* were deferred), email
templates, PWA manifest.

## Follow-up delivered (2026-07-23): favicon + OG image

Using Next 15 App Router file conventions in `apps/frontend/app/` (no config needed):

| File | Source / method |
|---|---|
| `icon.png` (512²) | `logo-icon-original.png` (transparent circle) via sharp — clean tab corners |
| `apple-icon.png` (180²) | `logo-icon.png` full-bleed white-bg via sharp — iOS masks its own rounding |
| `favicon.ico` (32² PNG-in-ICO) | 32px PNG wrapped in a hand-written ICO container — replaces the Next default |
| `opengraph-image.png` + `twitter-image.png` (1200×630) | Rendered via Playwright/chromium (no system fonts for sharp/SVG text): cream `#faf7ef` graph-pad background, transparent green circle icon + live `RevisionWorks` wordmark, tagline "Track your exam revision — always know what's due next", `CIVIL · SOFTWARE · ENGINEERING` kicker |

`metadataBase` added to the root `metadata` export (`NEXT_PUBLIC_SITE_URL`, falling back to
`http://127.0.0.1:3200`) so file-based icon/OG URLs resolve absolute. Verified: emitted
`<head>` carries `og:image` (1200×630), `twitter:card=summary_large_image`, `rel=icon`
(favicon.ico + 512 png) and `apple-touch-icon` (180); all five assets serve HTTP 200.

**Still pending after this follow-up:** auth-page brand icon swap, email templates, PWA
manifest — all delivered in the batch below.

## Follow-up delivered (2026-07-23): auth icon · email · PWA manifest

- **Auth-page brand icon** — replaced the house-shaped SVG (in the `.auth-brand-icon` box)
  on all five auth pages with the RevisionWorks circle mark via `next/image`; simplified the
  `.auth-brand-icon` CSS to a plain 36px circle (dropped the tinted box + border).
- **Email templates** (`services/auth-service/src/email/templates.ts`) — rebranded the
  verification + password-reset emails: `RevisionOS` → `RevisionWorks`, added a branded
  email-safe shell (icon `<img>` from `${origin}/icons/icon-192.png` + HTML wordmark, green
  accent rule, green CTA button, footer). Origin is derived from the link so no new env is
  needed. Existing email tests still pass (href + expiry text + subject keywords preserved).
- **PWA manifest** (`app/manifest.ts`, Next `MetadataRoute.Manifest`) — `name`/`short_name`
  `RevisionWorks`, `display: standalone`, `start_url`/`scope` `/`, `background_color`
  `#faf7ef`, `theme_color` `#4a7a1f`, and 192/512 icons in both `any` and `maskable` purposes
  (maskable = matched-green full-bleed square with the mark in the safe zone). Added
  `viewport.themeColor` and `appleWebApp` metadata to the root layout. Aligns with
  `2026-07-19-mobile-app-twa-design.md`.

### Icon-consistency correction (superseded — see below)

The user supplied two marks: `revisionworks-icon.png` (**unequal-height** bars, even spacing,
bar-chart style) and `revisionworks-icon-original.png` (**equal-height** bars, tally-style
spacing — 4 grouped, 1 separated — matching the banner wordmark). The header was already
using the correct mark (`logo-icon-original.png`), but the favicon / OG / PWA / email icons
had been built from `logo-icon-original.png` too at that point — this first "correction" pass
misidentified `logo-icon.png` as the "polished, correct" one and propagated *it* everywhere
instead, making every surface wrong. Reverted below.

### Icon-consistency correction, take two (2026-07-23, later same day)

`revisionworks-icon-original.png` (equal-height, tally-style bars) is the correct brand mark —
it matches the wordmark banners; `logo-icon.png` is a different, unrelated asset and is not
used anywhere in the app. Regenerated every derived asset (favicon.ico, app/icon.png,
apple-icon.png, OG/Twitter card, PWA `any` + `maskable` icons) from `logo-icon-original.png`
directly — it's already alpha-transparent outside its circle, so no masking step is needed.
Header and all five auth pages point at `/logo-icon-original.png`. Deleted the
`logo-icon-transparent.png` derivative (was masked from the wrong source).

**Verification:** `tsc` clean; app container rebuilt and restarted; every regenerated asset
serves 200; fresh cache-busted screenshots of the header and the extracted favicon both show
the correct equal-height tally-style mark.

## Design

### 1. Header wordmark (`AppShell.tsx`)

Replace the hand-drawn CSS "registration mark" `<span>` block and the `REVISION OS` text inside the home `<Link href="/">` with:

- **Icon:** `next/image` of `/logo-icon.png` at ~28×28px, rounded. The icon is a self-contained green circle badge, so it renders cleanly on every theme background (blueprint / engpad / slate) with **no per-theme variant required**. `alt="RevisionWorks"`. Explicit `width={28} height={28}`; `next/image` optimizes the 242 KB source down to the served size.
- **Wordmark:** live text — `Revision` (regular weight) followed by `Works` (bold), matching the banner lockup's styling. Colored with the existing theme-adaptive `text-ink` token so it recolors per theme.
- **Sublabel:** the existing domain label (`DOMAIN_LABELS[session.domain] ?? session.domain`, or `'Loading…'`) stays underneath the wordmark, unchanged.

Surrounding layout (flex, gap, `group` link, sticky header, dimension rule) is preserved.

### 2. App name (`app/layout.tsx`)

Change `metadata.title` from `'revision_app'` to `'RevisionWorks'`. Keep the existing `description`. No favicon or OG changes in this pass.

## Theme adaptability

The "icon PNG + live-text wordmark" approach was chosen specifically so the wordmark recolors per theme via `text-ink`, while the green circle badge stays constant. This avoids the baked-background problem the banner PNGs would cause on dark themes.

## Testing

- `npx tsc --noEmit` — type check passes.
- Existing Vitest suites pass (`npm test`).
- Manual: launch the app and verify the header logo + wordmark render correctly across all three themes, and the browser tab title reads "RevisionWorks".

**Verification performed (2026-07-23):** `tsc --noEmit` clean; 285/285 Vitest tests pass.
App rebuilt (`docker compose build app`) and driven headless via Playwright: logged in as
the demo user and captured the header across engpad / blueprint / slate — the green icon
badge stays constant while the wordmark recolors via `text-ink` (dark on light themes,
light on blueprint's dark navy), all legible. Login page confirmed showing "RevisionWorks".

## Non-goals

- No new brand assets generated (favicon set, maskable icons, etc.).
- No changes to auth pages, emails, or the PWA/TWA work (tracked separately in `2026-07-19-mobile-app-twa-design.md`).
