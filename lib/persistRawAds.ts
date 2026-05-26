/**
 * Shared persistence helper for ingesting raw ad rows into the DB.
 *
 * Used by both:
 *   - POST /api/ads/bulk  — manual / Claude Chrome / CSV imports
 *   - GET  /api/discover  — automatic persistence on Bright Data snapshot ready
 *
 * Same normalization + dedupe + ImportJob bookkeeping in both flows so the
 * Library tab and Jobs page show the same shape regardless of source.
 */

import { prisma } from "@/lib/prisma";
import {
  normalizeAdData,
  type IngestionSource,
  type RawAd,
} from "@/lib/normalizeAdData";

export type DedupeStrategy = "skip" | "update" | "none";

export type PersistResult = {
  imported: number;
  skipped:  number;
  deduped:  number;
  failed:   number;
  errors:   string[];
  jobId:    string;
};

export type PersistOptions = {
  databaseId:      string;
  items:           RawAd[];
  source:          IngestionSource;
  actor?:          string | null;
  keyword?:        string | null;
  platform?:       string | null;
  dedupeStrategy?: DedupeStrategy;
};

/**
 * Normalize, dedupe and insert raw rows into the Ad table.
 *
 * Creates an ImportJob row so the run appears in Jobs history alongside
 * manual imports. Caller is responsible for validating the database
 * exists before calling (this helper throws if it does not).
 */
export async function persistRawAds(opts: PersistOptions): Promise<PersistResult> {
  const {
    databaseId,
    items,
    source,
    actor,
    keyword,
    platform,
  } = opts;
  const dedupeStrategy: DedupeStrategy = opts.dedupeStrategy ?? "skip";

  const db = await prisma.database.findUnique({ where: { id: databaseId } });
  if (!db) throw new Error(`Database ${databaseId} not found`);

  const job = await prisma.importJob.create({
    data: {
      source,
      databaseId,
      databaseName: db.name,
      status:       "running",
      totalRows:    items.length,
      keyword:      keyword ?? null,
      actor:        actor ?? null,
    },
  });

  const existingUrls = new Set<string>();
  if (dedupeStrategy !== "none") {
    const existingAds = await prisma.ad.findMany({
      where: { databaseId },
      select: { referenceUrl: true, adLibraryUrl: true, creativeVideoUrl: true },
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
      const normalized = normalizeAdData(raw, source, {
        actor:    actor ?? undefined,
        keyword:  keyword ?? undefined,
        platform: platform ?? undefined,
      });
      if (!normalized) { skipped++; continue; }

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

  return { imported, skipped, deduped, failed: errors.length, errors: errors.slice(0, 10), jobId: job.id };
}
