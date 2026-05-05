/**
 * Normalize raw Apify data → /data/processed/ads.csv (9 canonical fields)
 * Also imports into the SQLite DB if the app is running.
 *
 * Usage:
 *   npm run normalize
 *   npm run normalize -- --file data/raw/my-file.json
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

const args = process.argv.slice(2);
const fileFlag = args.indexOf("--file");

// ── Canonical output schema (Step 2) ─────────────────────────
type NormalizedAd = {
  id: string;
  platform: string;
  ad_url: string;
  creative_video_url: string;
  ad_copy: string;
  hook: string;
  format: string;
  score: string;
  scraped_at: string;
};

type RawItem = Record<string, unknown>;

function getMostRecentRawFile(): string | null {
  const rawDir = path.resolve("data/raw");
  if (!fs.existsSync(rawDir)) return null;
  const files = fs.readdirSync(rawDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ f, mtime: fs.statSync(path.join(rawDir, f)).mtime }))
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  return files[0] ? path.join(rawDir, files[0].f) : null;
}

// Safe deep-get (dot-notation not needed, just flat key fallback)
function get(item: RawItem, ...keys: string[]): string {
  for (const k of keys) {
    const val = item[k];
    if (val != null && String(val).trim() !== "") return String(val).trim();
    // also check nested snapshot / videoMeta
    for (const parent of ["snapshot", "videoMeta", "authorMeta", "video"]) {
      const nested = item[parent] as RawItem | undefined;
      if (nested && typeof nested === "object") {
        const v = nested[k];
        if (v != null && String(v).trim() !== "") return String(v).trim();
      }
    }
  }
  return "";
}

function detectPlatform(item: RawItem, source: string): string {
  if (source.includes("facebook") || source.includes("meta")) return "Meta";
  if (source.includes("tiktok")) return "TikTok";
  if (source.includes("instagram")) return "Instagram";
  if (source.includes("youtube")) return "YouTube";
  return get(item, "platform", "source") || "Unknown";
}

function normalizeItem(item: RawItem, source: string, index: number): NormalizedAd {
  const platform = detectPlatform(item, source);

  // ad_url — best direct link to the ad
  const ad_url = get(
    item,
    "adArchiveID", // → will convert below
    "url", "adUrl", "ad_url", "link",
    "webVideoUrl", "videoUrl", "video_url",
    "libraryUrl", "ad_library_url",
  );
  // For Facebook, construct the library URL from archive ID
  const archiveId = get(item, "adArchiveID");
  const resolvedAdUrl = archiveId
    ? `https://www.facebook.com/ads/library/?id=${archiveId}`
    : ad_url;

  // creative_video_url — direct playable video
  const creative_video_url = get(
    item,
    "video_hd_url", "video_sd_url", // Facebook snapshot.videos[]
    "videoUrl", "video_url", "playAddr", "downloadAddr",
    "playUrl", "play_url",
  ) || (() => {
    // Facebook nested: snapshot.videos[0].video_hd_url
    const snap = item["snapshot"] as RawItem | undefined;
    const vids = (snap?.["videos"] as RawItem[]) ?? [];
    return (
      String(vids[0]?.["video_hd_url"] || vids[0]?.["video_sd_url"] || "")
    );
  })();

  // ad_copy — the text of the ad
  const ad_copy = get(
    item,
    "adText", "ad_copy", "text", "desc", "description", "bodyText",
    "caption", "body",
  ) || (() => {
    const snap = item["snapshot"] as RawItem | undefined;
    return get(snap as RawItem ?? {}, "body", "caption", "ad_copy");
  })();

  // hook — first 100 chars of ad_copy, or a dedicated hook field
  const rawHook = get(item, "hook", "hookType", "hook_type", "first3Seconds", "first_3_seconds");
  const hook = rawHook || (ad_copy ? ad_copy.slice(0, 100) : "");

  // format — creative format
  const format = get(item, "format", "formatType", "format_type", "contentType", "content_type", "mediaType")
    || (creative_video_url ? "Video" : "");

  // score — any performance/quality score
  const score = get(
    item,
    "score", "performanceScore", "performance_score",
    "overallScore", "overall_score", "qualityScore",
  );

  // scraped_at
  const scraped_at = new Date().toISOString();

  // id — prefer external id, fallback to index
  const id = get(item, "adArchiveID", "id", "externalId", "adId", "videoId") || String(index + 1);

  return {
    id,
    platform,
    ad_url: resolvedAdUrl,
    creative_video_url,
    ad_copy: ad_copy.slice(0, 1000), // cap at 1000 chars
    hook: hook.slice(0, 200),
    format,
    score,
    scraped_at,
  };
}

function toCSV(rows: NormalizedAd[]): string {
  if (rows.length === 0) return "";
  const headers: (keyof NormalizedAd)[] = [
    "id", "platform", "ad_url", "creative_video_url",
    "ad_copy", "hook", "format", "score", "scraped_at",
  ];
  const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const header = headers.join(",");
  const data = rows.map((r) => headers.map((h) => escape(r[h])).join(","));
  return [header, ...data].join("\n");
}

async function getFirstDatabaseId(): Promise<string | null> {
  try {
    const res = await fetch("http://localhost:3000/api/databases");
    if (!res.ok) return null;
    const data = await res.json() as { id: string }[] | { databases?: { id: string }[] };
    if (Array.isArray(data)) return data[0]?.id ?? null;
    return (data as { databases?: { id: string }[] }).databases?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

async function run() {
  let filepath: string;

  if (fileFlag !== -1 && args[fileFlag + 1]) {
    filepath = path.resolve(args[fileFlag + 1]);
  } else {
    const recent = getMostRecentRawFile();
    if (!recent) {
      console.error("❌ No raw files found in data/raw/. Run npm run scrape first.");
      process.exit(1);
    }
    filepath = recent;
  }

  if (!fs.existsSync(filepath)) {
    console.error(`❌ File not found: ${filepath}`);
    process.exit(1);
  }

  console.log(`\nNormalizing: ${path.basename(filepath)}`);
  const raw: RawItem[] = JSON.parse(fs.readFileSync(filepath, "utf-8"));
  console.log(`${raw.length} raw records`);

  if (raw.length === 0) {
    console.error("❌ Raw file is empty. Nothing to normalize.");
    process.exit(1);
  }

  const source = path.basename(filepath);
  const normalized = raw.map((item, i) => normalizeItem(item, source, i));

  // ── 1. Save 9-field CSV ─────────────────────────────────────
  const processedDir = path.resolve("data/processed");
  if (!fs.existsSync(processedDir)) fs.mkdirSync(processedDir, { recursive: true });

  const csvPath = path.join(processedDir, "ads.csv");
  const csv = toCSV(normalized);
  fs.writeFileSync(csvPath, csv, "utf-8");
  console.log(`\n✓ CSV saved → data/processed/ads.csv (${normalized.length} rows, 9 fields)`);

  // Also save timestamped copy for history
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const historyName = `${source.replace(".json", "")}--${timestamp}.csv`;
  fs.writeFileSync(path.join(processedDir, historyName), csv, "utf-8");
  console.log(`✓ History copy → data/processed/${historyName}`);

  // ── 2. Import into DB (if app is running) ───────────────────
  console.log("\nAttempting to import into database…");
  try {
    const dbId = await getFirstDatabaseId();
    if (!dbId) {
      console.log("⚠ No database found. Create one at http://localhost:3000/databases first.");
    } else {
      // Map our 9 canonical fields + extras to DB schema
      const rows = normalized.map((ad) => ({
        platform:         ad.platform,
        adLink:           ad.ad_url,
        creativeVideoUrl: ad.creative_video_url,
        adCopy:           ad.ad_copy,
        hookExample:      ad.hook,
        formatType:       ad.format,
        overallScore:     ad.score || null,
        reviewStatus:     "unreviewed",
        sourceActor:      source,
        externalId:       ad.id,
      }));

      const mapping: Record<string, string> = {};
      for (const k of Object.keys(rows[0])) mapping[k] = k;

      const res = await fetch("http://localhost:3000/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, mapping, databaseId: dbId }),
      });

      if (!res.ok) {
        const err = await res.text();
        console.log(`⚠ Import failed: ${err}`);
      } else {
        const result = await res.json() as { imported: number; errors: string[] };
        console.log(`✓ Imported ${result.imported} records into database (id: ${dbId})`);
        if (result.errors.length > 0) {
          console.warn(`  ${result.errors.length} errors:`, result.errors.slice(0, 3));
        }
      }
    }
  } catch {
    console.log("⚠ App not running — data saved to /data/processed/ but not imported into DB.");
    console.log("  Start the app with npm run dev, then re-run npm run normalize.");
  }

  console.log("\n✓ Done. Summary:");
  console.log(`  Records normalized : ${normalized.length}`);
  console.log(`  CSV location       : data/processed/ads.csv`);
  console.log(`  With video URL     : ${normalized.filter((a) => a.creative_video_url).length}`);
  console.log(`  With ad URL        : ${normalized.filter((a) => a.ad_url).length}`);
  console.log(`  With ad copy       : ${normalized.filter((a) => a.ad_copy).length}`);
}

run().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
