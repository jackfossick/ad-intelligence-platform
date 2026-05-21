/**
 * Bright Data Datasets API helpers.
 *
 * BD's Datasets API is async/snapshot-based:
 *   1. Trigger a dataset run (POST /datasets/v3/trigger?dataset_id=…)
 *      → returns { snapshot_id }
 *   2. Poll progress         (GET  /datasets/v3/progress/{snapshot_id})
 *      → status: running | ready | failed
 *   3. Fetch snapshot rows   (GET  /datasets/v3/snapshot/{snapshot_id}?format=json)
 *
 * Dataset IDs are provided per BD account and exposed via env vars so we
 * never hard-code identifiers we don't own.
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

/** Build the per-platform trigger payload BD expects. */
function buildTriggerInput(
  platform: SupportedPlatform,
  opts: { keyword: string; maxResults: number; country: string },
): Record<string, unknown>[] {
  const { keyword, maxResults, country } = opts;
  switch (platform) {
    case "TikTok":
      return [{
        keyword: keyword.replace(/^#/, ""),
        country,
        num_of_posts: maxResults,
      }];
    case "Meta":
      return [{
        url: `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&q=${encodeURIComponent(keyword)}&search_type=keyword_exact_phrase`,
        keyword,
        country,
        num_of_posts: maxResults,
      }];
    case "Instagram":
      return [{
        hashtag: keyword.replace(/^#/, ""),
        country,
        num_of_posts: maxResults,
      }];
    case "YouTube":
      return [{
        keyword,
        country,
        num_of_videos: maxResults,
      }];
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

  const body = buildTriggerInput(platform, opts);
  const res = await fetch(`${BD_BASE}/trigger?dataset_id=${encodeURIComponent(datasetId)}&include_errors=true`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

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
