import { prisma } from "@/lib/prisma";
import {
  fetchSnapshotItems,
  getApiKey,
  getDatasetId,
  getSnapshotProgress,
  isTerminal,
  platformFromActor,
  triggerSnapshot,
  type SupportedPlatform,
} from "@/lib/brightData";
import { persistRawAds } from "@/lib/persistRawAds";
import { NextRequest, NextResponse } from "next/server";

// POST /api/discover — kick off a Bright Data dataset snapshot
export async function POST(req: NextRequest) {
  if (!getApiKey()) {
    return NextResponse.json({ error: "BRIGHT_DATA_API_KEY not set in environment." }, { status: 500 });
  }

  const body = await req.json();
  const {
    platform: platformIn,
    actor,
    keyword,
    maxResults = 20,
    country = "US",
    databaseId,
  } = body as {
    platform?:   string;
    actor?:      string;
    keyword:     string;
    maxResults?: number;
    country?:    string;
    databaseId?: string;
  };

  // Accept either the new `platform` field or the legacy `actor` string from clients
  // that haven't been updated yet.
  const platform = (platformIn as SupportedPlatform | undefined)
    ?? platformFromActor(actor);

  if (!platform || !keyword) {
    return NextResponse.json({ error: "platform and keyword are required" }, { status: 400 });
  }

  const datasetId = getDatasetId(platform);
  if (!datasetId) {
    return NextResponse.json(
      { error: `No Bright Data dataset configured for ${platform}. Set BRIGHT_DATA_DATASET_${platform.toUpperCase()} in .env.` },
      { status: 500 },
    );
  }

  // databaseId is required for the new persistence flow but kept optional in
  // the request shape so older clients (manual smoke tests, /discover legacy
  // page) still trigger snapshots. The GET handler will refuse to persist
  // unless a databaseId is supplied.
  if (databaseId) {
    const db = await prisma.database.findUnique({ where: { id: databaseId } });
    if (!db) {
      return NextResponse.json(
        { error: `Database ${databaseId} not found. Pick an active database before scraping.` },
        { status: 404 },
      );
    }
  }

  let snapshotId: string;
  try {
    ({ snapshotId } = await triggerSnapshot(platform, { keyword, maxResults, country }));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Bright Data trigger failed" }, { status: 502 });
  }

  // ScrapeRun.actor now holds the BD dataset id so history rows are unambiguous.
  // Wrap the Prisma write so an unmigrated table or a non-writable filesystem
  // returns a JSON error instead of an HTML 500 page.
  let run;
  try {
    run = await prisma.scrapeRun.create({
      data: {
        actor:    datasetId,
        keyword,
        platform,
        status:   "running",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ScrapeRun DB write failed";
    return NextResponse.json(
      { error: `Scrape was triggered on Bright Data (snapshot ${snapshotId}), but recording it in our DB failed: ${msg}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ runId: snapshotId, scrapeRunId: run.id, platform, datasetId });
}

// GET /api/discover?runId=<snapshotId>[&scrapeRunId=<id>][&databaseId=<id>]
//
// Polls Bright Data and, on the FIRST terminal transition to "ready",
// persists the snapshot items into the Ad table for the given databaseId.
// The atomic claim on ScrapeRun.status (running → persisting) guarantees
// only one concurrent poll runs the persist step, so the 2s client poll
// loop can't double-insert.
export async function GET(req: NextRequest) {
  if (!getApiKey()) {
    return NextResponse.json({ error: "BRIGHT_DATA_API_KEY not set" }, { status: 500 });
  }

  const snapshotId  = req.nextUrl.searchParams.get("runId");
  const scrapeRunId = req.nextUrl.searchParams.get("scrapeRunId");
  const databaseId  = req.nextUrl.searchParams.get("databaseId");
  if (!snapshotId) return NextResponse.json({ error: "runId required" }, { status: 400 });

  let progress;
  try {
    progress = await getSnapshotProgress(snapshotId);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "progress fetch failed" }, { status: 502 });
  }

  const status   = progress.status ?? "unknown";
  const finished = isTerminal(status);
  const stats    = { records: progress.records, errors: progress.errors, cost: progress.cost };

  if (!finished) {
    return NextResponse.json({ status, finished: false, items: [], stats });
  }

  // Terminal-but-not-ready states (failed / canceled / aborted) — record the
  // outcome on ScrapeRun and short-circuit. Nothing to persist.
  if (status.toLowerCase() !== "ready") {
    if (scrapeRunId) {
      try {
        await prisma.scrapeRun.update({
          where: { id: scrapeRunId },
          data:  { status: status.toLowerCase(), cost: progress.cost ?? null },
        });
      } catch { /* non-fatal */ }
    }
    return NextResponse.json({ status, finished: true, succeeded: false, items: [], stats });
  }

  // From here: BD says snapshot is ready. We need to fetch items, persist
  // them, and mark the ScrapeRun "ready" — exactly once across however many
  // concurrent polls arrive.
  const scrapeRun = scrapeRunId
    ? await prisma.scrapeRun.findUnique({ where: { id: scrapeRunId } })
    : null;

  // Atomic claim: only the poll that transitions running → persisting
  // gets to fetch + insert. Subsequent polls fall through to the
  // already-persisted branch.
  let claimed = false;
  if (scrapeRunId && scrapeRun && scrapeRun.status === "running") {
    const claim = await prisma.scrapeRun.updateMany({
      where: { id: scrapeRunId, status: "running" },
      data:  { status: "persisting" },
    });
    claimed = claim.count > 0;
  }

  // Already persisted (status was "ready") — return cached state. No re-fetch,
  // no re-insert. The client's terminal success state only needs counts.
  if (scrapeRun && scrapeRun.status === "ready") {
    return NextResponse.json({
      status:    "ready",
      finished:  true,
      succeeded: true,
      itemCount: scrapeRun.rowCount ?? 0,
      items:     [],
      stats:     { ...stats, records: scrapeRun.rowCount ?? stats.records },
      persisted: { databaseId: null, imported: scrapeRun.rowCount ?? 0, skipped: 0, deduped: 0, failed: 0 },
    });
  }

  // Another concurrent poll won the claim — back off and let the next poll
  // see the final state. Return a "still working" shape so the client keeps
  // polling.
  if (scrapeRunId && !claimed && scrapeRun?.status === "persisting") {
    return NextResponse.json({
      status:    "persisting",
      finished:  false,
      items:     [],
      stats,
    });
  }

  let items: Record<string, unknown>[] = [];
  let fetchError: string | null = null;
  try {
    items = await fetchSnapshotItems(snapshotId);
  } catch (e) {
    fetchError = e instanceof Error ? e.message : "snapshot fetch failed";
  }

  // No databaseId provided — preserve legacy behavior (return items in the
  // response, do not persist). Used by the legacy /discover page which has
  // its own client-side save flow.
  if (!databaseId) {
    if (scrapeRunId) {
      try {
        await prisma.scrapeRun.update({
          where: { id: scrapeRunId },
          data: {
            // Revert "persisting" back to "ready" since we're not persisting.
            status:   "ready",
            rowCount: items.length || progress.records || null,
            cost:     progress.cost ?? null,
          },
        });
      } catch { /* non-fatal */ }
    }
    if (fetchError) {
      return NextResponse.json({ status, finished: true, succeeded: false, error: fetchError, items: [], stats }, { status: 200 });
    }
    return NextResponse.json({
      status,
      finished:  true,
      succeeded: true,
      itemCount: items.length,
      items,
      stats,
    });
  }

  // databaseId supplied — persist into the Ad table.
  if (fetchError) {
    // Couldn't fetch items from BD — release the claim so a later poll can
    // retry, and surface the BD error to the client.
    if (scrapeRunId) {
      try {
        await prisma.scrapeRun.update({
          where: { id: scrapeRunId },
          data:  { status: "running" },
        });
      } catch { /* non-fatal */ }
    }
    return NextResponse.json({
      status,
      finished:  true,
      succeeded: false,
      error:     fetchError,
      items:     [],
      stats,
    }, { status: 200 });
  }

  let persistResult;
  try {
    persistResult = await persistRawAds({
      databaseId,
      items,
      source:   "brightdata",
      actor:    scrapeRun?.actor ?? null,
      keyword:  scrapeRun?.keyword ?? null,
      platform: scrapeRun?.platform ?? null,
    });
  } catch (e) {
    // Persistence failure — release the claim and surface the error so the
    // user sees why the scrape "completed" without rows landing.
    if (scrapeRunId) {
      try {
        await prisma.scrapeRun.update({
          where: { id: scrapeRunId },
          data:  { status: "running" },
        });
      } catch { /* non-fatal */ }
    }
    const msg = e instanceof Error ? e.message : "persist failed";
    return NextResponse.json({
      status,
      finished:  true,
      succeeded: false,
      error:     `Snapshot retrieved but failed to persist into the DB: ${msg}`,
      items:     [],
      stats,
    }, { status: 200 });
  }

  if (scrapeRunId) {
    try {
      await prisma.scrapeRun.update({
        where: { id: scrapeRunId },
        data: {
          status:   "ready",
          rowCount: persistResult.imported,
          cost:     progress.cost ?? null,
        },
      });
    } catch { /* non-fatal */ }
  }

  return NextResponse.json({
    status:    "ready",
    finished:  true,
    succeeded: true,
    itemCount: persistResult.imported,
    items:     [],
    stats:     { ...stats, records: persistResult.imported },
    persisted: {
      databaseId,
      imported: persistResult.imported,
      skipped:  persistResult.skipped,
      deduped:  persistResult.deduped,
      failed:   persistResult.failed,
      jobId:    persistResult.jobId,
    },
  });
}
