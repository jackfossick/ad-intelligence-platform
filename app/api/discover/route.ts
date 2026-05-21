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
import { NextRequest, NextResponse } from "next/server";

// POST /api/discover — kick off a Bright Data dataset snapshot
export async function POST(req: NextRequest) {
  if (!getApiKey()) {
    return NextResponse.json({ error: "BRIGHT_DATA_API_KEY not set in environment." }, { status: 500 });
  }

  const body = await req.json();
  const { platform: platformIn, actor, keyword, maxResults = 20, country = "US" } = body as {
    platform?: string;
    actor?: string;
    keyword: string;
    maxResults?: number;
    country?: string;
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

  let snapshotId: string;
  try {
    ({ snapshotId } = await triggerSnapshot(platform, { keyword, maxResults, country }));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Bright Data trigger failed" }, { status: 502 });
  }

  // ScrapeRun.actor now holds the BD dataset id so history rows are unambiguous.
  // Wrap the Prisma write so an unmigrated table or a non-writable filesystem
  // (SQLite on Vercel serverless) returns a JSON error instead of an HTML 500
  // page — otherwise the client only sees "Unknown error".
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

// GET /api/discover?runId=<snapshotId> — poll status and (when ready) fetch rows
export async function GET(req: NextRequest) {
  if (!getApiKey()) {
    return NextResponse.json({ error: "BRIGHT_DATA_API_KEY not set" }, { status: 500 });
  }

  const snapshotId = req.nextUrl.searchParams.get("runId");
  if (!snapshotId) return NextResponse.json({ error: "runId required" }, { status: 400 });

  let progress;
  try {
    progress = await getSnapshotProgress(snapshotId);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "progress fetch failed" }, { status: 502 });
  }

  const status = progress.status ?? "unknown";
  const finished = isTerminal(status);

  if (!finished) {
    return NextResponse.json({ status, finished: false, items: [] });
  }

  let items: Record<string, unknown>[] = [];
  if (status.toLowerCase() === "ready") {
    try {
      items = await fetchSnapshotItems(snapshotId);
    } catch (e) {
      return NextResponse.json(
        { status, finished: true, succeeded: false, error: e instanceof Error ? e.message : "snapshot fetch failed", items: [] },
        { status: 200 },
      );
    }
  }

  return NextResponse.json({
    status,
    finished: true,
    succeeded: status.toLowerCase() === "ready",
    itemCount: items.length,
    items,
    stats: { records: progress.records, errors: progress.errors, cost: progress.cost },
  });
}
