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

Copy the example file and fill in your Apify token:

```
cp .env.example .env
```

Then open `.env` in any text editor and add your Apify token:

```
APIFY_TOKEN=your_actual_token_here
DATABASE_URL="file:./dev.db"
```

Get your Apify token from: https://console.apify.com/account/integrations

### 3. Set up the database

This only needs to be run once:

```
npx prisma migrate dev
```

---

## Running the app

```
npm run dev
```

Then open your browser and go to: **http://localhost:3000**

---

## Uploading an existing CSV or Excel file

1. Go to **Import / Export** in the sidebar
2. Drag and drop your CSV or Excel file
3. Review the column mapping (auto-matched where possible)
4. Click **Import**

---

## Running an Apify scrape

Make sure the app is running (`npm run dev`) first, then in a second terminal window:

```
npm run scrape -- --actor apify/facebook-ads-scraper --input scripts/inputs/facebook-example.json
```

Example actors to try:
- `apify/facebook-ads-scraper` — Meta Ad Library
- `clockworks/tiktok-scraper` — TikTok videos
- `apify/instagram-scraper` — Instagram

After scraping, normalize and import the data:

```
npm run normalize
```

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
/components       — Shared UI components
/scripts          — Terminal scripts (scrape, normalize, export)
  /inputs         — Example input JSON files for Apify actors
/data
  /raw            — Raw Apify output (JSON)
  /processed      — Normalized data ready to import
  /exports        — CSV exports
/prisma           — Database schema and migrations
/lib              — Shared utilities
```

---

## Security notes

- Never share or commit your `.env` file (already in `.gitignore`)
- Your Apify token is never logged or displayed
- All data is stored locally — nothing sent to external servers
