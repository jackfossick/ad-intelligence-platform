import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { validateRow, summariseValidation } from "@/lib/schema-contract";

// ── Full export row builder ───────────────────────────────────
function toExportRow(ad: Record<string, unknown>) {
  return {
    id:                   String(ad.id ?? ""),
    platform:             String(ad.platform ?? ""),
    brand_or_creator:     String(ad.brandOrCreator ?? ad.brand ?? ""),
    organic_or_paid:      String(ad.organicOrPaid ?? ""),
    country:              String(ad.country ?? ""),
    ingestion_source:     String(ad.ingestionSource ?? ""),
    ingestion_keyword:    String(ad.ingestionKeyword ?? ""),
    reference_url:        String(ad.referenceUrl ?? ad.adLink ?? ""),
    ad_library_url:       String(ad.adLibraryUrl ?? ""),
    creative_video_url:   String(ad.creativeVideoUrl ?? ""),
    creative_image_url:   String(ad.creativeImageUrl ?? ""),
    thumbnail_url:        String(ad.thumbnailUrl ?? ""),
    destination_url:      String(ad.destinationUrl ?? ""),
    advertiser_page_url:  String(ad.advertiserPageUrl ?? ""),
    ad_copy:              String(ad.adCopy ?? ad.hookExample ?? ""),
    headline:             String(ad.headline ?? ""),
    description:          String(ad.description ?? ""),
    hook_example:         String(ad.hookExample ?? ""),
    hook_type:            String(ad.hookType ?? ""),
    creative_angle:       String(ad.creativeAngle ?? ""),
    format_type:          String(ad.formatType ?? ""),
    visual_style:         String(ad.visualStyle ?? ""),
    persona_target:       String(ad.personaTarget ?? ""),
    awareness_stage:      String(ad.awarenessStage ?? ""),
    desire:               String(ad.desire ?? ""),
    pain_point:           String(ad.painPoint ?? ""),
    cta_type:             String(ad.ctaType ?? ""),
    retention_structure:  String(ad.retentionStructure ?? ""),
    primary_emotional_trigger:   String(ad.primaryEmotionalTrigger ?? ""),
    secondary_emotional_trigger: String(ad.secondaryEmotionalTrigger ?? ""),
    proof_type:           String(ad.proofType ?? ""),
    proof_mechanism:      String(ad.proofMechanism ?? ""),
    virality_mechanic:    String(ad.viralityMechanic ?? ""),
    creative_bucket:      String(ad.creativeBucket ?? ""),
    hook_strength_score:          String(ad.hookStrengthScore ?? ""),
    audience_specificity_score:   String(ad.audienceSpecificityScore ?? ""),
    pain_clarity_score:           String(ad.painClarityScore ?? ""),
    desire_intensity_score:       String(ad.desireIntensityScore ?? ""),
    angle_quality_score:          String(ad.angleQualityScore ?? ""),
    message_clarity_score:        String(ad.messageClarityScore ?? ""),
    retention_quality_score:      String(ad.retentionQualityScore ?? ""),
    emotional_intensity_score:    String(ad.emotionalIntensityScore ?? ""),
    proof_strength_score:         String(ad.proofStrengthScore ?? ""),
    platform_native_fit_score:    String(ad.platformNativeFitScore ?? ""),
    shareability_score:           String(ad.shareabilityScore ?? ""),
    comment_potential_score:      String(ad.commentPotentialScore ?? ""),
    replicability_score:          String(ad.replicabilityScore ?? ""),
    ai_avatar_adaptability_score: String(ad.aiAvatarAdaptabilityScore ?? ""),
    production_difficulty_score:  String(ad.productionDifficultyScore ?? ""),
    compliance_risk_score:        String(ad.complianceRiskScore ?? ""),
    organic_viral_potential:  String(ad.organicViralPotential ?? ""),
    paid_ad_potential:        String(ad.paidAdPotential ?? ""),
    ai_replication_value:     String(ad.aiReplicationValue ?? ""),
    overall_usefulness_score: String(ad.overallUsefulnessScore ?? ad.overallScore ?? ""),
    usefulness_status:        String(ad.usefulnessStatus ?? ""),
    usefulness_reason:        String(ad.usefulnessReason ?? ""),
    usefulness_confidence:    String(ad.usefulnessConfidence ?? ""),
    recommended_action:       String(ad.recommendedAction ?? ""),
    why_it_likely_worked:           String(ad.whyItLikelyWorked ?? ad.whyItWorks ?? ""),
    why_it_likely_failed:           String(ad.whyItLikelyFailed ?? ""),
    main_creative_pattern:          String(ad.mainCreativePattern ?? ""),
    winning_hook_pattern:           String(ad.winningHookPattern ?? ""),
    retention_device:               String(ad.retentionDevice ?? ""),
    key_weakness:                   String(ad.keyWeakness ?? ""),
    best_reusable_element:          String(ad.bestReusableElement ?? ""),
    suggested_variations_to_test:   String(ad.suggestedVariationsToTest ?? ""),
    recommended_next_creative_test: String(ad.recommendedNextCreativeTest ?? ""),
    views:        String(ad.views ?? ""),
    likes:        String(ad.likes ?? ""),
    comments:     String(ad.comments ?? ""),
    shares:       String(ad.shares ?? ""),
    impressions:  String(ad.impressions ?? ""),
    spend:        String(ad.spend ?? ""),
    currency:     String(ad.currency ?? ""),
    tagging_status:    String(ad.taggingStatus ?? ""),
    review_status:     String(ad.reviewStatus ?? ""),
    confidence_score:  String(ad.confidenceScore ?? ""),
    confidence_reason: String(ad.confidenceReason ?? ""),
    ai_tagged_at:      String(ad.aiTaggedAt ?? ""),
    notes:      String(ad.notes ?? ""),
    created_at: String(ad.createdAt ?? ""),
    updated_at: String(ad.updatedAt ?? ""),
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const databaseId  = searchParams.get("databaseId") || "";
  const format      = (searchParams.get("format") || "csv").toLowerCase();
  const preview     = searchParams.get("preview") === "1";
  const summary     = searchParams.get("summary") === "1";
  const validate    = searchParams.get("validate") === "1";
  const validOnly   = searchParams.get("validOnly") === "1" || validate; // validate=1 implies valid-only export

  const ads = await prisma.ad.findMany({
    where: databaseId ? { databaseId } : {},
    orderBy: { createdAt: "desc" },
    ...(preview ? { take: 10 } : {}),
  });

  const adObjects = ads as unknown as Record<string, unknown>[];

  // ── Validation summary ────────────────────────────────────
  if (summary || preview) {
    const results = adObjects.map(validateRow);
    const validationSummary = summariseValidation(results);
    const limit = preview && !summary ? 10 : results.length;
    const rows = results.slice(0, limit).map((r) => ({
      id: r.id,
      blocked: r.blocked,
      issues: r.issues,
      row: r.row,
    }));
    return NextResponse.json({ summary: validationSummary, preview: rows });
  }

  // ── Filter to valid only if requested ─────────────────────
  const toExport = validOnly
    ? adObjects.filter((ad) => !validateRow(ad).blocked)
    : adObjects;

  // ── CSV ───────────────────────────────────────────────────
  if (format === "csv") {
    const rows = toExport.map(toExportRow);
    const csv = Papa.unparse(rows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="ads-export-${Date.now()}.csv"`,
      },
    });
  }

  // ── XLSX ──────────────────────────────────────────────────
  if (format === "xlsx") {
    const rows = toExport.map(toExportRow);
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ads");
    const buf  = XLSX.write(wb, { type: "base64", bookType: "xlsx" }) as string;
    const binary = Buffer.from(buf, "base64");
    return new NextResponse(binary, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="ads-export-${Date.now()}.xlsx"`,
      },
    });
  }

  // ── JSON ──────────────────────────────────────────────────
  if (format === "json") {
    const rows = toExport.map(toExportRow);
    const json = JSON.stringify(rows, null, 2);
    return new NextResponse(json, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="ads-export-${Date.now()}.json"`,
      },
    });
  }

  return NextResponse.json({ error: `Unsupported format: ${format}. Use csv, xlsx, or json.` }, { status: 400 });
}
