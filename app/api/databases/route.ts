import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const databases = await prisma.database.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { ads: true } } },
  });

  return NextResponse.json(
    databases.map((db) => ({
      id: db.id,
      name: db.name,
      description: db.description,
      adCount: db._count.ads,
    }))
  );
}

export async function POST(req: NextRequest) {
  const { name, description } = await req.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  const db = await prisma.database.create({
    data: { name: name.trim(), description: description?.trim() || null },
  });
  return NextResponse.json({ id: db.id, name: db.name, description: db.description, adCount: 0 }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();

  // Prevent deleting the last database
  const count = await prisma.database.count();
  if (count <= 1) {
    return NextResponse.json({ error: "Cannot delete the last database." }, { status: 400 });
  }

  // Delete all ads first, then the database
  await prisma.ad.deleteMany({ where: { databaseId: id } });
  await prisma.database.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
