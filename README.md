# Ad Intelligence — Internal Tool

A local ad intelligence and creative replication system. Scrape, analyse, and replicate winning ads in the weight loss / looksmax / wellness space.

---

## Setup (do this once)

### 1. Install dependencies

Open Terminal, navigate to this folder, and run:

```
cd /Users/jackfossick/Desktop/Ventures/Peptide/ad-intelligence
npm install
```

### 2. Set up your environment file

Copy the example file and fill in your Bright Data credentials:

```
cp .env.example .env
```

Then open `.env` and add your API key + one dataset id per platform you want to scrape:

```
BRIGHT_DATA_API_KEY=your_actual_key_here
BRIGHT_DATA_DATASET_TIKTOK=gd_xxxxxxxxxxxxxxxx
BRIGHT_DATA_DATASET_META=gd_xxxxxxxxxxxxxxxx
BRIGHT_DATA_DATASET_INSTAGRAM=gd_xxxxxxxxxxxxxxxx
POSTGRES_PRISMA_URL="postgresql://user:pass@host:5432/db?schema=public&pgbouncer=true&connect_timeout=15"
POSTGRES_URL_NON_POOLING="postgresql://user:pass@host:5432/db?schema=public"
```

- Get your API key from **https://brightdata.com/cp/setting/users**
- Browse / find dataset IDs in the **Dataset Marketplace**: https://brightdata.com/cp/datasets/marketplace — each dataset has an id that starts with `gd_…`

For local Postgres, install with `brew install postgresql@16` and `createdb ad_intelligence`, then point both vars at the same local connection. In production, the Vercel-Neon integration auto-populates both: `POSTGRES_PRISMA_URL` (pooled, prisma-tuned) and `POSTGRES_URL_NON_POOLING` (direct, used for migrations).

### 3. Set up the database

This only needs to be run once:

```
npx prisma migrate deploy
```

For local schema iteration, use `npx prisma migrate dev` instead.

---

## Running the app

```
npm run dev
```

Then open your browser and go to: **http://localhost:3000**

---

## Running a Bright Data scrape

1. Start the app (`npm run dev`).
2. Open `/collect` (or `/discover` for the legacy single-job view).
3. Pick a platform, enter a keyword, and click **Run scrape**.

Behind the scenes the app calls:
- `POST /api/discover` → triggers a Bright Data dataset snapshot, returns `{ runId: <snapshot_id>, scrapeRunId, platform, datasetId }`
- `GET  /api/discover?runId=<snapshot_id>` → polls progress; once `status: ready` the response contains the rows
- Each run is logged to the `ScrapeRun` table with `actor = <dataset id>`, `platform = TikTok|Meta|Instagram|YouTube`

After scraping, normalize and import the data:

```
npm run normalize
```

---

## Uploading an existing CSV or Excel file

1. Go to **Import / Export** in the sidebar
2. Drag and drop your CSV or Excel file
3. Review the column mapping (auto-matched where possible)
4. Click **Import**

---

## Exporting the database

Export everything to CSV (app must be running):

```
npm run export-csv
```

File is saved to `/data/exports/`. You can also export from the UI via **Import / Export → Export all ads to CSV**.

---

## Browsing the raw database

To open a visual database browser:

```
npx prisma studio
```

Opens at http://localhost:5555

---

## Project structure

```
/app              — Next.js pages and API routes
  /api/discover   — Bright Data trigger + snapshot polling
/components       — Shared UI components
/lib
  /brightData.ts  — Bright Data Datasets API client + platform → dataset mapping
  /normalizeAdData.ts — Source-agnostic row normalizer
/scripts          — Terminal scripts (normalize, export)
/data
  /raw            — Raw snapshot output (JSON)
  /processed      — Normalized data ready to import
  /exports        — CSV exports
/prisma           — Database schema and migrations
```

---

## Security notes

- Never share or commit your `.env` file (already in `.gitignore`)
- Your Bright Data API key is never logged or displayed
- All data is stored locally — nothing sent to external servers
