# AI Flashcard Generation — Deployment Runbook

Operational steps for turning on AI flashcard generation (see the "AI flashcard
generation" section of the root `README.md` for what the feature does and why
it's built the way it is). Written for someone who has not read the design
spec — every command below is runnable as written, and every step that
restarts a user-facing service is called out explicitly.

Design reference: `docs/superpowers/specs/2026-09-04-ai-flashcard-generation-design.md`.

## 1. Get a Gemini API key — in a new project

1. Go to [Google AI Studio](https://aistudio.google.com/apikey).
2. Create a **new** Google Cloud project — do not reuse a project that backs
   another Gemini-using app on this host. Free-tier quota is per-project, so
   sharing a key means the two apps throttle each other under load.
3. Generate an API key inside that new project.
4. In `revision_app/.env`, set:

   ```bash
   GEMINI_API_KEY_REVISION=<the key>
   AI_DAILY_QUOTA=10   # already defaulted in .env.example; change only if you have a reason to
   ```

Do not commit `.env`.

## 2. Create the `revision_ai` database (existing deployments only)

`db/init/004-ai-databases.sql` creates `revision_ai` and `revision_ai_test`
automatically, but **only** when the Postgres data volume is initialised for
the first time — `docker-entrypoint-initdb.d` scripts never re-run against an
existing volume. A deployment that predates this feature has a populated
volume, so `revision_ai` must be created by hand, once:

```bash
docker exec revision_app_db psql -U revision -d postgres -c 'CREATE DATABASE revision_ai;'
```

(`revision_app_db` is the live Postgres container name from `docker-compose.yml`.)

You do not need to create tables yourself — `ai-service`'s container `CMD` is
`npm run db:migrate && npm start`, so every time the container starts it applies
`services/ai-service/db/migrations/0001_init.sql` (via
`node ../../scripts/migrate.mjs`) before the server starts listening. A brand
new deployment (empty volume) does not need this step at all: the database
already exists by the time ai-service's migration runs.

## 3. Try it safely first — the preview stack

Before touching the live stack, rehearse the whole feature in the isolated
preview stack already checked into the repo root
(`docker-compose.preview.yml`). It is a fully separate set of containers,
volumes, and a network — distinct container names, host ports, and Postgres
data — so it cannot affect the live site or its data:

```bash
docker compose -f docker-compose.preview.yml -p rwpreview up -d --build
```

This starts:

| Service | Host port | Live-stack equivalent |
|---|---|---|
| `app` | `127.0.0.1:3211` | `127.0.0.1:3200` |
| `db` | `127.0.0.1:5434` | `127.0.0.1:5433` |
| `ai-service` | `127.0.0.1:4104` | not published on the live stack |

Because the preview stack's Postgres volume starts empty, `db/init/*.sql` runs
in full — `revision_ai` (and `revision_auth`, `revision_content`) are created
automatically, so step 2 above is not needed here.

The preview database is empty, so **you must register a new account** in the
preview app (`http://127.0.0.1:3211`) before you can create topics and try
generation — your live-stack login does not exist there.

When you're done rehearsing, remove the preview stack and all of its data:

```bash
docker compose -f docker-compose.preview.yml -p rwpreview down -v
```

The `-v` matters — it drops the preview's own named volumes
(`rwpreview-db`, `rwpreview-files`); it does not touch the live stack's
`external: true` volumes.

## 4. Deploy for real

Once you've rehearsed and are ready to enable this on the live stack:

```bash
docker compose up -d --build ai-service app
```

**This restarts the live site.** `app` is rebuilt so it picks up
`AI_SERVICE_URL` (already present in `docker-compose.yml`'s `app` environment
block); recreating the `app` container means the live site is briefly
unavailable while it restarts. Do this at a low-traffic time.

`ai-service` is a new container — starting it for the first time is not a
restart of anything user-facing by itself; the restart is caused by rebuilding
`app` in the same command.

## 5. Verify

Confirm the service is up and its schema applied:

```bash
# ai-service has no published host port on the live stack (same as
# auth-service/content-service/files-service), so check from inside the
# container. Its base image (node:20-slim) has no curl/wget, but Node has a
# built-in fetch:
docker compose exec ai-service node -e "fetch('http://localhost:4004/health').then(r=>r.text()).then(console.log)"
# Expected: {"ok":true}

docker exec revision_app_db psql -U revision -d revision_ai -c '\dt'
# Expected: ai_quota and ai_usage listed
```

## 6. Browser walkthrough

1. Sign in and open a topic **that already has notes** — the Generate button
   is disabled on a topic with empty notes.
2. Click **Generate**. Cards should appear in the review step (not yet saved).
3. Discard one proposed card, keep the rest, and save.
4. Confirm only the kept cards now appear in that topic's flashcard list — the
   discarded one must not be there.
5. Run the flashcard review as a quiz: flip through the cards, tap *Got it* /
   *Missed it*, and finish the session. Confirm a new revision was recorded.

## 7. Reading the usage data

`ai_usage` is an append-only log, one row per generation attempt:

```bash
docker exec revision_app_db psql -U revision -d revision_ai \
  -c 'SELECT outcome, cards_proposed, cards_kept, input_tokens, output_tokens, latency_ms FROM ai_usage ORDER BY id DESC LIMIT 20;'
```

- `outcome` — `ok`, `quota`, `rate_limited`, or `error`.
- `cards_proposed` / `cards_kept` — the keep/discard ratio is a running quality
  signal for the feature; `cards_kept` is written back after the review step,
  so it stays `NULL` until the student finishes reviewing.
- `input_tokens` / `output_tokens` / `latency_ms` — this is the dataset for
  deciding pricing later: measured cost and latency per generation rather than
  estimates (see "Out of scope" / subscription entitlements in the design
  spec).

## 8. Exercising the quota wall

To confirm the per-user daily cap actually stops a student:

1. In `.env`, temporarily set `AI_DAILY_QUOTA=1`.
2. Recreate the container so it picks up the new value — environment
   variables are baked in at container creation, so a plain
   `docker compose restart` will **not** pick up an edited `.env`:

   ```bash
   docker compose up -d ai-service
   ```

   **This restarts ai-service.** On the live stack this briefly interrupts
   in-flight AI requests (not the rest of the site — `app`, auth, content, and
   files are untouched).

3. Generate flashcards on a topic with notes. The first generation succeeds.
4. Generate again immediately. The second attempt must show the quota message
   in the UI ("You've used today's 1 generations — resets at midnight UTC.")
   and must add a row with `outcome = 'quota'` to `ai_usage`:

   ```bash
   docker exec revision_app_db psql -U revision -d revision_ai \
     -c "SELECT outcome, created_at FROM ai_usage ORDER BY id DESC LIMIT 3;"
   ```

5. Restore `AI_DAILY_QUOTA` in `.env` to its real value (default `10`) and
   recreate the container again:

   ```bash
   docker compose up -d ai-service
   ```

   **This restarts ai-service again.**

## 9. Troubleshooting

| Symptom | Meaning | Fix |
|---|---|---|
| Provider call returns **404** | The Gemini model ID is retired (this happened once already — `gemini-2.5-flash` → `gemini-3.6-flash`) | Update the `MODEL` constant in `services/ai-service/src/provider/gemini.ts`, then `docker compose up -d --build ai-service` |
| API responds **503** — "AI is busy right now — try again in a minute." | The provider rate-limited ai-service (HTTP 429 from Gemini), or the circuit breaker is already open from a previous rate-limit. The breaker trips for 60 seconds and refuses requests locally without calling the provider again | Usually self-heals within a minute |
| API responds **503** — "AI is unavailable right now — try again shortly." | The provider request failed outright (network error, timeout, or any non-200/429 status) — not a rate limit, so the breaker does not trip | Check `GEMINI_API_KEY_REVISION` is valid and the key's project has remaining free-tier quota; check `docker compose logs ai-service` for the underlying status code |
| API responds **429** "You've used today's N generations" | The **per-user daily quota** (`AI_DAILY_QUOTA`), not a provider-side error | Expected behaviour; resets at UTC midnight. Raise `AI_DAILY_QUOTA` only with a deliberate decision, informed by `ai_usage` |
| API responds **500** "Internal error" immediately, with no quota consumed | `GEMINI_API_KEY_REVISION` is unset in the ai-service container's environment — `getProvider()` throws before the quota is claimed, so this never costs a student a generation | Confirm the variable is set in `.env` and recreate the container: `docker compose up -d ai-service` |
| API responds **502** "Couldn't generate cards for this topic" | The model's response wasn't usable (non-JSON, empty, or not an array) despite the structured-output schema constraining it | Check ai-service logs (`docker compose logs ai-service`) for the underlying provider response; usually transient |
