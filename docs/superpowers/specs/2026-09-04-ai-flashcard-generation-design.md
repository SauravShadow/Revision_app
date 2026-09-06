# AI Flashcard Generation — Design

**Date:** 2026-09-04
**Status:** Approved design, pending implementation plan
**Scope:** Phase 0 (AI gateway) + Slice B (flashcard/quiz generation)

## Context

RevisionWorks is an exam-revision manager built around spaced repetition. This
design adds its first AI capability: generating flashcards from a topic's notes,
and feeding self-graded quiz results back into the scheduling ladder.

Four AI capabilities were considered — Q&A over syllabus content (RAG), quiz
generation, a study coach, and extraction from uploaded documents. These are four
independent subsystems, not one feature, so they are decomposed into separate
slices. This spec covers only the shared gateway and the first slice.

### Slice ordering

| Slice | Depends on | Weight | Status |
|---|---|---|---|
| **B. Quiz / flashcard generation** | gateway + `Topic.notes` | Lightest | **This spec** |
| C. Study coach | gateway + existing stats | Light | Later |
| D. Upload extraction | gateway + PDF parsing | Medium | Later |
| A. Q&A over content | gateway + D's pipeline + embeddings | Heaviest | Later |

Slice B is first because the `Flashcard` model and `FlashcardsPanel` already
exist, `Topic.notes` needs no ingestion pipeline, and it exercises the whole
gateway path with the fewest moving parts.

## Constraints that shaped the design

1. **Zero API spend.** The operator pays for all LLM calls, not the user. During
   the free beta the budget is zero, which rules out paid APIs and makes the
   provider choice the central constraint rather than an implementation detail.
2. **Content is a single JSONB blob per user.** `app_data` is
   `(user_id, data jsonb, updated_at)`, read and rewritten whole. There are no
   relational rows for subjects/chapters/topics.
3. **Scheduling is manual-first.** `plannedAt` is user-owned: a number is a
   user-planned date, `null` means deliberately unplanned, `undefined` is a
   legacy snapshot. The ladder only ever *suggests*.
4. **Host capacity is limited.** 4 vCPU, 7.6 GiB RAM with ~2.7 GiB available and
   no swap, no GPU, shared with 28 running containers.

## Provider decision

**Gemini free tier (`gemini-2.5-flash`), behind a provider-swappable interface.**

Three zero-cost options were evaluated:

| Option | Verdict |
|---|---|
| **Gemini free tier** | **Chosen.** Zero cost, key already configured on the host, quality well above any locally-runnable model, and legitimate for serving app users. |
| Local LLM (llama.cpp) | Viable but deferred. Nothing installed; ~2.7 GiB free RAM with no swap caps the model at 1.5B–3B. Batch generation tolerates the slow speed, but content quality on engineering topics is the risk. |
| Claude CLI via personal subscription | Rejected for shipping. Best quality and zero marginal cost, but a consumer subscription covers individual use, not serving an app's end users. Acceptable for solo evaluation only. |

The provider is accessed through one interface so Claude or a local model can be
substituted by configuration when the product starts charging.

### Separate API key — required

NEXUS (`virtual-company`) already uses `GEMINI_API_KEY` on this host, and Google's
free-tier limits are per-project. Sharing the key means a busy NEXUS day throttles
students mid-revision, and vice versa.

**revision_app must use a separate Gemini API key in a separate Google Cloud
project** (`GEMINI_API_KEY_REVISION`). Free either way; isolates the blast radii.

### Privacy note

On Google's free tier, submitted data may be used to improve their products. Users
should be told that generated flashcards are produced by a third-party model before
the feature is enabled for them. This is a factor in favour of migrating to a local
provider later.

## Architecture

```
apps/frontend ──Bearer──▶ ai-service (:4004)
                            ├── session:  verifySession() from @revision-app/shared/server
                            ├── quota:    per-user daily counter + hard cap
                            ├── provider: Gemini | Claude | local  (one interface)
                            └── usage:    append-only token/latency log
                                     │
                            content-service ──▶ app_data (JSONB)
                                                 Topic.flashcards[]
```

### Why a new service

A fourth Node service matches the existing split (`auth-service`, `content-service`,
`files-service`) established in `2026-07-14-microservices-split-design.md`. It keeps
the provider API key in exactly one container, gives quota and usage their own
schema, and is the natural home for slices C, D, and A later.

Extending `content-service` was rejected because it would put an outbound network
dependency and a third-party API key into the service holding all user content.

### Why ai-service does not touch `app_data`

The frontend sends the topic's title and notes in the request and commits accepted
cards through the existing content-service path. `app_data` is rewritten whole on
every save, so a second writer would risk lost updates. One writer for user content.

## Generation flow

```
FlashcardsPanel ──"Generate cards"──▶ POST /api/ai/flashcards
                                         { topicId, title, notes, count }
                                              │
                                    ai-service │ 1. verify Bearer session
                                              │ 2. check quota  ─── over? 429
                                              │ 3. provider.generate()
                                              │ 4. log tokens + latency
                                              ▼
                                    ┌─ Review step ─────────────┐
                                    │  proposed cards           │
                                    │  Keep / Discard each      │
                                    └───────────┬───────────────┘
                                                │ kept only
                                    addFlashcard() ──▶ content-service ──▶ app_data
```

### Review step is mandatory

Generated cards are **proposed**, never auto-saved. A free-tier model will
occasionally produce a weak or incorrect card, and a wrong flashcard inside a
spaced-repetition system gets *rehearsed* — worse than having no card at all. The
review step also yields a free quality signal: the keep/discard ratio (see
`cards_kept` below).

