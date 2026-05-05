import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const databaseId = req.nextUrl.searchParams.get("databaseId") || "";
  if (!databaseId) return NextResponse.json({});

  const where = { databaseId };

  const [total, byHookType, byPlatform, byFormat] = await Promise.all([
    prisma.ad.count({ where }),
    prisma.ad.groupBy({ by: ["hookType"], where, _count: { id: true }, orderBy: { _count: { id: "desc" } }, take: 8 }),
    prisma.ad.groupBy({ by: ["platform"],  where, _count: { id: true }, orderBy: { _count: { id: "desc" } }, take: 8 }),
    prisma.ad.groupBy({ by: ["formatType"], where, _count: { id: true }, orderBy: { _count: { id: "desc" } }, take: 8 }),
  ]);

  return NextResponse.json({ total, byHookType, byPlatform, byFormat });
}
