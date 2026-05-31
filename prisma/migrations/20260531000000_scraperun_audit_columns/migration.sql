-- NWLA-49: persist scrape params on ScrapeRun so /api/jobs can prove
-- what was actually requested vs what BD returned.

ALTER TABLE "public"."ScrapeRun"
  ADD COLUMN "maxResults"  INTEGER,
  ADD COLUMN "country"     TEXT,
  ADD COLUMN "intent"      TEXT,
  ADD COLUMN "databaseId"  TEXT,
  ADD COLUMN "triggerUrl"  TEXT,
  ADD COLUMN "triggerBody" TEXT;
