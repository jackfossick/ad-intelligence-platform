import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

const APIFY_BASE = "https://api.apify.com/v2";

// ── Actor presets ──────────────────────────────────────────────
const ACTOR_INPUTS: Record<string, (opts: { keyword: string; maxResults: number; country: string }) => Record<string, unknown>> = {
  // Facebook Ad Library scraper — needs a pre-built Ad Library search URL
  "apify/facebook-ads-scraper": ({ keyword, maxResults, country }) => ({
    startUrls: [{
      url: `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&q=${encodeURIComponent(keyword)}&search_type=keyword_exact_phrase`,
    }],
    maxResults,
  }),
  // TikTok — hashtags array (not keywords)
  "clockworks/tiktok-scraper": ({ keyword, maxResults }) => ({
    hashtags: [keyword.replace(/^#/, "")],
    resultsPerPage: maxResults,
    proxyConfiguration: { useApifyProxy: true },
  }),
  // Instagram — directUrls with explore/tags URL (searchQueries doesn't work)
  "apify/instagram-scraper": ({ keyword, maxResults }) => ({
    directUrls: [`https://www.instagram.com/explore/tags/${encodeURIComponent(keyword.replace(/^#/, ""))}/`],
    resultsType: "posts",
    resultsLimit: maxResults,
  }),
};

// POST /api/discover — start an Apify run
export async function POST(req: NextRequest) {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "APIFY_TOKEN not set in environment." }, { status: 500 });
  }

  const body = await req.json();
  const { actor, keyword, maxResults = 20, country = "US" } = body as {
    actor: string;
    keyword: string;
    maxResults?: number;
    country?: string;
  };

  if (!actor || !keyword) {
    return NextResponse.json({ error: "actor and keyword are required" }, { status: 400 });
  }

  const inputFn = ACTOR_INPUTS[actor];
  const input = inputFn ? inputFn({ keyword, maxResults, country }) : { keyword, maxResults };

  // Start Apify run
  const apifyRes = await fetch(`${APIFY_BASE}/acts/${encodeURIComponent(actor)}/runs?token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!apifyRes.ok) {
    const err = await apifyRes.text();
    return NextResponse.json({ error: `Apify error: ${err}` }, { status: 502 });
  }

  const apifyData = await apifyRes.json();
  const runId = apifyData.data?.id;

  // Record the run in our database
  const run = await prisma.scrapeRun.create({
    data: {
      actor,
      keyword,
      platform: actor.includes("tiktok") ? "TikTok" : actor.includes("instagram") ? "Instagram" : "Meta",
      status: "running",
    },
  });

  return NextResponse.json({ runId, scrapeRunId: run.id });
}

// GET /api/discover?runId=xxx — check status + fetch results
export async function GET(req: NextRequest) {
  const token = process.env.APIFY_TOKEN;
  if (!token) return NextResponse.json({ error: "APIFY_TOKEN not set" }, { status: 500 });

  const runId = req.nextUrl.searchParams.get("runId");
  if (!runId) return NextResponse.json({ error: "runId required" }, { status: 400 });

  // Check run status
  const statusRes = await fetch(`${APIFY_BASE}/actor-runs/${runId}?token=${token}`);
  if (!statusRes.ok) return NextResponse.json({ error: "Failed to fetch run status" }, { status: 502 });

  const statusData = await statusRes.json();
  const run = statusData.data;
  const status: string = run?.status ?? "UNKNOWN";
  const isFinished = ["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(status);

  if (!isFinished) {
    return NextResponse.json({ status, finished: false, items: [] });
  }

  // Fetch dataset items if succeeded
  let items: Record<string, unknown>[] = [];
  if (status === "SUCCEEDED") {
    const datasetId = run.defaultDatasetId;
    const dataRes = await fetch(`${APIFY_BASE}/datasets/${datasetId}/items?token=${token}&limit=100`);
    if (dataRes.ok) {
      items = await dataRes.json();
    }
  }

  return NextResponse.json({
    status,
    finished: true,
    succeeded: status === "SUCCEEDED",
    itemCount: items.length,
    items,
    stats: run.stats,
  });
}
