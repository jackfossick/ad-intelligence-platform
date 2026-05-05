import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import * as path from "path";

const prisma = new PrismaClient();

function str(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  return String(v).trim() || null;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(String(v));
  return isNaN(n) ? null : n;
}

function int(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = parseInt(String(v));
  return isNaN(n) ? null : n;
}

function readXlsx(filePath: string): Record<string, unknown>[] {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: "" }) as Record<string, unknown>[];
}

async function seed() {
  console.log("Clearing existing data…");
  await prisma.ad.deleteMany();
  await prisma.database.deleteMany();

  // ─── Database 1: Ad Intelligence Final (5 rows) ──────────────────────────
  console.log("\nSeeding Database 1: Ad Intelligence Final…");
  const db1 = await prisma.database.create({
    data: { name: "Ad Intelligence Final", description: "Core ad intelligence — 5 high-signal entries" },
  });

  const rows1 = readXlsx(path.resolve("../Claude/ad_intelligence_final.xlsx"));
  for (const r of rows1) {
    await prisma.ad.create({
      data: {
        databaseId:      db1.id,
        externalId:      str(r.ID),
        primaryCategory: str(r.Primary_Category),
        subCategory:     str(r.Sub_Category),
        platform:        str(r.Platform),
        urlType:         str(r.Link_Type),
        adLink:          str(r.Ad_Link),
        hookType:        str(r.Hook_Type),
        hookExample:     str(r.Hook_Example),
        formatType:      str(r.Format_Type),
        personaTarget:   str(r.Persona_Target),
        scriptStructure: str(r.Script_Structure),
        ctaType:         str(r.CTA_Type),
        performanceScore: num(r.Performance_Score),
        whyItWorks:      str(r.Why_It_Works),
        howToReplicate:  str(r.How_To_Replicate),
        useCaseForUs:    str(r.Use_Case_For_Us),
        notes:           str(r.Notes),
        reviewStatus:    "unreviewed",
      },
    });
  }
  console.log(`  ✓ ${rows1.length} ads inserted`);

  // ─── Database 2: Creative Reference Library (30 rows) ────────────────────
  console.log("\nSeeding Database 2: Creative Reference Library…");
  const db2 = await prisma.database.create({
    data: { name: "Creative Reference Library", description: "30 prioritised creative references with 6-part scoring" },
  });

  const rows2 = readXlsx(path.resolve("../Claude/ad_intelligence_v1_1_importable.xlsx"));
  for (const r of rows2) {
    await prisma.ad.create({
      data: {
        databaseId:           db2.id,
        priorityRank:         int(r.Priority_Rank),
        segment:              str(r.Segment),
        niche:                str(r.Niche),
        referenceName:        str(r.Reference_Name),
        platform:             str(r.Platform),
        sourceType:           str(r.Source_Type),
        referenceUrl:         str(r.Reference_URL),
        hookType:             str(r.Hook_Type),
        first3Seconds:        str(r.First_3_Seconds),
        creativeAngle:        str(r.Creative_Angle),
        avatarOrCreativeType: str(r.Avatar_or_Creative_Type),
        scriptStructure:      str(r.Script_Structure),
        funnelStage:          str(r.Funnel_Stage),
        monetisationPath:     str(r.Monetisation_Path),
        ctaType:              str(r.CTA),
        personaTarget:        str(r.Target_Persona),
        valueForUs:           str(r.Value_For_Us),
        replicationInstruction: str(r.Replication_Instruction),
        hookScore:            num(r.Hook_Score),
        retentionScore:       num(r.Retention_Score),
        trustScore:           num(r.Trust_Score),
        conversionIntentScore: num(r.Conversion_Intent_Score),
        aiReplicabilityScore: num(r.AI_Replicability_Score),
        nicheTransferScore:   num(r.Niche_Transferability_Score),
        overallScore:         num(r.Overall_Performance_Proxy_100),
        assetStatus:          str(r.Asset_Status),
        strategicTag:         str(r.Strategic_Tag),
        backupSearchUrl:      str(r.Backup_Search_URL),
        reviewStatus:         "unreviewed",
      },
    });
  }
  console.log(`  ✓ ${rows2.length} ads inserted`);

  // ─── Database 3: Real Links Database (51 rows) ───────────────────────────
  console.log("\nSeeding Database 3: Real Links Database…");
  const db3 = await prisma.database.create({
    data: { name: "Real Links Database", description: "51 real reference links — verified URLs, direct videos and search links" },
  });

  const rows3 = readXlsx(path.resolve("../Claude/ad_intelligence_v3_real_links.xlsx"));
  for (const r of rows3) {
    // URL_Reviewed is a date string if reviewed, blank if not
    const reviewed = str(r.URL_Reviewed) !== null;

    await prisma.ad.create({
      data: {
        databaseId:          db3.id,
        externalId:          str(r.ID),
        strategicPriority:   int(r.Strategic_Priority),
        primaryCategory:     str(r.Primary_Category),
        subCategory:         str(r.Sub_Category),
        niche:               str(r.Niche),
        platform:            str(r.Platform),
        contentType:         str(r.Content_Type),
        urlType:             str(r.URL_Type),
        referenceUrl:        str(r.Reference_URL),
        brandOrCreator:      str(r.Brand_or_Creator),
        referenceTitle:      str(r.Reference_Title),
        hookType:            str(r.Hook_Type),
        hookExample:         str(r.Hook_Example),
        formatType:          str(r.Format_Type),
        personaTarget:       str(r.Persona_Target),
        scriptStructure:     str(r.Script_Structure),
        ctaType:             str(r.CTA_Type),
        performanceProxyScore: num(r.Performance_Proxy_Score),
        whyItWorks:          str(r.Why_It_Works),
        howToReplicate:      str(r.How_To_Replicate),
        valueForUs:          str(r.Value_For_Us),
        complianceRisk:      str(r.Compliance_Risk),
        urlReviewed:         reviewed,
        notes:               str(r.Notes),
        reviewStatus:        "unreviewed",
      },
    });
  }
  console.log(`  ✓ ${rows3.length} ads inserted`);

  // ─── Summary ─────────────────────────────────────────────────────────────
  const total = await prisma.ad.count();
  console.log(`\n✅ Seed complete — ${total} ads across 3 databases\n`);
}

seed()
  .catch((e) => { console.error("Seed failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
