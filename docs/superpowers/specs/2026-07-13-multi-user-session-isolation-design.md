# Multi-User Session Isolation & Security Hardening — Design Spec

**Date:** 2026-07-13
**Status:** Approved

## Goal

Multi-user auth (per-user data scoping, per-discipline seeding) was already merged (`b5fff41`, `32a8994`). Using it revealed that different users logged into separate tabs of the same browser collide, because the session lives in an HttpOnly cookie shared by the whole browser, not per tab. A partial, uncommitted fix (`sessionStorage` token + `Authorization` header + raw token in image/link URLs) was in progress but incomplete and had a real security gap. Auditing the rest of the multi-user migration surfaced two more issues: the file GC route was never updated to be user-scoped, and the Docker Compose `SESSION_SECRET` is a hardcoded, git-committed value.

This spec fixes all four: cross-tab isolation, the token-in-URL exposure, GC scoping, and the production secret.

## Non-goals

- No change to the `mechanical-engineering` / `electrical-engineering` empty-seed gap (content gap, not a bug — those domains fall through to an empty `seedDataForDomain` store by design today).
- No rewrite of git history to purge the old hardcoded secret — rotating it forward is sufficient; anything forged with the old value stops working the moment the new one is deployed.
- No change to the pre-existing hardening-pass deferred backlog (store slicing, `PUT /api/data` schema validation, dead `tags`/`tagOrder` guards, GC-after-reseed guard) — unrelated to this fix.
- No SSR/middleware auth gating — confirmed none exists today (`AuthProvider` does a client-side `fetch` to `/api/auth/me`), so none is being added.

## 1. Auth token architecture — drop the cookie

The HttpOnly cookie is removed entirely. `sessionStorage` (already per-tab, cleared on tab close) becomes the sole source of truth, carried via `Authorization` header.

- `app/api/auth/login/route.ts`, `register/route.ts`, `me/route.ts`: stop setting `Set-Cookie`. Continue returning `{userId, username, domain, token}` in the JSON body (already implemented).
- `app/api/auth/logout/route.ts`: drop the `Set-Cookie` clear header — logout becomes purely client-side (`clearStoredToken()`); the route can just return 204.
- `lib/auth/session.ts`: delete `sessionCookieHeader`, `clearCookieHeader`, `COOKIE_NAME`, and the cookie-parsing branch of `getSessionFromRequest`. No dead code left behind.
- `lib/auth/client.ts`: keep the existing `sessionStorage`-backed `getStoredToken`/`setStoredToken`/`clearStoredToken`/`authFetch` (already written in the uncommitted diff) — this part of the WIP was correct.

**Effect:** each tab holds its own token in its own `sessionStorage`. Logging in as a different user in another tab no longer affects the first tab. Closing a tab ends that tab's session.

**Rollout note:** any tab open at deploy time that never captured a token gets logged out once and must log back in. Acceptable one-time cost; not worth engineering around.

## 2. Attachment/image auth — scoped file tokens, not the session token

`<img src>` / `<a href>` can't carry an `Authorization` header, so the token must travel in the URL. Putting the full session token there means a leaked URL (browser history, server access logs, `Referer` header) grants full account access, not just image access. Fix: a second, scope-limited token.

- `lib/auth/session.ts`: add `signFileToken(userId: string): string`, signing `{userId, scope: 'files'}` with the same HMAC mechanism as `signSession`. Same lifetime as the main token — no separate expiry/refresh logic.
- `login`/`register`/`me` responses gain a `fileToken` field alongside `token`.
- `getSessionFromRequest`'s query-param branch (`?token=`, used only by `GET /api/files/[id]`) accepts **only** tokens whose verified payload has `scope: 'files'`. Session tokens (no `scope` claim) are rejected on that path; file tokens are rejected on the `Authorization` header path for every other route. A leaked file URL cannot be replayed against `/api/data` or any other endpoint.
- `lib/auth/client.ts`: add `getStoredFileToken`/`setStoredFileToken`/`clearStoredFileToken`, mirroring the existing token helpers.
- `components/AttachmentsPanel.tsx` and `components/editor/MarkdownView.tsx`: their `addTokenToUrl` helpers switch from `getStoredToken()` to `getStoredFileToken()`.

## 3. GC route — scope by user, require auth

`app/api/files/gc/route.ts` currently has no auth check and calls `readData()` / `sweepUnreferenced()` with no `userId`, so it operates on the legacy pre-multi-user path (`data/appdata.json`, `data/files/`) and is a silent no-op for every real user today.

- `POST /api/files/gc`: call `getSessionFromRequest(req)`; 401 if absent.
- `readData(session.userId)`, then `sweepUnreferenced(referencedBlobIds(data), now, session.userId)`.
- `lib/repository/gc.ts`: `sweepUnreferenced` gains a `userId?: string` parameter, threaded into `filesDir(userId)` and `deleteBlob(id, userId)` — both already accept it at the `fileBlobStore` layer, they just weren't being passed one.
- `components/StoreHydrator.tsx` needs no change — its `authFetch('/api/files/gc', ...)` call already sends the `Authorization` header; the route just wasn't reading it.

## 4. Production session secret

`docker-compose.yml` currently hardcodes `SESSION_SECRET=development-only-session-secret-change-me-in-production`. Because it isn't the exact literal `dev-secret-change-me`, the production guard in `session.ts` doesn't catch it — this string is live in production and visible to anyone who can read the repo, allowing session forgery for any user.

- Generate a real secret: `openssl rand -hex 32`.
- Add a gitignored `.env` at the repo root (Docker Compose auto-loads a `.env` next to the compose file); `docker-compose.yml` changes to `SESSION_SECRET=${SESSION_SECRET}`.
- Add `.env.example` with a placeholder value and a one-line comment on how to generate a real one.
- Confirm `.env` is covered by `.gitignore`.

## Error handling

- `verifyFileToken` (via `getSessionFromRequest`'s scoped check) returns `null` on missing/invalid/wrong-scope tokens, same shape as existing session verification failures — callers already handle `null` as 401.
- GC route: 401 with no session, same pattern as `/api/data` and `/api/files`.
- No new user-facing error states — auth failures already redirect to `/login` via `AuthProvider`.

## Testing

- `signFileToken`/`verifyFileToken` round-trip.
- Negative cases: a file-scoped token presented as `Authorization` header on `/api/data` is rejected; a normal session token presented as `?token=` on `/api/files/[id]` is rejected.
- `getSessionFromRequest`: header-auth path still works; cookie-related tests deleted (no longer applicable, not left as dead skips).
- GC route: 401 with no auth; sweep only touches the authenticated user's `data/users/<userId>/files/` directory — verified by seeding two users' blobs and asserting isolation (one user's sweep never touches the other's files).
- `login`/`register`/`me` route tests updated for the `fileToken` field and the absence of `Set-Cookie`.

## Exit criteria

`npx tsc --noEmit` clean, `npm run lint` clean, `npm test` fully green with the new/updated tests; manual check of the original symptom — log in as two different users in two tabs of the same browser, confirm neither session affects the other; confirm `docker-compose.yml` no longer contains a literal secret.