### Structured output

Gemini's `responseSchema` + `responseMimeType: "application/json"` constrains output
to `{front, back}[]`, eliminating parsing and retry-on-malformed-JSON logic. The
provider interface exposes "structured generation" as a capability; each adapter
satisfies it in its own way (Gemini response schemas, Claude `output_config.format`,
llama.cpp GBNF grammars).

## Quiz and scheduling

**Grading uses no LLM.** The quiz is self-graded: show the card front, the student
thinks, flips, and taps *Got it* / *Missed it*. This is standard for spaced
repetition, is instant, and costs nothing. AI grading would only earn its keep for
open-ended written answers, which is out of scope.

The API surface is therefore exactly one call: generate cards from notes.

A completed session appends **one** `Revision` event carrying the session score.
`suggestedNextDate()` weights a weak score toward an earlier suggested date. It
remains a suggestion — `plannedAt` stays user-owned and `null` still means
deliberately unplanned. The quiz informs the ladder; it never overrides the student.

## Data model

### Shared types — two optional fields, no blob migration

```ts
export interface Flashcard {
  id: string; front: string; back: string; createdAt: number;
  source?: 'manual' | 'generated';             // NEW — undefined = legacy manual
}

export interface Revision {
  id: string; timestamp: number;
  score?: { correct: number; total: number };   // NEW — undefined = ungraded
}
```

Both fields are optional, so every existing snapshot remains valid and nothing
needs backfilling — the same approach used for `plannedAt`. `app_data` itself is
unchanged.

### ai-service schema

Own database (`revision_ai`), own migrations at
`services/ai-service/db/migrations/0001_init.sql`, run via the existing
`node ../../scripts/migrate.mjs` from the service directory.

```sql
CREATE TABLE ai_quota (
  user_id uuid NOT NULL,
  day     date NOT NULL,
  used    int  NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

CREATE TABLE ai_usage (
  id             bigserial PRIMARY KEY,
  user_id        uuid        NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  provider       text        NOT NULL,   -- 'gemini' | 'claude' | 'local'
  model          text        NOT NULL,
  operation      text        NOT NULL,   -- 'flashcards'
  input_tokens   int,
  output_tokens  int,
  latency_ms     int,
  outcome        text        NOT NULL,   -- 'ok' | 'quota' | 'rate_limited' | 'error'
  cards_proposed int,
  cards_kept     int                     -- written back after the review step
);
CREATE INDEX ai_usage_user_time ON ai_usage (user_id, created_at DESC);
```

`ai_usage` is the pricing dataset. When deciding whether to charge — and whether a
cheaper model would suffice — these rows give measured cost and quality per user
rather than estimates.

## Quota and failure behaviour

Two layers:

- **Per-user, per-day counter** (`AI_DAILY_QUOTA`, default 10) — stops one student
  consuming the shared free-tier pool.
- **Circuit breaker** on provider 429 — stops hammering a rate-limited endpoint,
  returns a friendly message, self-heals.

| Failure | Status | User sees |
|---|---|---|
| Daily quota exhausted | 429 | "You've used today's N generations — resets at midnight" |
| Provider rate-limited | 503 | "AI is busy right now, try again in a minute" |
| Provider down / key invalid | 503 | Same message — never a raw provider error |
| Schema violation | retry once, then 502 | "Couldn't generate cards for this topic" |

**Failure is harmless by construction.** Cards persist only after the review step,
so any failure means "no cards proposed" — never a corrupted topic, never a
half-written blob.

## Configuration

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY_REVISION` | Separate Gemini key, separate GCP project |
| `AI_SERVICE_URL` | `http://ai-service:4004` |
| `AI_DAILY_QUOTA` | Per-user daily generation cap (default 10) |
| `DATABASE_URL` | `postgres://revision:***@db:5432/revision_ai` |
| `SESSION_SECRET`, `SERVICE_SECRET` | Same as other services |

## Build sequence

| # | Step | Ships |
|---|---|---|
| 1 | Shared types + `suggestedNextDate` weights a weak score | pure functions, unit tests |
| 2 | ai-service skeleton — session verify, health, DB, migration | container up |
| 3 | Quota layer — counter, cap, 429 boundaries | — |
| 4 | Provider interface + Gemini adapter (structured output, timeouts, error mapping) | — |
| 5 | `POST /api/ai/flashcards` wiring 2–4 together | backend complete |
| 6 | Frontend review step — proposed cards, keep/discard, commit accepted | **first user-visible value** |
| 7 | Quiz scoring — *Got it* / *Missed it*, session score → one revision event | feature complete |
| 8 | `cards_kept` write-back + usage view for the operator | quality signal live |

Steps 1–5 are backend-only with nothing user-visible. Step 6 is where the feature
becomes real. Step 7 is separable: stopping after 6 gives working AI flashcard
generation without the scoring loop.

Testing follows existing service conventions — `vitest` with `supertest` for HTTP,
pure unit tests for scheduling logic, and a stubbed `fetch` for the provider adapter.

## Out of scope

- AI grading of free-text answers (self-grading is used instead)
- Per-card spaced repetition (scheduling stays at Topic level)
- RAG, embeddings, and a vector store (slice A)
- Document/PDF extraction (slice D)
- Study coach (slice C)
- Subscription entitlements — the beta is free to users; the paid tier is a later
  decision informed by `ai_usage` data. See `2026-08-03-payment-gateway-design.md`.

## Open questions

- Final per-user daily quota value once real usage is observed in `ai_usage`.
- Whether to surface the third-party-model privacy notice as onboarding copy or a
  settings disclosure.
