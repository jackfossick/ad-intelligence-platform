import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// Will be fully implemented in Step 9
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { rows, mapping, databaseId } = body as {
    rows: Record<string, string>[];
    mapping: Record<string, string>;
    databaseId: string;
  };

  if (!rows?.length || !databaseId) {
    return NextResponse.json({ error: "rows and databaseId required" }, { status: 400 });
  }

  const KNOWN = new Set([
    "externalId","brand","primaryCategory","subCategory","niche","segment","platform",
    "country","organicOrPaid","contentType","urlType","adLink","referenceUrl",
    "backupSearchUrl","adLibraryUrl","adSnapshotUrl","advertiserPageUrl","destinationUrl",
    "creativeVideoUrl","creativeImageUrl","hookType","hookExample","first3Seconds",
    "formatType","visualStyle","personaTarget","scriptStructure","ctaType","creativeAngle",
    "avatarOrCreativeType","adCopy","headline","description","offer","performanceScore",
    "hookScore","retentionScore","trustScore","conversionIntentScore","aiReplicabilityScore",
    "nicheTransferScore","overallScore","performanceProxyScore","whyItWorks","howToReplicate",
    "aiAvatarAdaptation","valueForUs","replicationInstruction","useCaseForUs","complianceRisk",
    "strategicTag","assetStatus","funnelStage","monetisationPath","notes","reviewStatus",
    "sourceActor","sourcePlatform","brandOrCreator","referenceTitle","referenceName","sourceType",
  ]);

  let imported = 0;
  const errors: string[] = [];

  for (const row of rows) {
    try {
      const known: Record<string, unknown> = {};
      const extra: Record<string, unknown> = {};

      for (const [srcCol, val] of Object.entries(row)) {
        const target = mapping[srcCol] || srcCol;
        if (target === "__skip__") continue;
        if (KNOWN.has(target)) known[target] = val || null;
        else extra[srcCol] = val;
      }

      await prisma.ad.create({
        data: {
          ...known,
          databaseId,
          reviewStatus: (known.reviewStatus as string) || "unreviewed",
          extraFields: Object.keys(extra).length ? JSON.stringify(extra) : null,
        },
      });
      imported++;
    } catch (e) {
      errors.push(String(e));
    }
  }

  return NextResponse.json({ imported, errors: errors.slice(0, 10) });
}
