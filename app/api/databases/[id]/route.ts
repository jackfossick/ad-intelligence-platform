import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { name, description } = await req.json() as { name?: string; description?: string };

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  try {
    const db = await prisma.database.update({
      where: { id },
      data: {
        name: name.trim(),
        description: description?.trim() ?? null,
      },
    });
    return NextResponse.json({ id: db.id, name: db.name, description: db.description });
  } catch {
    return NextResponse.json({ error: "Database not found" }, { status: 404 });
  }
}
