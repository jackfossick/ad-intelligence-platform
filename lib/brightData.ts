/**
 * Bright Data Datasets API helpers.
 *
 * Current setup uses BD's Scrapers-Library pre-built datasets (chosen via the
 * ChatGPT-agent setup on 2026-05-21). The Datasets v3 API surface is the same
 * for both pre-built and Web Scraper IDE datasets, so the client code is
 * uniform; per-dataset input contracts may still differ (see buildTrigger).
 *
 *   1. Trigger a dataset run (POST /datasets/v3/trigger?dataset_id=…)
 *      → returns { snapshot_id }
 *   2. Poll progress         (GET  /datasets/v3/progress/{snapshot_id})
 *      → status: running | ready | failed
 *   3. Fetch snapshot rows   (GET  /datasets/v3/snapshot/{snapshot_id}?format=json)
 */

const BD_BASE = "https://api.brightdata.com/datasets/v3";

export type SupportedPlatform = "TikTok" | "Meta" | "Instagram" | "YouTube";

export type BrightDataProgress = {
  status: "running" | "ready" | "failed" | "canceled" | string;
  snapshot_id?: string;
  dataset_id?: string;
  records?: number;
  errors?: number;
  cost?: number;
};

export function getApiKey(): string | null {
  return process.env.BRIGHT_DATA_API_KEY?.trim() || null;
}

export function getDatasetId(platform: SupportedPlatform): string | null {
  const map: Record<SupportedPlatform, string | undefined> = {
    TikTok:    process.env.BRIGHT_DATA_DATASET_TIKTOK,
    Meta:      process.env.BRIGHT_DATA_DATASET_META,
    Instagram: process.env.BRIGHT_DATA_DATASET_INSTAGRAM,
    YouTube:   process.env.BRIGHT_DATA_DATASET_YOUTUBE,
  };
  return map[platform]?.trim() || null;
}

/** Normalize the legacy Apify `actor` string into our platform identifier. */
export function platformFromActor(actor: string | null | undefined): SupportedPlatform | null {
  if (!actor) return null;
  const a = actor.toLowerCase();
  if (a.includes("tiktok")) return "TikTok";
  if (a.includes("facebook") || a.includes("meta")) return "Meta";
  if (a.includes("instagram")) return "Instagram";
  if (a.includes("youtube")) return "YouTube";
  return null;
}

/**
 * Build the trigger payload + query params BD expects.
 *
 * Each Scrapers-Library dataset has its own input contract — confirmed
 * empirically on 2026-05-21 by probing each dataset and reading the
 * validation errors. See per-platform comments below.
 *
 * - TikTok    (gd_l1villgoiiidt09ci):    discover_by=search_url, body {search_url, country}
 * - YouTube   (gd_lk56epmy2i5g7lzu0k):    discover_by=keyword,    body {keyword, country}
 * - Meta      (gd_lkaxegm826bjpoo9m5):    no discovery collector; needs direct snapshot URLs
 * - Instagram (gd_l1vikfch901nx3by4):     discover_by=user_name,  body {user_name} — username, not keyword
 */
function buildTrigger(
  platform: SupportedPlatform,
  opts: { keyword: string; maxResults: number; country: string },
): { body: Record<string, unknown>[]; query: string } {
  const { keyword, country } = opts;
  const term = keyword.replace(/^#/, "").trim();
  switch (platform) {
    case "TikTok":
      return {
        body: [{ search_url: `https://www.tiktok.com/search?q=${encodeURIComponent(term)}`, country }],
        query: "&type=discover_new&discover_by=search_url",
      };
    case "YouTube":
      return {
        body: [{ keyword: term, country }],
        query: "&type=discover_new&discover_by=keyword",
      };
    case "Meta":
      // BD's Meta Ad Library dataset has no discovery collector — it only
      // accepts direct snapshot triggers against specific Facebook page URLs.
      // Surface a clear error so the UI can route Meta requests to a separate
      // URL-input flow (out of scope for the keyword-driven /collect path).
      throw new Error(
        "Meta scraping via Bright Data needs a list of Facebook page URLs, not a keyword. " +
        "The current /collect keyword flow doesn't apply to this dataset.",
      );
    case "Instagram":
      // BD's IG dataset discovers by username, not hashtag/keyword. Treat the
      // user's input as a handle (strip a leading @ if present).
      return {
        body: [{ user_name: term.replace(/^@/, "") }],
        query: "&type=discover_new&discover_by=user_name",
      };
  }
}

export async function triggerSnapshot(
  platform: SupportedPlatform,
  opts: { keyword: string; maxResults: number; country: string },
): Promise<{ snapshotId: string; datasetId: string }> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("BRIGHT_DATA_API_KEY not set in environment.");
  const datasetId = getDatasetId(platform);
  if (!datasetId) throw new Error(`No Bright Data dataset configured for ${platform}. Set BRIGHT_DATA_DATASET_${platform.toUpperCase()}.`);

  const { body, query } = buildTrigger(platform, opts);
  const res = await fetch(
    `${BD_BASE}/trigger?dataset_id=${encodeURIComponent(datasetId)}&include_errors=true${query}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bright Data trigger failed (${res.status}): ${text}`);
  }

  const data = await res.json() as { snapshot_id?: string };
  if (!data.snapshot_id) {
    throw new Error(`Bright Data trigger returned no snapshot_id: ${JSON.stringify(data)}`);
  }
  return { snapshotId: data.snapshot_id, datasetId };
}

export async function getSnapshotProgress(snapshotId: string): Promise<BrightDataProgress> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("BRIGHT_DATA_API_KEY not set in environment.");

  const res = await fetch(`${BD_BASE}/progress/${encodeURIComponent(snapshotId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bright Data progress failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<BrightDataProgress>;
}

export async function fetchSnapshotItems(snapshotId: string): Promise<Record<string, unknown>[]> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("BRIGHT_DATA_API_KEY not set in environment.");

  const res = await fetch(`${BD_BASE}/snapshot/${encodeURIComponent(snapshotId)}?format=json`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bright Data snapshot fetch failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  // BD returns either a bare array of records or {data: [...]} depending on dataset.
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (Array.isArray((data as { data?: unknown[] }).data)) {
    return (data as { data: Record<string, unknown>[] }).data;
  }
  return [];
}

/** True/false/null mapping of BD progress.status to "is run finished" terminal flag. */
export function isTerminal(status: string): boolean {
  const s = status.toLowerCase();
  return s === "ready" || s === "failed" || s === "canceled" || s === "aborted";
}
