import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { normalizeAdData, type RawAd, type IngestionSource } from "@/lib/normalizeAdData";

// Allow-listed mutable fields for bulk PATCH — keeps the endpoint locked to
// review-mode actions and prevents callers from rewriting arbitrary columns.
const BULK_PATCH_ALLOWED = new Set<string>([
  "reviewStatus",
  "usefulnessStatus",
  "usefulnessReason",
  "usefulnessConfidence",
  "recommendedAction",
  "notes",
]);

/**
 * PATCH /api/ads/bulk
 *
 * Body: { ids: string[], patch: Record<string, unknown> }
 *
 * Applies the same patch to all listed ad IDs. Only fields in
 * BULK_PATCH_ALLOWED are accepted; unknown fields are silently dropped.
 * Returns { updated, requested, skipped, fields }.
 */
export async function PATCH(req: NextRequest) {
  const body = await req.json() as { ids?: string[]; patch?: Record<string, unknown> };
  const ids = Array.isArray(body.ids) ? body.ids.filter((v) => typeof v === "string" && v.length > 0) : [];
  const patch = body.patch ?? {};

  if (ids.length === 0) {
    return NextResponse.json({ error: "ids array is required and must be non-empty" }, { status: 400 });
  }

  const safePatch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (BULK_PATCH_ALLOWED.has(k)) safePatch[k] = v;
  }
  if (Object.keys(safePatch).length === 0) {
    return NextResponse.json({ error: "patch must include at least one allowed field" }, { status: 400 });
  }

  const result = await prisma.ad.updateMany({
    where: { id: { in: ids } },
    data: safePatch,
  });

  return NextResponse.json({
    updated: result.count,
    requested: ids.length,
    skipped: ids.length - result.count,
    fields: Object.keys(safePatch),
  });
}

/**
 * DELETE /api/ads/bulk
 *
 * Body: { ids: string[] }
 *
 * Hard-deletes all listed ads. Returns { deleted, requested }.
 */
export async function DELETE(req: NextRequest) {
  const body = await req.json() as { ids?: string[] };
  const ids = Array.isArray(body.ids) ? body.ids.filter((v) => typeof v === "string" && v.length > 0) : [];

  if (ids.length === 0) {
    return NextResponse.json({ error: "ids array is required and must be non-empty" }, { status: 400 });
  }

  const result = await prisma.ad.deleteMany({ where: { id: { in: ids } } });

  return NextResponse.json({
    deleted: result.count,
    requested: ids.length,
  });
}

/**
 * POST /api/ads/bulk
 *
 * Body:
 *   databaseId      string
 *   items           RawAd[]
 *   source          IngestionSource
 *   actor?          string
 *   keyword?        string
 *   dedupeStrategy? "skip" | "update" | "none"   (default: "skip")
 *
 * Returns:
 *   { imported, skipped, deduped, errors, jobId }
 */
