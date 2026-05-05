import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const databaseId = searchParams.get("databaseId") || "";

  if (!databaseId) {
    return NextResponse.json({ ads: [], total: 0 });
  }

  // Fetch all ads for the database — client handles filtering/sorting/pagination
  // Dataset is small (max ~51 per database) so this is fine
  const ads = await prisma.ad.findMany({
    where: { databaseId },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ ads, total: ads.length });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { extraFields, ...rest } = body;

  const ad = await prisma.ad.create({
    data: {
      ...rest,
      extraFields: extraFields ? JSON.stringify(extraFields) : null,
    },
  });

  return NextResponse.json(ad, { status: 201 });
}
