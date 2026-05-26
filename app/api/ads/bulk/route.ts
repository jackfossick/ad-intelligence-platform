import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { type RawAd, type IngestionSource } from "@/lib/normalizeAdData";
import { persistRawAds, type DedupeStrategy } from "@/lib/persistRawAds";

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
    dedupeStrategy?: DedupeStrategy;
  };

  const { databaseId, items, source, actor, keyword } = body;

  if (!databaseId)
    return NextResponse.json({ error: "databaseId is required" }, { status: 400 });
  if (!Array.isArray(items) || items.length === 0)
    return NextResponse.json({ error: "items array is required and must be non-empty" }, { status: 400 });
  if (!source)
    return NextResponse.json({ error: "source is required" }, { status: 400 });

  try {
    const result = await persistRawAds({
      databaseId,
      items,
      source,
      actor,
      keyword,
      dedupeStrategy: body.dedupeStrategy,
    });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ingest failed";
    const status = msg.startsWith("Database ") && msg.endsWith(" not found") ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
