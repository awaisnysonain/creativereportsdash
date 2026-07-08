# Creative Reports

Executive, local-first creative-performance analytics for a paid-social team.
Pulls **Meta** ad-level data + **Triple Whale** metrics, merges on `ad_id`, parses
NOBL/FLO creative naming conventions, builds grouped analytics, generates a
weekly **OpenAI** narrative report, and posts a summary to **Slack** — all viewable
in a polished dashboard with full run history.

> Brands: **NOBL**, **FLO** · Stores: NOBL main, FLO main US, NOBL EU, NOBL UK · Meta accounts: NOBL, FLO

---

## Tech stack

- **Node.js** + **Express** + **EJS** templates + **TypeScript**
- **PostgreSQL** via **`pg`** (node-postgres) — plain, reviewable SQL, **no ORM**
- **Zod** for env + request validation
- **OpenAI SDK**, **Slack Web API**, **node-cron** scheduler
- Clean **service / repository / analytics** architecture

---

## Quick start (local)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure secrets

Your real values are already in `.env.local`. Only `DATABASE_URL` needs to point
at a reachable Postgres. Two options:

**Option A — Docker (recommended):**

```bash
docker compose up -d
# .env.local already defaults to:
# DATABASE_URL=postgresql://postgres:postgres@localhost:5432/creative_reports
```

**Option B — your own Postgres (managed/remote):**
Edit `DATABASE_URL` in `.env.local` (set `DATABASE_SSL=true` for most managed providers).

### 3. Migrate + seed (one command)

```bash
npm run setup
```

This applies `db/schema.sql` and, using the sample Meta exports in `/samples`,
creates a fully-analyzed **demo run** so the dashboard has data immediately.

### 4. Run the app

```bash
npm run dev
# open http://localhost:3000
```

That's the full local boot: **`docker compose up -d && npm run setup && npm run dev`**.

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Express server with hot reload (`tsx watch`) |
| `npm start` | Start production server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run db:migrate` | Apply `db/schema.sql` (idempotent) |
| `npm run db:reset` | Drop + recreate schema (dev only) |
| `npm run db:seed` | Seed config + demo run from `/samples` |
| `npm run setup` | migrate + seed |
| `npm run import:csv -- <file> [brand] [window]` | Import a Meta export as a run |
| `npm run test:connections` | Ping every configured integration |
| `npm run scheduler` | Optional standalone cron process (cron also starts with `npm start`) |
| `npm run typecheck` | TypeScript check |

---

## Data windows

- **L7** = yesterday−6 … yesterday (7 days)
- **L30** = yesterday−29 … yesterday (30 days)
- Prior weekly run-rate is derived from L30 vs L7 — `(L30 − L7)/23×7` — and powers new-winner and decelerator detection at the job level.
- Timezone: **America/New_York**. Weekly report: **Tuesday 08:00**.

### Automatic Tuesday run

When the server starts (`npm start` / `npm run dev`), a built-in cron registers automatically:

1. Pull Meta ad metrics (L7 + L30)
2. Pull Triple Whale attribution (L7 + L30)
3. Merge, analyze, generate the weekly report
4. Post the summary to Slack (`SLACK_BOT_TOKEN` + `SLACK_CHANNEL_ID`)

Configure in `.env.local`:

| Variable | Default | Purpose |
|---|---|---|
| `WEEKLY_RUN_DAY` | `Tuesday` | Day of week |
| `WEEKLY_RUN_HOUR` | `8` | Hour (24h, reporting timezone) |
| `REPORT_TIMEZONE` | `America/New_York` | Cron timezone |
| `APP_URL` | — | Public dashboard URL for Slack report links |
| `ENABLE_WEEKLY_SCHEDULER` | enabled | Set `false` to disable auto-run |

Verify after deploy: `GET /api/health` includes a `scheduler` block. Runs for **NOBL** and **FLO** sequentially each Tuesday.

---

## Test data mode

No live API access yet? Use exported Meta CSV/XLSX:

- **Settings → Test Data Mode**: upload a CSV/XLSX, pick brand + window, "Import & Analyze".
- Or CLI: `npm run import:csv -- samples/NT1-Ads-Jun-30-2026-Jul-6-2026.csv NOBL L7`

Triple Whale rows will show **"No Triple Whale match"** until a live TW sync runs —
totals are never broken by unmatched rows.

---

## Creative naming parser

`src/lib/parser/` implements a fault-tolerant parser for both the **modern**
(`061526_J0448v1_Desc_TOF_Vid_..._001NYS_002LK_003UGC_005L1_...`) and **legacy**
(`000AIO - 001NYS - 002PEN - 003... - 004WHT - 005SE - ...`) conventions, with
codebooks derived from the master naming sheet. It extracts Category, Opener,
Color, Creator, Script Stem, Funnel, hook, demographics, and more.

---

## Methodology (NT1 Weekly Review process doc)

- **Unique creative** = exact **Ad name**, deduped across ad sets; its campaign is the one where it spent most. This is the "$/ad" and win/lose unit.
- **Win / Lose** is a delivery test: a creative **wins** if its spend ≥ the average spend per unique creative in its campaign, otherwise it **loses** (zero-spend = loss).
- **Funnel is campaign-based**: **BOF** = ads in the `asc+ promo` campaign only; every other campaign (including `asc+ t-roas`, whitelist tests, international) is **TOF**. Name funnel tags are ignored.
- **Metrics**: Meta ROAS = Σ purchase value ÷ Σ spend · TW ROAS = Σ TW attributed revenue ÷ Σ spend · NV% = Σ new visitors ÷ Σ unique visitors · Thumbstop = impression-weighted 3s play rate.
- **TOF sh.** in element tables = element TOF spend ÷ **account** TOF spend for the window.
- **Element tables** (Category / Opener / Color / Creator Demo) only include ads with a parseable builder code, so they do not sum to account totals. Off-chart codes (e.g. `TOS`) are flagged, never invented.
- **Creator Performance** = whitelisted ads only, attributed by the open-entry creator.
- **Script Iteration Tracking, New Winners, Decelerators** exclude the `asc+ promo` sale campaign and catalog/Marpipe, and work at the **job** level (a J number split per script; unnumbered legacy ads keyed by open entry + SKU; a job wins if any of its creatives won).
- **New winner** = prior weekly run-rate `(L30 − L7)/23×7` under **$2K** and L7 spend ≥ **$10K**. **Decelerator** = prior run-rate ≥ **$18K** and L7 below **66%** of it.

---

## Architecture

```
src/
  server.ts                 # Express entry point
  web/
    routes/                 # pages + API routers
    views/                  # EJS templates (dashboard UI)
    helpers.ts              # formatters, markdown, icons
  config/brands.ts          # Brand ↔ Meta account ↔ TW store topology
  lib/
    env.ts                  # Zod-validated env + health
    dates.ts                # L7/L30/prior windows, weekly cron
    db/                     # pg client + SQL repositories
    services/               # meta, triplewhale, openai, slack, http
    parser/                 # codebooks + creative name parser
    analytics/              # merge + topline/breakouts/winners/decelerators
    importer/               # Meta CSV/XLSX importer
    jobs/                   # runner, pipeline (jobs), registry
public/                     # styles.css, app.js (client UI)
db/schema.sql               # PostgreSQL schema
scripts/                    # migrate, seed, import, test-connections, scheduler
samples/                    # sample Meta exports
```

## Security

Secrets live only in `.env.local` (git-ignored). Nothing is hardcoded in source.
`.env.example` / `.env.local.example` document every variable.
