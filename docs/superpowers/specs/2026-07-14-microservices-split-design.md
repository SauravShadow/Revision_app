# Microservices Split — Design

**Goal:** Split `revision_app` from a single Next.js monolith into independently deployable services — Auth, Content, Files, and a Next.js frontend/gateway — living in one monorepo, structured so two people can work on different services without colliding or blocking on each other's CI, review, or deploys.

**Driver:** Both independent deployability *and* clean per-person ownership are wanted equally — this is a full microservices split, not just an internal-module reorganization.

## Current State

`revision_app` is a single Next.js 15 app deployed as one Docker container (`docker-compose.yml`, port 3200 → 3000), with internal layering already in place:

- `lib/auth/*` — HMAC-signed session tokens (`lib/auth/session.ts`), user registry (`lib/auth/userStore.ts`)
- `lib/repository/fileStore.ts` — per-user `AppData` JSON blob (the whole subject/chapter/topic/revision tree)
- `lib/repository/fileBlobStore.ts`, `lib/repository/gc.ts` — uploaded file attachments on local disk
- `lib/domain/*`, `lib/revision/*`, `lib/search/*`, `lib/filters/*` — business logic, consumed almost entirely **client-side** (components, zustand store); only `app/api/data` and `app/api/files` touch it server-side

**In-flight prerequisite:** a Postgres migration (`docs/superpowers/plans/2026-07-13-postgres-foundation.md`) is partially done — a worktree branch `worktree-postgres-foundation` has 5 committed commits moving `userStore.ts` and `fileStore.ts` to Postgres, while master has *uncommitted* changes to `fileStore.ts`/`fileStore.test.ts` that mirror part of that branch without the supporting `lib/db/pool.ts`, `docker-compose.yml` service, or migrations. This must be reconciled and merged before the service split begins (see Phase 0 below).

## Architecture

Monorepo, npm workspaces (no Turborepo — 4 packages doesn't justify the extra tooling):

```
revision_app/
├── apps/
│   └── frontend/          # Next.js UI + BFF/gateway (existing app/, components/, store/)
├── services/
│   ├── auth-service/      # login/register/session issuance — owns `revision_auth` DB
│   ├── content-service/   # subjects/chapters/topics/revision data — owns `revision_content` DB
│   └── files-service/     # uploads, blob storage, GC — owns `revision_files` DB + blob volume
├── packages/
│   └── shared/            # AppData/domain types, session-token verify fn, zod contracts
├── docs/
└── docker-compose.yml     # orchestrates all 4 app containers + one Postgres instance
```

**Mapping from current code:**

| Current | Becomes |
|---|---|
| `lib/auth/*`, `app/api/auth/*` | `services/auth-service` |
| `lib/repository/fileStore.ts` (app_data table), `app/api/data/route.ts` | `services/content-service` |
| `lib/files/*`, `lib/repository/fileBlobStore.ts`, `lib/repository/gc.ts`, `app/api/files/*` | `services/files-service` |
| `lib/domain/*`, `lib/revision/*`, `lib/search/*`, `lib/filters/*` types | `packages/shared` (logic stays client-executed; types shared so services and frontend don't duplicate contracts) |

**Data ownership:** one project-scoped Postgres instance (per postgres-foundation), but **three separate databases** — `revision_auth`, `revision_content`, `revision_files` — each with its own DB role/credentials. No service queries another service's database directly; cross-service reads only happen over HTTP.

## Communication

- Synchronous HTTP/JSON over the Compose network, via container DNS names (`http://auth-service:4001`, etc.). No message queue — this is CRUD, not event-driven work.
- `apps/frontend`'s existing `app/api/*` routes become a thin BFF/gateway: the browser continues to talk only to Next.js (unchanged browser-facing contract, no CORS work), and those routes forward to the appropriate backend service.
- Gateway calls to backend services carry a short timeout (~5s) and return a clean 502/503 on failure rather than hanging — a files-service outage must not take down login.

## Auth Propagation

Reuses the existing HMAC-signed session token scheme as-is — it's already a local-JWT pattern (base64url payload + HMAC signature, verification needs only the shared secret, no DB lookup):

- `auth-service` is the only service that *issues* tokens (login/register).
- `packages/shared` exposes `verifySession(token, secret)`, identical to today's `lib/auth/session.ts` logic.
- `content-service` and `files-service` verify the `Authorization: Bearer` header **locally** using the same `SESSION_SECRET` env var — no network call back to auth-service per request.
- The frontend gateway forwards the client's bearer token unchanged to whichever service it calls.

## Migration Phasing (strangler-fig — app stays deployable at every step)

1. **Phase 0 — Finish postgres-foundation.** Reconcile master's uncommitted `fileStore.ts`/`fileStore.test.ts` changes with `worktree-postgres-foundation`, merge properly (bring `userStore.ts`, `docker-compose.yml` db service, `lib/db/pool.ts`, migrations along). Prerequisite, not part of the split itself.
2. **Phase 1 — Extract auth-service.** Smallest, most self-contained slice; already isolated and already stateless. Frontend's `/api/auth/*` routes become proxies.
3. **Phase 2 — Extract files-service.** Blob storage stays on local disk (own volume) for now — object storage is a later concern, not a blocker here.
4. **Phase 3 — Extract content-service.** Keeps the existing whole-blob `GET`/`PUT /api/data` contract initially; normalizing into real subject/chapter/topic tables/endpoints is a natural later phase, not required for the split.
5. **Phase 4 — Delete dead server code from `apps/frontend`**, leaving it a pure UI + gateway.

Each phase must leave the app fully working and deployable before starting the next.

## Two-Person Ownership

- **CODEOWNERS**: person A owns `services/auth-service/` + `services/files-service/`; person B owns `services/content-service/` + `apps/frontend/`. `packages/shared/` requires both owners' review — it's the one real coupling point (a type, a zod schema, or the session-verify function changing there can silently break a service its author doesn't own).
- **CI scoped per workspace**: only lint/test/build the workspace(s) touched in a PR's diff (`npm test -w services/auth-service`, etc.) — one person's push never triggers or blocks on the other's pipeline.
- **Independent Docker images**: each service has its own `Dockerfile` and image tag; deploying files-service never requires rebuilding content-service.
- **Branch convention**: scoped to one workspace (`auth/add-refresh-token`, `content/normalize-chapters`) to keep diffs small and fast to review by the non-owner.

## Testing

- Each service keeps its own Vitest suite against its **own real Postgres test database** (matches postgres-foundation's existing no-mocked-DB-client stance) — no service's tests reach across the network to another service.
- `packages/shared` gets its own unit tests (token verify, type guards).
- One root-level integration/smoke suite boots all 4 containers via `docker-compose` and drives real end-to-end flows (register → login → create a topic → upload a file) — this is what catches contract drift between services.

## Error Handling

- Gateway timeouts + clean error responses on backend failure (above).
- Input validation moves to each service's HTTP boundary via zod schemas in `packages/shared` — today's `PUT /api/data` deserializes `AppData` fairly trustingly; once content-service is its own deployable with no other layer to double-check it, this needs real validation.
- `depends_on: condition: service_healthy` in `docker-compose.yml` extends from just the Postgres dependency to full startup ordering — frontend won't route traffic until all three backend services report healthy.

## Out of Scope

- Object storage for file blobs (stays on local disk this round).
- Normalizing `AppData` into real per-entity tables/endpoints in content-service (kept as one JSON blob contract for this phase).
- Any message queue / event-driven communication.
- Kubernetes or any orchestrator beyond Docker Compose.
