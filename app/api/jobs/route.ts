/**
 * GET /api/jobs
 * Returns unified job log: Bright Data ScrapeRuns + ImportJobs merged and
 * sorted by createdAt desc.
 *
 * Optional query: ?databaseId=xxx to filter ImportJobs by DB.
 */

import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export type JobEntry = {
  id:           string;
  kind:         "scrape" | "import";
  source:       string;
  status:       string;
  databaseId?:  string;
  databaseName?: string;
  keyword?:     string;
  actor?:       string;
  platform?:    string;
  imported?:    number;
  skipped?:     number;
  failed?:      number;
  deduped?:     number;
  totalRows?:   number;
  rowCount?:    number;
  cost?:        number;
  errors?:      string[];
  // NWLA-49: request-side audit fields for scrape kind.
  maxResults?:  number;
  country?:     string;
  intent?:      string;
  triggerUrl?:  string;
  triggerBody?: unknown;
  createdAt:    string;
  completedAt?: string;
};

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const dbId = searchParams.get("databaseId") ?? undefined;

  const [scrapeRuns, importJobs] = await Promise.all([
    prisma.scrapeRun.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.importJob.findMany({
      where: dbId ? { databaseId: dbId } : undefined,
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  const entries: JobEntry[] = [
    ...scrapeRuns.map((r) => {
      let triggerBody: unknown = undefined;
      if (r.triggerBody) {
        try { triggerBody = JSON.parse(r.triggerBody); }
        catch { triggerBody = r.triggerBody; }
      }
      return {
        id:          r.id,
        kind:        "scrape" as const,
        source:      "brightdata",
        status:      r.status,
        databaseId:  r.databaseId ?? undefined,
        keyword:     r.keyword ?? undefined,
        actor:       r.actor,
        platform:    r.platform ?? undefined,
        rowCount:    r.rowCount ?? undefined,
        cost:        r.cost ?? undefined,
        maxResults:  r.maxResults ?? undefined,
        country:     r.country ?? undefined,
        intent:      r.intent ?? undefined,
        triggerUrl:  r.triggerUrl ?? undefined,
        triggerBody,
        createdAt:   r.createdAt.toISOString(),
      };
    }),
    ...importJobs.map((j) => ({
      id:           j.id,
      kind:         "import" as const,
      source:       j.source,
      status:       j.status,
      databaseId:   j.databaseId,
      databaseName: j.databaseName ?? undefined,
      keyword:      j.keyword ?? undefined,
      actor:        j.actor ?? undefined,
      imported:     j.imported ?? undefined,
      skipped:      j.skipped ?? undefined,
      failed:       j.failed ?? undefined,
      deduped:      j.deduped ?? undefined,
      totalRows:    j.totalRows ?? undefined,
      errors:       j.errors ? (JSON.parse(j.errors) as string[]) : undefined,
      createdAt:    j.createdAt.toISOString(),
      completedAt:  j.completedAt?.toISOString(),
    })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return NextResponse.json(entries);
}
