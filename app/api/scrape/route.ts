import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const runs = await prisma.scrapeRun.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json(runs);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const run = await prisma.scrapeRun.create({
    data: {
      actor:       body.actor || "unknown",
      keyword:     body.keyword || null,
      platform:    body.platform || null,
      status:      body.status || "running",
      rowCount:    body.rowCount || null,
      cost:        body.cost || null,
      rawDataPath: body.rawDataPath || null,
    },
  });
  return NextResponse.json(run, { status: 201 });
}
