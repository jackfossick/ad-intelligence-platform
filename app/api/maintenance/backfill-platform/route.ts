import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// One-off backfill for legacy ad rows ingested before the NWLA-43 normalizer fix.
// Mirrors lib/normalizeAdData.ts::inferPlatformFromUrl, kept inline to avoid
// touching the normalizer (NWLA-48 acceptance: do not refactor it).
function inferPlatformFromUrl(...urls: (string | null | undefined)[]): string | null {
  for (const u of urls) {
    if (!u) continue;
    const lower = String(u).toLowerCase();
    if (lower.includes("youtube.com") || lower.includes("youtu.be")) return "YouTube";
    if (lower.includes("tiktok.com")) return "TikTok";
    if (lower.includes("instagram.com")) return "Instagram";
    if (lower.includes("facebook.com") || lower.includes("fb.com")) return "Meta";
  }
  return null;
}

function urlsFromRawPayload(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const keys = [
      "referenceUrl", "source_url", "sourceUrl", "url",
      "video_url", "videoUrl", "ad_url", "adUrl",
      "ad_library_url", "adLibraryUrl", "permalink",
      "snapshot_url", "page_url",
    ];
    return keys
      .map((k) => obj[k])
      .filter((v): v is string => typeof v === "string" && v.length > 0);
  } catch {
    return [];
  }
}

export async function POST(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const databaseId = searchParams.get("databaseId") || "";
  const confirm = searchParams.get("confirm") === "1";
  const dryRun = !confirm;

  const ads = await prisma.ad.findMany({
    where: {
      ...(databaseId ? { databaseId } : {}),
      OR: [{ platform: null }, { platform: "" }],
    },
    select: {
      id: true,
      referenceUrl: true,
      adLink: true,
      adLibraryUrl: true,
      adSnapshotUrl: true,
      advertiserPageUrl: true,
      destinationUrl: true,
      creativeVideoUrl: true,
      rawSourcePayload: true,
    },
  });

  const byPlatform: Record<string, number> = {};
  const updates: Array<{ id: string; platform: string }> = [];
  const stillUnknown: string[] = [];

  for (const ad of ads) {
    const inferred = inferPlatformFromUrl(
      ad.referenceUrl,
      ad.adLink,
      ad.adLibraryUrl,
      ad.adSnapshotUrl,
      ad.advertiserPageUrl,
      ad.destinationUrl,
      ad.creativeVideoUrl,
      ...urlsFromRawPayload(ad.rawSourcePayload),
    );
    if (inferred) {
      byPlatform[inferred] = (byPlatform[inferred] ?? 0) + 1;
      updates.push({ id: ad.id, platform: inferred });
    } else {
      stillUnknown.push(ad.id);
    }
  }

  let written = 0;
  if (!dryRun && updates.length > 0) {
    // Group by inferred platform and batch updateMany for efficiency.
    const groups = new Map<string, string[]>();
    for (const u of updates) {
      const arr = groups.get(u.platform) ?? [];
      arr.push(u.id);
      groups.set(u.platform, arr);
    }
    for (const [platform, ids] of groups) {
      const res = await prisma.ad.updateMany({
        where: { id: { in: ids } },
        data: { platform },
      });
      written += res.count;
    }
  }

  return NextResponse.json({
    databaseId: databaseId || "(all databases)",
    dryRun,
    scanned: ads.length,
    inferable: updates.length,
    byPlatform,
    written,
    stillUnknown: stillUnknown.length,
    stillUnknownSample: stillUnknown.slice(0, 20),
  });
}
