import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ad = await prisma.ad.findUnique({ where: { id } });
  if (!ad) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(ad);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { id: _id, createdAt, updatedAt, database, extraFields, ...rest } = body;

  const ad = await prisma.ad.update({
    where: { id },
    data: {
      ...rest,
      extraFields: extraFields != null ? JSON.stringify(extraFields) : undefined,
    },
  });

  return NextResponse.json(ad);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.ad.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
