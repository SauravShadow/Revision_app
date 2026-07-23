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

**Out of scope** (ready for a later pass, not touched here): favicon.ico, Open Graph image, auth-page banners, email templates, PWA manifest.

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

## Non-goals

- No new brand assets generated (favicon set, maskable icons, etc.).
- No changes to auth pages, emails, or the PWA/TWA work (tracked separately in `2026-07-19-mobile-app-twa-design.md`).