export async function POST(req: NextRequest) {
  const body = await req.json() as {
    databaseId: string;
    items: RawAd[];
    source: IngestionSource;
    actor?: string;
    keyword?: string;
    dedupeStrategy?: "skip" | "update" | "none";
  };

  const { databaseId, items, source, actor, keyword } = body;
  const dedupeStrategy = body.dedupeStrategy ?? "skip";

  if (!databaseId)
    return NextResponse.json({ error: "databaseId is required" }, { status: 400 });
  if (!Array.isArray(items) || items.length === 0)
    return NextResponse.json({ error: "items array is required and must be non-empty" }, { status: 400 });
  if (!source)
    return NextResponse.json({ error: "source is required" }, { status: 400 });

  const db = await prisma.database.findUnique({ where: { id: databaseId } });
  if (!db)
    return NextResponse.json({ error: `Database ${databaseId} not found` }, { status: 404 });

  // Create a running job record
  const job = await prisma.importJob.create({
    data: {
      source,
      databaseId,
      databaseName: db.name,
      status: "running",
      totalRows: items.length,
      keyword: keyword ?? null,
      actor: actor ?? null,
    },
  });

  // Build set of existing URLs for deduplication
  let existingUrls = new Set<string>();
  if (dedupeStrategy !== "none") {
    const existingAds = await prisma.ad.findMany({
      where: { databaseId },
      select: { id: true, referenceUrl: true, adLibraryUrl: true, creativeVideoUrl: true },
    });
    for (const ad of existingAds) {
      if (ad.referenceUrl)     existingUrls.add(ad.referenceUrl);
      if (ad.adLibraryUrl)     existingUrls.add(ad.adLibraryUrl);
      if (ad.creativeVideoUrl) existingUrls.add(ad.creativeVideoUrl);
    }
  }

  let imported = 0;
  let skipped  = 0;
  let deduped  = 0;
  const errors: string[] = [];

  for (const raw of items) {
    try {
      const normalized = normalizeAdData(raw, source, { actor, keyword });

      if (!normalized) {
        skipped++;
        continue;
      }

      // Deduplicate
      if (dedupeStrategy !== "none") {
        const urlsToCheck = [
          normalized.referenceUrl,
          normalized.adLibraryUrl,
          normalized.creativeVideoUrl,
        ].filter(Boolean) as string[];

        const isDupe = urlsToCheck.some((u) => existingUrls.has(u));

        if (isDupe) {
          if (dedupeStrategy === "skip") {
            deduped++;
            continue;
          }
          if (dedupeStrategy === "update") {
            const existing = await prisma.ad.findFirst({
              where: {
                databaseId,
                OR: urlsToCheck.flatMap((u) => [
                  { referenceUrl: u },
                  { adLibraryUrl: u },
                  { creativeVideoUrl: u },
                ]),
              },
            });
            if (existing) {
              await prisma.ad.update({
                where: { id: existing.id },
                data: {
                  adCopy:           normalized.adCopy           ?? undefined,
                  views:            normalized.views            ?? undefined,
                  likes:            normalized.likes            ?? undefined,
                  comments:         normalized.comments         ?? undefined,
                  shares:           normalized.shares           ?? undefined,
                  lastSeen:         normalized.lastSeen         ?? undefined,
                  rawSourcePayload: normalized.rawSourcePayload ?? undefined,
                },
              });
              deduped++;
              continue;
            }
          }
        }

        // Register URLs so within-batch dupes are also caught
        urlsToCheck.forEach((u) => existingUrls.add(u));
      }

      await prisma.ad.create({
        data: {
          databaseId,
          platform:          normalized.platform,
          brandOrCreator:    normalized.brandOrCreator,
          externalId:        normalized.externalId,
          organicOrPaid:     normalized.organicOrPaid,
          sourceType:        normalized.sourceType,
          country:           normalized.country,
          referenceUrl:      normalized.referenceUrl,
          adLibraryUrl:      normalized.adLibraryUrl,
          creativeVideoUrl:  normalized.creativeVideoUrl,
          creativeImageUrl:  normalized.creativeImageUrl,
          thumbnailUrl:      normalized.thumbnailUrl,
          destinationUrl:    normalized.destinationUrl,
          advertiserPageUrl: normalized.advertiserPageUrl,
          adCopy:            normalized.adCopy,
          headline:          normalized.headline,
          description:       normalized.description,
          ctaType:           normalized.ctaType,
          offer:             normalized.offer,
          referenceTitle:    normalized.referenceTitle,
          views:             normalized.views,
          likes:             normalized.likes,
          comments:          normalized.comments,
          shares:            normalized.shares,
          impressions:       normalized.impressions,
          spend:             normalized.spend,
          currency:          normalized.currency,
          engagementProxy:   normalized.engagementProxy,
          firstSeen:         normalized.firstSeen,
          lastSeen:          normalized.lastSeen,
          notes:             normalized.notes,
          taggingStatus:     normalized.taggingStatus,
          reviewStatus:      normalized.reviewStatus,
          ingestionSource:   normalized.ingestionSource,
          ingestionKeyword:  normalized.ingestionKeyword,
          rawSourcePayload:  normalized.rawSourcePayload,
        },
      });

      imported++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(msg);
      skipped++;
    }
  }

  const finalStatus = errors.length > 0 && imported === 0 ? "failed"
    : errors.length > 0 ? "partial"
    : "success";

  await prisma.importJob.update({
    where: { id: job.id },
    data: {
      status:      finalStatus,
      imported,
      skipped,
      deduped,
      failed:      errors.length,
      errors:      errors.length > 0 ? JSON.stringify(errors.slice(0, 10)) : null,
      completedAt: new Date(),
    },
  });

  return NextResponse.json({ imported, skipped, deduped, errors: errors.slice(0, 10), jobId: job.id });
}
