"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import { useDb } from "@/lib/db-context";
import { normalise, platformBadgeClass, getYouTubeId } from "@/lib/normalise";
import AdPanel from "@/components/AdPanel";
import ConfirmModal from "@/components/ConfirmModal";

type Ad = Record<string, unknown>;

const PAGE_SIZE_COMPACT  = 30;
const PAGE_SIZE_DETAILED = 15;

const PLATFORM_COLORS: Record<string, string> = {
  tiktok: "#000000", facebook: "#1877F2", instagram: "#E1306C",
  youtube: "#FF0000", meta: "#1877F2", pinterest: "#E60023",
  snapchat: "#FFFC00", twitter: "#1DA1F2",
};
const PLATFORM_ICONS: Record<string, string> = {
  tiktok: "♪", facebook: "f", instagram: "◉", youtube: "▶",
  meta: "f", pinterest: "P", snapchat: "◎", twitter: "𝕏",
};

// ── Helpers ───────────────────────────────────────────────────
function getVideoUrl(ad: Ad): string {
  return ((ad.creativeVideoUrl || ad.creative_video_url || "") as string);
}
function getPrimaryUrl(ad: Ad): string {
  const n = normalise(ad);
  return getVideoUrl(ad) || n._url || "";
}
function fmtNum(v: unknown): string | null {
  const n = Number(v);
  if (isNaN(n) || v === null || v === undefined || v === "") return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
function fmtDate(v: unknown): string | null {
  if (!v) return null;
  try {
    return new Date(String(v)).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  } catch { return null; }
}

// ── Source badge ──────────────────────────────────────────────
const SOURCE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  brightdata:   { label: "BrightData", color: "#0F766E", bg: "#CCFBF1" },
  apify:        { label: "Apify",      color: "#1D64D8", bg: "#EEF4FF" },
  claude_chrome:{ label: "Chrome",     color: "#6B21A8", bg: "#F3E8FF" },
  csv:          { label: "CSV",        color: "#065F46", bg: "#ECFDF5" },
  manual:       { label: "Manual",     color: "#633806", bg: "#FEF3DA" },
};
function SourceBadge({ source }: { source?: unknown }) {
  if (!source) return null;
  const cfg = SOURCE_CONFIG[String(source)] ?? { label: String(source), color: "#555", bg: "#F3F4F6" };
  return (
    <span style={{ fontSize: 9, fontWeight: 600, padding: "1px 5px", borderRadius: 6, color: cfg.color, background: cfg.bg, letterSpacing: "0.03em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
      {cfg.label}
    </span>
  );
}

// ── Tagging badge ─────────────────────────────────────────────
const TAGGING_CONFIG: Record<string, { label: string; color: string }> = {
  untagged:    { label: "Untagged",  color: "#9CA3AF" },
  ai_tagged:   { label: "AI Tagged", color: "#27A06A" },
  ai_tagging:  { label: "Tagging…",  color: "#D4870A" },
};
function TaggingBadge({ status }: { status?: unknown }) {
  if (!status || status === "untagged") return null;
  const cfg = TAGGING_CONFIG[String(status)] ?? { label: String(status), color: "#9CA3AF" };
  return <span style={{ fontSize: 9, color: cfg.color, fontWeight: 600, whiteSpace: "nowrap" }}>{cfg.label}</span>;
}

// ── Usefulness badge ──────────────────────────────────────────
const USEFULNESS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  useful:     { label: "✓ Useful",     color: "#085041", bg: "#E1F5EE" },
  not_useful: { label: "✗ Not useful", color: "#7A1F1F", bg: "#FEECEC" },
  uncertain:  { label: "? Uncertain",  color: "#633806", bg: "#FEF3DA" },
};
function UsefulnessBadge({ status, confidence }: { status?: unknown; confidence?: unknown }) {
  if (!status) return null;
  const cfg = USEFULNESS_CONFIG[String(status)];
  if (!cfg) return null;
  const conf = Number(confidence);
  return (
    <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 10, color: cfg.color, background: cfg.bg, whiteSpace: "nowrap" }}
      title={!isNaN(conf) ? `AI confidence: ${conf}%` : undefined}>
      {cfg.label}{!isNaN(conf) ? ` · ${conf}%` : ""}
    </span>
  );
}

// ── Review status ─────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  new:        { label: "New",      color: "#633806", bg: "#FEF3DA" },
  unreviewed: { label: "New",      color: "#633806", bg: "#FEF3DA" },
  reviewed:   { label: "Reviewed", color: "#0C447C", bg: "#E6F1FB" },
  useful:     { label: "✓ Useful", color: "#085041", bg: "#E1F5EE" },
  rejected:   { label: "✗ Skipped", color: "#7A1F1F", bg: "#FEECEC" },
};
function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status?.toLowerCase()] ?? STATUS_CONFIG.new;
  return (
    <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 12, color: cfg.color, background: cfg.bg, whiteSpace: "nowrap" }}>
      {cfg.label}
    </span>
  );
}

// ── Compact quick-status: badge first, then minimal actions ──
function QuickStatus({ ad, onUpdate }: { ad: Ad; onUpdate: (id: string, status: string) => void }) {
  const [saving, setSaving] = useState(false);
  const current = (ad.reviewStatus as string) || "new";

  const setStatus = async (status: string) => {
    if (saving) return;
    setSaving(true);
    await fetch(`/api/ads/${ad.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewStatus: status }),
    });
    onUpdate(ad.id as string, status);
    setSaving(false);
  };

  const isResolved = current === "useful" || current === "rejected";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }} onClick={(e) => e.stopPropagation()}>
      <StatusBadge status={current} />
      {isResolved ? (
        <button onClick={() => setStatus("new")} disabled={saving} title="Reset to New"
          style={{ fontSize: 9, padding: "1px 5px", borderRadius: 8, border: "1px solid #D1D5DB", color: "#6B7280", background: "transparent", cursor: "pointer", fontFamily: "var(--font-sans)", alignSelf: "flex-start" }}>
          ↺ Reset
        </button>
      ) : (
        <div style={{ display: "flex", gap: 3 }}>
          <button onClick={() => setStatus("useful")} disabled={saving}
            style={{ fontSize: 9, padding: "1px 5px", borderRadius: 8, border: "1px solid #27A06A", color: "#27A06A", background: "transparent", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
            ✓
          </button>
          <button onClick={() => setStatus("rejected")} disabled={saving}
            style={{ fontSize: 9, padding: "1px 5px", borderRadius: 8, border: "1px solid #D14040", color: "#D14040", background: "transparent", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
            ✗
          </button>
        </div>
      )}
    </div>
  );
}

// ── Score pill ────────────────────────────────────────────────
function ScorePill({ value, label, size = "sm" }: { value: unknown; label: string; size?: "sm" | "lg" }) {
  const n = Number(value);
  if (isNaN(n) || value === null || value === undefined || value === "") return null;
  const color = n >= 7 ? "#085041" : n >= 5 ? "#633806" : "#7A1F1F";
  const bg    = n >= 7 ? "#E1F5EE" : n >= 5 ? "#FEF3DA" : "#FEECEC";
  return (
    <span title={label} style={{ fontSize: size === "lg" ? 13 : 10, fontWeight: 700, padding: size === "lg" ? "3px 8px" : "1px 5px", borderRadius: 8, color, background: bg, whiteSpace: "nowrap" }}>
      {n.toFixed(1)}
    </span>
  );
}

// ── Thumbnail with fallback chain ────────────────────────────
function Thumb({ ad, size = "sm", linkUrl }: { ad: Ad; size?: "sm" | "lg"; linkUrl?: string }) {
  const n = normalise(ad);
  const ytId = getYouTubeId(n._url);
  const platform = (n._platform || "").toLowerCase();

  // Build priority list
  const candidates: string[] = [];
  if (ad.thumbnailUrl)     candidates.push(ad.thumbnailUrl as string);
  if (ad.creativeImageUrl) candidates.push(ad.creativeImageUrl as string);
  if (ytId)                candidates.push(`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`);

  const [idx, setIdx] = useState(0);
  const currentUrl = candidates[idx] ?? "";

  const w = size === "lg" ? 160 : 52;
  const h = size === "lg" ? 120 : 52;

  const inner = currentUrl ? (
    <img
      src={currentUrl}
      alt=""
      referrerPolicy="no-referrer"
      crossOrigin="anonymous"
      onError={() => setIdx((i) => i + 1)}
      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
    />
  ) : (
    <div style={{
      width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
      background: (PLATFORM_COLORS[platform] || "#6B7280") + "22",
      color: PLATFORM_COLORS[platform] || "#6B7280",
      fontSize: size === "lg" ? 28 : 16, opacity: 0.7,
    }}>
      {PLATFORM_ICONS[platform] || "▶"}
    </div>
  );

  const wrapper = (
    <div style={{
      width: w, height: h, borderRadius: size === "lg" ? 8 : 6,
      overflow: "hidden", flexShrink: 0, background: "#F3F4F6",
      border: "1px solid var(--color-border-tertiary)",
      position: "relative",
    }}>
      {inner}
      {linkUrl && size === "lg" && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0)", transition: "background 0.15s",
          color: "white", fontSize: 22,
        }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.35)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0)"; }}
        >
          <span style={{ opacity: 0.9, textShadow: "0 1px 4px rgba(0,0,0,0.6)" }}>▶</span>
        </div>
      )}
    </div>
  );

  if (linkUrl) {
    return (
      <a href={linkUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
        style={{ display: "block", flexShrink: 0 }}>
        {wrapper}
      </a>
    );
  }
  return wrapper;
}

// ── Filter chip ───────────────────────────────────────────────
function FilterChip({ label, value, options, onChange }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`filter-select${value ? " active" : ""}`}>
      <option value="">{label}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

// ── Pagination ────────────────────────────────────────────────
function getPageNums(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "…", total];
  if (current >= total - 3) return [1, "…", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "…", current - 1, current, current + 1, "…", total];
}

// ── Bulk tag helpers ──────────────────────────────────────────
function sc(v: unknown): number { const n = Number(v); return isNaN(n) ? 0 : Math.min(10, Math.max(0, n)); }
function r1(v: number): number { return Math.round(v * 10) / 10; }

function mapTagResult(raw: Record<string, unknown>): Record<string, unknown> {
  const mapped: Record<string, unknown> = {
    hookExample: raw.hook_text, hookType: raw.hook_type, personaTarget: raw.target_persona,
    awarenessStage: raw.awareness_stage, painPoint: raw.pain_point, desire: raw.desire,
    creativeAngle: raw.creative_angle, retentionStructure: raw.retention_structure,
    formatType: raw.creative_format, primaryEmotionalTrigger: raw.primary_emotional_trigger,
    secondaryEmotionalTrigger: raw.secondary_emotional_trigger,
    proofType: raw.proof_type, proofMechanism: raw.proof_mechanism,
    ctaType: raw.cta_type, viralityMechanic: raw.virality_mechanic,
    hookStrengthScore: raw.hook_strength_score, audienceSpecificityScore: raw.audience_specificity_score,
    painClarityScore: raw.pain_clarity_score, desireIntensityScore: raw.desire_intensity_score,
    angleQualityScore: raw.angle_quality_score, messageClarityScore: raw.message_clarity_score,
    retentionQualityScore: raw.retention_quality_score, emotionalIntensityScore: raw.emotional_intensity_score,
    proofStrengthScore: raw.proof_strength_score, platformNativeFitScore: raw.platform_native_fit_score,
    shareabilityScore: raw.shareability_score, commentPotentialScore: raw.comment_potential_score,
    conversionIntentScore: raw.conversion_intent_score, replicabilityScore: raw.replicability_score,
    aiAvatarAdaptabilityScore: raw.ai_avatar_adaptability_score,
    productionDifficultyScore: raw.production_difficulty_score,
    complianceRiskScore: raw.compliance_risk_score,
    whyItLikelyWorked: raw.why_it_likely_worked, whyItLikelyFailed: raw.why_it_likely_failed,
    mainCreativePattern: raw.main_creative_pattern, winningHookPattern: raw.winning_hook_pattern,
    retentionDevice: raw.retention_device, keyWeakness: raw.key_weakness,
    bestReusableElement: raw.best_reusable_element,
    suggestedVariationsToTest: raw.suggested_variations_to_test,
    recommendedNextCreativeTest: raw.recommended_next_creative_test,
    creativeBucket: raw.creative_bucket, confidenceScore: raw.confidence_score,
    confidenceReason: raw.confidence_reason, usefulnessStatus: raw.usefulness_status,
    usefulnessReason: raw.usefulness_reason, usefulnessConfidence: raw.usefulness_confidence,
    recommendedAction: raw.recommended_action,
  };
  const organic = r1(sc(mapped.hookStrengthScore)*0.20 + sc(mapped.platformNativeFitScore)*0.15 + sc(mapped.retentionQualityScore)*0.15 + sc(mapped.emotionalIntensityScore)*0.15 + sc(mapped.shareabilityScore)*0.15 + sc(mapped.commentPotentialScore)*0.10);
  const paid    = r1(sc(mapped.hookStrengthScore)*0.20 + sc(mapped.audienceSpecificityScore)*0.15 + sc(mapped.painClarityScore)*0.15 + sc(mapped.proofStrengthScore)*0.15 + sc(mapped.messageClarityScore)*0.15 + sc(mapped.conversionIntentScore)*0.10);
  const ai      = r1(Math.max(0, sc(mapped.replicabilityScore)*0.20 + sc(mapped.hookStrengthScore)*0.15 + sc(mapped.angleQualityScore)*0.15 + sc(mapped.platformNativeFitScore)*0.15 + sc(mapped.emotionalIntensityScore)*0.15 + sc(mapped.aiAvatarAdaptabilityScore)*0.10 - sc(mapped.productionDifficultyScore)*0.10 - sc(mapped.complianceRiskScore)*0.10));
  const overall = r1(ai*0.40 + organic*0.30 + paid*0.30);
  return { ...mapped, organicViralPotential: organic, paidAdPotential: paid, aiReplicationValue: ai, overallUsefulnessScore: overall, taggingStatus: "ai_tagged", aiTaggedAt: new Date().toISOString() };
}

async function tagSingleAd(ad: Ad): Promise<Record<string, unknown>> {
  const evidence = {
    source_platform: ad.platform || ad.sourcePlatform || "",
    source_url: ad.referenceUrl || ad.adLink || "",
    creative_video_url: ad.creativeVideoUrl || ad.adLink || "",
    brand_or_creator: ad.brandOrCreator || ad.brand || "",
    organic_or_paid: ad.organicOrPaid || "",
    caption_or_ad_copy: ad.adCopy || ad.hookExample || "",
    transcript: "", visible_text_on_screen: ad.description || "",
    posted_date: "", views: ad.views || "", likes: ad.likes || "",
    comments: ad.comments || "", shares: ad.shares || "", saves: "",
  };
  const res = await fetch("/api/tag-ad", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(evidence) });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as Record<string,string>).error || `HTTP ${res.status}`); }
  const data = await res.json() as { result?: Record<string, unknown>; error?: string };
  if (data.error) throw new Error(data.error);
  if (!data.result) throw new Error("Empty result");
  return mapTagResult(data.result);
}

// ── Detailed card ─────────────────────────────────────────────
function DetailedCard({
  ad, isSelected, onSelect, onUpdate, onDelete, onStatusUpdate, onTagSingle,
}: {
  ad: Ad;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (id: string, fields: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
  onStatusUpdate: (id: string, status: string) => void;
  onTagSingle: (ad: Ad) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [tagging, setTagging] = useState(false);

  const n = normalise(ad);
  const videoUrl    = getVideoUrl(ad);
  const primaryUrl  = getPrimaryUrl(ad);
  const destUrl     = (ad.destinationUrl as string) || "";
  const platform    = (n._platform || "").toLowerCase();
  const brand       = String(ad.brandOrCreator || ad.brand || "").trim();
  const copy        = String(ad.adCopy || ad.hookExample || ad.description || "").trim();
  const hook        = String(ad.hookType || "").trim();
  const angle       = String(ad.creativeAngle || "").trim();
  const format      = String(ad.formatType || "").trim();
  const status      = String(ad.reviewStatus || "new");
  const isToDelete  = status === "rejected" || ad.recommendedAction === "delete_candidate";

  const setStatus = async (s: string) => {
    if (saving) return;
    setSaving(true);
    await fetch(`/api/ads/${ad.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reviewStatus: s }) });
    onStatusUpdate(ad.id as string, s);
    setSaving(false);
  };

  const handleDelete = () => {
    onDelete(ad.id as string);
  };

  const handleTagThis = async () => {
    setTagging(true);
    try { await onTagSingle(ad); } finally { setTagging(false); }
  };

  const views    = fmtNum(ad.views);
  const likes    = fmtNum(ad.likes);
  const comments = fmtNum(ad.comments);
  const shares   = fmtNum(ad.shares);
  const dateStr  = fmtDate(ad.firstSeen || ad.scrapedAt || ad.createdAt);

  const overallScore = ad.overallUsefulnessScore ?? ad.overallScore;

  return (
    <div
      style={{
        border: `1.5px solid ${isSelected ? "var(--color-accent)" : isToDelete ? "#FCA5A5" : "var(--color-border-secondary)"}`,
        borderRadius: 10, marginBottom: 10, background: "var(--color-background-primary)",
        overflow: "hidden", cursor: "pointer",
        boxShadow: isSelected ? "0 0 0 3px var(--color-accent-light)" : "none",
        opacity: isToDelete ? 0.75 : 1,
      }}
      onClick={onSelect}
    >
      {/* ── Main content row ──── */}
      <div style={{ display: "flex", gap: 0 }}>

        {/* LEFT: Thumbnail */}
        <div style={{ flexShrink: 0, padding: "14px 0 14px 14px" }} onClick={(e) => e.stopPropagation()}>
          <Thumb ad={ad} size="lg" linkUrl={primaryUrl || undefined} />
          {(videoUrl || primaryUrl) && (
            <div style={{ marginTop: 6, textAlign: "center" }}>
              <a href={videoUrl || primaryUrl} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 10, color: "var(--color-accent)", fontWeight: 600, textDecoration: "none" }}>
                {videoUrl ? "▶ Video" : "↗ Open"}
              </a>
            </div>
          )}
        </div>

        {/* RIGHT: Content */}
        <div style={{ flex: 1, padding: "14px 14px 10px 14px", minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>

          {/* Row 1: Platform / source / brand / status */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {n._platform && (
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {PLATFORM_COLORS[platform] && (
                  <div style={{ width: 16, height: 16, borderRadius: 3, background: PLATFORM_COLORS[platform], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "white", fontWeight: 700, flexShrink: 0 }}>
                    {PLATFORM_ICONS[platform] || "•"}
                  </div>
                )}
                <span className={`badge ${platformBadgeClass(n._platform)}`} style={{ fontSize: 10 }}>{n._platform}</span>
              </div>
            )}
            {!!ad.organicOrPaid && (
              <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 6, background: String(ad.organicOrPaid) === "paid" ? "#E6F1FB" : "#ECFDF5", color: String(ad.organicOrPaid) === "paid" ? "#0C447C" : "#085041", fontWeight: 600, textTransform: "uppercase" }}>
                {String(ad.organicOrPaid)}
              </span>
            )}
            <SourceBadge source={ad.ingestionSource} />
            {brand && <span style={{ fontSize: 11, color: "var(--color-text-secondary)", fontWeight: 500 }}>{brand}</span>}
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }} onClick={(e) => e.stopPropagation()}>
              <StatusBadge status={status} />
              <TaggingBadge status={ad.taggingStatus} />
            </div>
          </div>

          {/* Row 2: Hook / angle / format chips */}
          {(hook || angle || format) && (
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {hook   && <span className="chip" style={{ fontSize: 10 }}>🪝 {hook}</span>}
              {angle  && <span className="chip" style={{ fontSize: 10 }}>📐 {angle}</span>}
              {format && <span className="chip" style={{ fontSize: 10 }}>🎬 {format}</span>}
            </div>
          )}

          {/* Row 3: Ad copy */}
          {copy && (
            <p style={{ fontSize: 12, color: "var(--color-text-primary)", lineHeight: 1.55, margin: 0, display: "-webkit-box", WebkitLineClamp: 5, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {copy}
            </p>
          )}

          {/* Row 4: AI usefulness */}
          {!!ad.usefulnessStatus && (
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <UsefulnessBadge status={ad.usefulnessStatus} confidence={ad.usefulnessConfidence} />
              {!!ad.usefulnessReason && (
                <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: 0, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {String(ad.usefulnessReason)}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Scores row ────────────────────────────────────────── */}
      {(overallScore !== null && overallScore !== undefined) && (
        <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderTop: "1px solid var(--color-border-tertiary)", background: "var(--color-background-secondary)", flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginRight: 2 }}>Scores:</span>
          <ScorePill value={overallScore}                     label="Overall" size="lg" />
          <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>Overall</span>
          {ad.hookStrengthScore    !== null && ad.hookStrengthScore    !== undefined && <><ScorePill value={ad.hookStrengthScore}    label="Hook strength" />    <span style={{ fontSize: 9, color: "var(--color-text-tertiary)" }}>Hook</span></>}
          {ad.retentionQualityScore !== null && ad.retentionQualityScore !== undefined && <><ScorePill value={ad.retentionQualityScore} label="Retention quality" /> <span style={{ fontSize: 9, color: "var(--color-text-tertiary)" }}>Retention</span></>}
          {ad.proofStrengthScore   !== null && ad.proofStrengthScore   !== undefined && <><ScorePill value={ad.proofStrengthScore}   label="Proof strength" />   <span style={{ fontSize: 9, color: "var(--color-text-tertiary)" }}>Proof</span></>}
          {ad.platformNativeFitScore !== null && ad.platformNativeFitScore !== undefined && <><ScorePill value={ad.platformNativeFitScore} label="Platform fit" />  <span style={{ fontSize: 9, color: "var(--color-text-tertiary)" }}>Fit</span></>}
          {ad.replicabilityScore   !== null && ad.replicabilityScore   !== undefined && <><ScorePill value={ad.replicabilityScore}   label="Replicability" />    <span style={{ fontSize: 9, color: "var(--color-text-tertiary)" }}>Repl.</span></>}
        </div>
      )}

      {/* ── Metrics row ───────────────────────────────────────── */}
      {(views || likes || comments || shares || dateStr) && (
        <div style={{ display: "flex", gap: 14, padding: "6px 14px", borderTop: "1px solid var(--color-border-tertiary)", background: "var(--color-background-secondary)", flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>Metrics:</span>
          {views    && <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}><strong>{views}</strong> views</span>}
          {likes    && <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}><strong>{likes}</strong> likes</span>}
          {comments && <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}><strong>{comments}</strong> comments</span>}
          {shares   && <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}><strong>{shares}</strong> shares</span>}
          {dateStr  && <span style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginLeft: "auto" }}>{dateStr}</span>}
        </div>
      )}

      {/* ── Action row ────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderTop: "1px solid var(--color-border-tertiary)", flexWrap: "wrap", alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
        {primaryUrl && (
          <a href={primaryUrl} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 7, border: "1px solid var(--color-accent)", color: "var(--color-accent-dark)", background: "var(--color-accent-light)", textDecoration: "none", whiteSpace: "nowrap" }}>
            {videoUrl ? "▶ Video" : "↗ Source"}
          </a>
        )}
        {destUrl && (
          <a href={destUrl} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 7, border: "1px solid var(--color-border-secondary)", color: "var(--color-text-secondary)", background: "transparent", textDecoration: "none", whiteSpace: "nowrap" }}>
            ↗ Landing
          </a>
        )}
        <button onClick={onSelect}
          style={{ fontSize: 11, padding: "3px 9px", borderRadius: 7, border: "1px solid var(--color-border-secondary)", color: "var(--color-text-secondary)", background: "transparent", cursor: "pointer", fontFamily: "var(--font-sans)", whiteSpace: "nowrap" }}>
          {isSelected ? "× Close" : "Details"}
        </button>
        <button
          onClick={handleTagThis}
          disabled={tagging}
          style={{ fontSize: 11, padding: "3px 9px", borderRadius: 7, border: "1px solid #7C3AED", color: "#7C3AED", background: "#F5F3FF", cursor: "pointer", fontFamily: "var(--font-sans)", whiteSpace: "nowrap" }}>
          {tagging ? "Tagging…" : "✦ AI Tag"}
        </button>
        {/* Status actions */}
        {status !== "useful" && (
          <button onClick={() => setStatus("useful")} disabled={saving}
            style={{ fontSize: 11, padding: "3px 9px", borderRadius: 7, border: "1px solid #27A06A", color: "#27A06A", background: "transparent", cursor: "pointer", fontFamily: "var(--font-sans)", whiteSpace: "nowrap" }}>
            ✓ Keep
          </button>
        )}
        {status !== "rejected" && (
          <button onClick={() => setStatus("rejected")} disabled={saving}
            style={{ fontSize: 11, padding: "3px 9px", borderRadius: 7, border: "1px solid #D4870A", color: "#D4870A", background: "transparent", cursor: "pointer", fontFamily: "var(--font-sans)", whiteSpace: "nowrap" }}>
            ✗ Skip
          </button>
        )}
        {(status === "useful" || status === "rejected") && (
          <button onClick={() => setStatus("new")} disabled={saving}
            style={{ fontSize: 11, padding: "3px 9px", borderRadius: 7, border: "1px solid #D1D5DB", color: "#6B7280", background: "transparent", cursor: "pointer", fontFamily: "var(--font-sans)", whiteSpace: "nowrap" }}>
            ↺ Reset
          </button>
        )}
        <button
          onClick={handleDelete}
          style={{ fontSize: 11, padding: "3px 9px", borderRadius: 7, border: "1px solid #D14040", color: "#D14040", background: "transparent", cursor: "pointer", fontFamily: "var(--font-sans)", marginLeft: "auto", whiteSpace: "nowrap" }}>
          🗑 Delete
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function LibraryPage() {
  const { activeDb } = useDb();
  const [allAds,   setAllAds]   = useState<Ad[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [selected, setSelected] = useState<Ad | null>(null);
  const [page,     setPage]     = useState(1);
  const [viewMode, setViewMode] = useState<"compact" | "detailed">("compact");

  // Filters
  const [search,           setSearch]           = useState("");
  const [filterPlat,       setFilterPlat]       = useState("");
  const [filterStatus,     setFilterStatus]     = useState("");
  const [filterHook,       setFilterHook]       = useState("");
  const [filterHasVideo,   setFilterHasVideo]   = useState("");
  const [filterTagging,    setFilterTagging]    = useState("");
  const [filterUsefulness, setFilterUsefulness] = useState("");
  const [sortBy,           setSortBy]           = useState("default");

  // Bulk tag
  const [checkedIds,   setCheckedIds]   = useState<Set<string>>(new Set());
  const [bulkTagging,  setBulkTagging]  = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; failed: number } | null>(null);
  const bulkAbortRef = useRef(false);

  // Bulk delete modal
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting,      setDeleting]      = useState(false);

  // Bulk-action toolbar (selection-driven Mark useful / skip / delete + hard delete)
  const [bulkActing, setBulkActing] = useState<null | "useful" | "skip" | "mark_delete" | "hard_delete">(null);
  const [bulkActionMsg, setBulkActionMsg] = useState<string | null>(null);

  // Confirm modals for destructive flows
  const [confirmBulkHardDelete, setConfirmBulkHardDelete] = useState(false);
  const [confirmSingleDeleteId, setConfirmSingleDeleteId] = useState<string | null>(null);

  const PAGE_SIZE = viewMode === "detailed" ? PAGE_SIZE_DETAILED : PAGE_SIZE_COMPACT;

  const fetchAds = useCallback(async () => {
    if (!activeDb) return;
    setLoading(true); setPage(1); setSelected(null); setCheckedIds(new Set());
    try {
      const res = await fetch(`/api/ads?databaseId=${activeDb.id}`);
      const data = await res.json();
      setAllAds(data.ads ?? []);
    } finally { setLoading(false); }
  }, [activeDb]);

  useEffect(() => { fetchAds(); }, [fetchAds]);

  const handleStatusUpdate = useCallback((id: string, status: string) => {
    setAllAds((prev) => prev.map((a) => a.id === id ? { ...a, reviewStatus: status } : a));
    setSelected((prev) => prev && (prev.id as string) === id ? { ...prev, reviewStatus: status } : prev);
  }, []);

  const handlePanelUpdate = useCallback((id: string, fields: Record<string, unknown>) => {
    setAllAds((prev) => prev.map((a) => a.id === id ? { ...a, ...fields } : a));
    setSelected((prev) => prev && (prev.id as string) === id ? { ...prev, ...fields } : prev);
  }, []);

  const handleDeleteSingle = useCallback((id: string) => {
    setConfirmSingleDeleteId(id);
  }, []);

  // Filter options
  const plats       = useMemo(() => [...new Set(allAds.map((a) => String(a.platform || "")).filter(Boolean))].sort(), [allAds]);
  const hooks       = useMemo(() => [...new Set(allAds.map((a) => String(a.hookType || "")).filter(Boolean))].sort(), [allAds]);
  const usefulnessOpts = ["useful", "not_useful", "uncertain"];

  // Counts — "to delete" = rejected OR AI delete_candidate
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: allAds.length, new: 0, useful: 0, reviewed: 0, rejected: 0, to_delete: 0 };
    allAds.forEach((a) => {
      const s = ((a.reviewStatus as string) || "new").toLowerCase();
      const key = s === "unreviewed" ? "new" : s;
      if (key in c) c[key]++;
      else c.new++;
      if (s === "rejected" || a.recommendedAction === "delete_candidate") c.to_delete++;
    });
    return c;
  }, [allAds]);

  const untaggedCount = useMemo(() => allAds.filter((a) => !a.taggingStatus || a.taggingStatus === "untagged").length, [allAds]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return allAds.filter((a) => {
      if (q) {
        const hay = [a.hookType, a.hookExample, a.adCopy, a.platform, a.brandOrCreator, a.brand, a.creativeAngle, a.notes].map(String).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filterPlat && a.platform !== filterPlat) return false;
      if (filterHook && a.hookType !== filterHook) return false;
      if (filterStatus === "to_delete") {
        const s = ((a.reviewStatus as string) || "new").toLowerCase();
        if (s !== "rejected" && a.recommendedAction !== "delete_candidate") return false;
      } else if (filterStatus) {
        const s = ((a.reviewStatus as string) || "new").toLowerCase();
        const norm = s === "unreviewed" ? "new" : s;
        if (norm !== filterStatus) return false;
      }
      if (filterHasVideo === "yes") {
        const videoUrl = (a.creativeVideoUrl || a.creative_video_url || "") as string;
        if (!videoUrl && normalise(a)._linkType === "none") return false;
      }
      if (filterHasVideo === "no") {
        const videoUrl = (a.creativeVideoUrl || a.creative_video_url || "") as string;
        if (videoUrl || normalise(a)._linkType !== "none") return false;
      }
      if (filterTagging) {
        const ts = ((a.taggingStatus as string) || "untagged").toLowerCase();
        if (ts !== filterTagging) return false;
      }
      if (filterUsefulness && a.usefulnessStatus !== filterUsefulness) return false;
      return true;
    });
  }, [allAds, search, filterPlat, filterStatus, filterHook, filterHasVideo, filterTagging, filterUsefulness]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sortBy === "score_desc") return arr.sort((a, b) => Number(b.overallUsefulnessScore ?? b.overallScore ?? 0) - Number(a.overallUsefulnessScore ?? a.overallScore ?? 0));
    if (sortBy === "score_asc")  return arr.sort((a, b) => Number(a.overallUsefulnessScore ?? a.overallScore ?? 0) - Number(b.overallUsefulnessScore ?? b.overallScore ?? 0));
    if (sortBy === "newest")     return arr.sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
    if (sortBy === "oldest")     return arr.sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")));
    const priority = (a: Ad) => { const s = ((a.reviewStatus as string) || "new").toLowerCase(); if (s === "useful") return 0; if (s === "new" || s === "unreviewed") return 1; if (s === "reviewed") return 2; return 3; };
    return arr.sort((a, b) => { const pd = priority(a) - priority(b); return pd !== 0 ? pd : String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")); });
  }, [filtered, sortBy]);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const paged = useMemo(() => sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [sorted, page, PAGE_SIZE]);
  const pageNums = getPageNums(page, totalPages);
  const anyFilter = !!(search || filterPlat || filterStatus || filterHook || filterHasVideo || filterTagging || filterUsefulness);

  // Checkboxes (compact only)
  const allPageChecked = paged.length > 0 && paged.every((a) => checkedIds.has(a.id as string));
  const somePageChecked = paged.some((a) => checkedIds.has(a.id as string));
  const toggleCheck = (id: string) => setCheckedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll   = () => {
    if (allPageChecked) setCheckedIds((prev) => { const n = new Set(prev); paged.forEach((a) => n.delete(a.id as string)); return n; });
    else                setCheckedIds((prev) => { const n = new Set(prev); paged.forEach((a) => n.add(a.id as string));    return n; });
  };

  // Bulk tag
  const runBulkTag = useCallback(async (adsToTag: Ad[]) => {
    if (!adsToTag.length) return;
    setBulkTagging(true); bulkAbortRef.current = false;
    setBulkProgress({ done: 0, total: adsToTag.length, failed: 0 });
    let done = 0, failed = 0;
    for (const ad of adsToTag) {
      if (bulkAbortRef.current) break;
      setAllAds((prev) => prev.map((a) => a.id === ad.id ? { ...a, taggingStatus: "ai_tagging" } : a));
      try {
        const fields = await tagSingleAd(ad);
        await fetch(`/api/ads/${ad.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fields) });
        setAllAds((prev) => prev.map((a) => a.id === ad.id ? { ...a, ...fields } : a));
        setSelected((prev) => prev && (prev.id as string) === (ad.id as string) ? { ...prev, ...fields } : prev);
        done++;
      } catch {
        failed++;
        setAllAds((prev) => prev.map((a) => a.id === ad.id ? { ...a, taggingStatus: ad.taggingStatus as string || "untagged" } : a));
      }
      setBulkProgress({ done, total: adsToTag.length, failed });
      if (!bulkAbortRef.current) await new Promise((r) => setTimeout(r, 500));
    }
    setBulkTagging(false); setCheckedIds(new Set());
  }, []);

  const handleTagSelected    = () => runBulkTag(allAds.filter((a) => checkedIds.has(a.id as string)));
  const handleTagAllUntagged = () => {
    const ads = allAds.filter((a) => !a.taggingStatus || a.taggingStatus === "untagged");
    if (!ads.length) return;
    if (!confirm(`Tag all ${ads.length} untagged ads?`)) return;
    runBulkTag(ads);
  };

  // Single-ad AI tag (from detailed card)
  const handleTagSingleInline = useCallback(async (ad: Ad) => {
    setAllAds((prev) => prev.map((a) => a.id === ad.id ? { ...a, taggingStatus: "ai_tagging" } : a));
    try {
      const fields = await tagSingleAd(ad);
      await fetch(`/api/ads/${ad.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fields) });
      setAllAds((prev) => prev.map((a) => a.id === ad.id ? { ...a, ...fields } : a));
    } catch {
      setAllAds((prev) => prev.map((a) => a.id === ad.id ? { ...a, taggingStatus: ad.taggingStatus as string || "untagged" } : a));
    }
  }, []);

  // Bulk delete — "to delete" = rejected OR AI delete_candidate
  const toDeleteAds = useMemo(() =>
    allAds.filter((a) => (a.reviewStatus as string) === "rejected" || a.recommendedAction === "delete_candidate"),
    [allAds]
  );

  // Selection-driven bulk actions (mark useful / skip / mark-delete / hard delete)
  const runBulkPatch = useCallback(async (
    kind: "useful" | "skip" | "mark_delete",
    patch: Record<string, unknown>,
    successLabel: string,
  ) => {
    if (checkedIds.size === 0 || bulkActing) return;
    const ids = Array.from(checkedIds);
    setBulkActing(kind);
    setBulkActionMsg(null);
    try {
      const res = await fetch("/api/ads/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, patch }),
      });
      if (!res.ok) {
        const errBody = await res.text();
        setBulkActionMsg(`Bulk ${kind} failed: ${errBody}`);
        return;
      }
      const data = await res.json() as { updated: number; requested: number };
      const idSet = new Set(ids);
      setAllAds((prev) => prev.map((a) => idSet.has(a.id as string) ? { ...a, ...patch } : a));
      setSelected((prev) => prev && idSet.has(prev.id as string) ? { ...prev, ...patch } : prev);
      setCheckedIds(new Set());
      setBulkActionMsg(
        data.updated === data.requested
          ? `${successLabel} ${data.updated} ad${data.updated === 1 ? "" : "s"}.`
          : `${successLabel} ${data.updated} of ${data.requested} ads (${data.requested - data.updated} skipped).`,
      );
    } catch (e) {
      setBulkActionMsg(`Bulk ${kind} failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBulkActing(null);
    }
  }, [checkedIds, bulkActing]);

  const handleBulkMarkUseful = () => runBulkPatch("useful",      { reviewStatus: "reviewed", usefulnessStatus: "useful" },    "Marked");
  const handleBulkMarkSkip   = () => runBulkPatch("skip",        { reviewStatus: "reviewed", usefulnessStatus: "uncertain" }, "Skipped");
  const handleBulkMarkDelete = () => runBulkPatch("mark_delete", { recommendedAction: "delete_candidate" },                   "Flagged for delete");

  const performBulkHardDelete = useCallback(async () => {
    if (checkedIds.size === 0 || bulkActing) return;
    const ids = Array.from(checkedIds);
    setBulkActing("hard_delete");
    setBulkActionMsg(null);
    try {
      const res = await fetch("/api/ads/bulk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        const errBody = await res.text();
        setBulkActionMsg(`Bulk delete failed: ${errBody}`);
        return;
      }
      const data = await res.json() as { deleted: number; requested: number };
      const idSet = new Set(ids);
      setAllAds((prev) => prev.filter((a) => !idSet.has(a.id as string)));
      setSelected((prev) => prev && idSet.has(prev.id as string) ? null : prev);
      setCheckedIds(new Set());
      setBulkActionMsg(
        data.deleted === data.requested
          ? `Deleted ${data.deleted} ad${data.deleted === 1 ? "" : "s"}.`
          : `Deleted ${data.deleted} of ${data.requested} ads (${data.requested - data.deleted} skipped).`,
      );
    } catch (e) {
      setBulkActionMsg(`Bulk delete failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBulkActing(null);
      setConfirmBulkHardDelete(false);
    }
  }, [checkedIds, bulkActing]);

  const handleBulkHardDelete = useCallback(() => {
    if (checkedIds.size === 0 || bulkActing) return;
    setConfirmBulkHardDelete(true);
  }, [checkedIds.size, bulkActing]);

  const handleBulkDeleteConfirm = async () => {
    setDeleting(true);
    let deleted = 0;
    for (const ad of toDeleteAds) {
      try { await fetch(`/api/ads/${ad.id}`, { method: "DELETE" }); deleted++; } catch { /* continue */ }
    }
    const deleteIds = new Set(toDeleteAds.map((a) => a.id as string));
    setAllAds((prev) => prev.filter((a) => !deleteIds.has(a.id as string)));
    setDeleting(false); setConfirmDelete(false);
    alert(`Deleted ${deleted} ads.`);
  };

  return (
    <div style={{ position: "relative" }}>

      {/* ── Header ────────────────────────────────────────────── */}
      <div style={{ marginBottom: 16, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em" }}>Library</h2>
          <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 3 }}>
            {activeDb?.name ?? "…"} · {allAds.length} ads
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ display: "flex", borderRadius: 8, border: "1px solid var(--color-border-secondary)", overflow: "hidden" }}>
            {(["compact", "detailed"] as const).map((mode) => (
              <button key={mode} onClick={() => { setViewMode(mode); setPage(1); }}
                style={{ padding: "5px 12px", fontSize: 11, border: "none", cursor: "pointer", fontFamily: "var(--font-sans)", fontWeight: viewMode === mode ? 600 : 400, background: viewMode === mode ? "var(--color-accent)" : "transparent", color: viewMode === mode ? "white" : "var(--color-text-secondary)" }}>
                {mode === "compact" ? "⊟ Compact" : "⊞ Detailed"}
              </button>
            ))}
          </div>
          <Link href="/collect" className="btn btn-primary btn-sm">+ Collect more</Link>
        </div>
      </div>

      {/* ── Bulk AI tag toolbar ────────────────────────────────── */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, padding: "8px 12px", background: "var(--color-background-secondary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)", fontWeight: 500 }}>AI Tag:</span>
        {checkedIds.size > 0 && (
          <button onClick={handleTagSelected} disabled={bulkTagging} className="btn btn-sm btn-primary" style={{ fontSize: 11 }}>
            Tag {checkedIds.size} selected
          </button>
        )}
        <button onClick={handleTagAllUntagged} disabled={bulkTagging || untaggedCount === 0} className="btn btn-sm" style={{ fontSize: 11 }}>
          Tag all untagged {untaggedCount > 0 ? `(${untaggedCount})` : "(none)"}
        </button>
        {bulkTagging && (
          <>
            <span style={{ fontSize: 12, color: "var(--color-accent)", fontWeight: 500 }}>
              {bulkProgress ? `${bulkProgress.done}/${bulkProgress.total}` : "Starting…"}
              {bulkProgress && bulkProgress.failed > 0 && <span style={{ color: "#D14040", marginLeft: 6 }}>{bulkProgress.failed} failed</span>}
            </span>
            <div style={{ flex: 1, height: 4, background: "var(--color-border-tertiary)", borderRadius: 2, minWidth: 80 }}>
              {bulkProgress && <div style={{ height: "100%", borderRadius: 2, background: "var(--color-accent)", width: `${Math.round((bulkProgress.done / bulkProgress.total) * 100)}%`, transition: "width 0.3s" }} />}
            </div>
            <button onClick={() => { bulkAbortRef.current = true; }} className="btn btn-sm" style={{ fontSize: 11, color: "#D14040" }}>Stop</button>
          </>
        )}
        {toDeleteAds.length > 0 && !bulkTagging && (
          <button onClick={() => setConfirmDelete(true)} className="btn btn-sm" style={{ fontSize: 11, color: "#7A1F1F", borderColor: "#D14040", marginLeft: "auto" }}>
            🗑 Delete all {toDeleteAds.length} flagged
          </button>
        )}
      </div>

      {/* ── Bulk-action bar (selection-driven) ─────────────────── */}
      {checkedIds.size > 0 && (
        <div style={{
          display: "flex", gap: 8, alignItems: "center", marginBottom: 12,
          padding: "8px 12px",
          background: "#EEEDFE", border: "1px solid #C7C3F1", color: "#26215C",
          borderRadius: 8, fontSize: 12, flexWrap: "wrap",
        }}>
          <span style={{ fontWeight: 600 }}>{checkedIds.size} selected</span>
          <span style={{ width: 1, height: 16, background: "#C7C3F1" }} />
          <button
            type="button" className="btn btn-sm" onClick={handleBulkMarkUseful}
            disabled={!!bulkActing}
            style={{ fontSize: 11 }}
          >
            {bulkActing === "useful" ? "Marking…" : "✓ Mark useful"}
          </button>
          <button
            type="button" className="btn btn-sm" onClick={handleBulkMarkSkip}
            disabled={!!bulkActing}
            style={{ fontSize: 11 }}
          >
            {bulkActing === "skip" ? "Marking…" : "↷ Mark skip"}
          </button>
          <button
            type="button" className="btn btn-sm" onClick={handleBulkMarkDelete}
            disabled={!!bulkActing}
            style={{ fontSize: 11, color: "#633806", borderColor: "#D4870A" }}
          >
            {bulkActing === "mark_delete" ? "Marking…" : "⚑ Mark delete"}
          </button>
          <span style={{ width: 1, height: 16, background: "#C7C3F1" }} />
          <button
            type="button" className="btn btn-sm" onClick={handleBulkHardDelete}
            disabled={!!bulkActing}
            style={{ fontSize: 11, color: "#7A1F1F", borderColor: "#D14040" }}
          >
            {bulkActing === "hard_delete" ? "Deleting…" : "🗑 Delete"}
          </button>
          <button
            type="button" className="btn btn-sm" onClick={() => setCheckedIds(new Set())}
            disabled={!!bulkActing}
            style={{ marginLeft: "auto", fontSize: 11, color: "var(--color-text-secondary)" }}
          >
            Clear selection
          </button>
        </div>
      )}
      {bulkActionMsg && (
        <div style={{
          marginBottom: 12, padding: "6px 12px", borderRadius: 6, fontSize: 12,
          background: bulkActionMsg.toLowerCase().includes("failed") ? "#FEECEC" : "#E1F5EE",
          color: bulkActionMsg.toLowerCase().includes("failed") ? "#7A1F1F" : "#085041",
          border: `1px solid ${bulkActionMsg.toLowerCase().includes("failed") ? "#F7C1C1" : "#9FE1CB"}`,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span>{bulkActionMsg}</span>
          <button
            type="button" onClick={() => setBulkActionMsg(null)}
            style={{ marginLeft: "auto", background: "transparent", border: "none", cursor: "pointer", fontSize: 12, color: "inherit" }}
          >
            ×
          </button>
        </div>
      )}

      {/* ── Delete modals ─────────────────────────────────────── */}
      <ConfirmModal
        open={confirmDelete}
        title={`Delete ${toDeleteAds.length} ad${toDeleteAds.length === 1 ? "" : "s"}?`}
        description={
          <>
            This will permanently delete all <strong>{toDeleteAds.length}</strong> ad{toDeleteAds.length === 1 ? "" : "s"} flagged as
            <strong> skipped</strong> or <strong>AI delete candidate</strong> from the current database. This cannot be undone.
          </>
        }
        confirmLabel={`Delete ${toDeleteAds.length} ad${toDeleteAds.length === 1 ? "" : "s"}`}
        destructive
        loading={deleting}
        onConfirm={handleBulkDeleteConfirm}
        onCancel={() => setConfirmDelete(false)}
      />

      <ConfirmModal
        open={confirmBulkHardDelete}
        title={`Delete ${checkedIds.size} selected ad${checkedIds.size === 1 ? "" : "s"}?`}
        description={
          <>
            This will permanently delete the <strong>{checkedIds.size}</strong> selected ad{checkedIds.size === 1 ? "" : "s"} from the current database.
            This cannot be undone.
          </>
        }
        confirmLabel={`Delete ${checkedIds.size} ad${checkedIds.size === 1 ? "" : "s"}`}
        destructive
        loading={bulkActing === "hard_delete"}
        onConfirm={performBulkHardDelete}
        onCancel={() => setConfirmBulkHardDelete(false)}
      />

      <ConfirmModal
        open={!!confirmSingleDeleteId}
        title="Delete this ad?"
        description={
          <>
            This will permanently delete the selected ad{confirmSingleDeleteId ? <> (<span style={{ fontFamily: "var(--font-mono)" }}>{confirmSingleDeleteId.slice(0, 8)}…</span>)</> : ""} from the current database.
            This cannot be undone.
          </>
        }
        confirmLabel="Delete ad"
        destructive
        onConfirm={async () => {
          const id = confirmSingleDeleteId;
          if (!id) return;
          await fetch(`/api/ads/${id}`, { method: "DELETE" });
          setAllAds((prev) => prev.filter((a) => a.id !== id));
          setSelected((prev) => (prev && prev.id === id ? null : prev));
          setConfirmSingleDeleteId(null);
        }}
        onCancel={() => setConfirmSingleDeleteId(null)}
      />

      {/* ── Status tabs ───────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 4, marginBottom: 14, borderBottom: "1px solid var(--color-border-tertiary)" }}>
        {[
          { key: "",          label: "All",       count: counts.all },
          { key: "new",       label: "New",       count: counts.new },
          { key: "useful",    label: "✓ Useful",  count: counts.useful },
          { key: "reviewed",  label: "Reviewed",  count: counts.reviewed },
          { key: "rejected",  label: "✗ Skipped", count: counts.rejected },
          { key: "to_delete", label: "🗑 To Delete", count: counts.to_delete },
        ].map(({ key, label, count }) => {
          const active = filterStatus === key;
          return (
            <button key={key} onClick={() => { setFilterStatus(key); setPage(1); }}
              style={{ fontSize: 12, padding: "6px 12px", border: "none", cursor: "pointer", background: "transparent", fontFamily: "var(--font-sans)", borderBottom: active ? "2px solid var(--color-accent)" : "2px solid transparent", color: active ? "var(--color-accent)" : "var(--color-text-secondary)", fontWeight: active ? 600 : 400, marginBottom: -1 }}>
              {label}
              {count > 0 && <span style={{ marginLeft: 5, fontSize: 10, color: "var(--color-text-tertiary)" }}>{count}</span>}
            </button>
          );
        })}
      </div>

      {/* ── Filter bar ────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 180, maxWidth: 260 }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "var(--color-text-tertiary)", pointerEvents: "none" }}>⌕</span>
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search copy, hooks, brand…"
            style={{ paddingLeft: 28, borderRadius: 20, fontSize: 12, height: 32, border: "1px solid var(--color-border-secondary)", boxShadow: "var(--shadow-xs)" }} />
        </div>
        <FilterChip label="Platform"   value={filterPlat}       options={plats}                    onChange={(v) => { setFilterPlat(v); setPage(1); }} />
        <FilterChip label="Hook type"  value={filterHook}       options={hooks}                    onChange={(v) => { setFilterHook(v); setPage(1); }} />
        <FilterChip label="Tagging"    value={filterTagging}    options={["untagged","ai_tagged"]} onChange={(v) => { setFilterTagging(v); setPage(1); }} />
        <FilterChip label="Usefulness" value={filterUsefulness} options={usefulnessOpts}           onChange={(v) => { setFilterUsefulness(v); setPage(1); }} />
        <FilterChip label="Has video"  value={filterHasVideo}   options={["yes","no"]}             onChange={(v) => { setFilterHasVideo(v); setPage(1); }} />
        <select value={sortBy} onChange={(e) => { setSortBy(e.target.value); setPage(1); }} className="filter-select">
          <option value="default">Sort: Default</option>
          <option value="score_desc">Score ↓</option>
          <option value="score_asc">Score ↑</option>
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
        </select>
        {anyFilter && (
          <button className="btn btn-sm" onClick={() => { setSearch(""); setFilterPlat(""); setFilterStatus(""); setFilterHook(""); setFilterHasVideo(""); setFilterTagging(""); setFilterUsefulness(""); setSortBy("default"); setPage(1); }} style={{ borderRadius: 20, color: "var(--color-text-secondary)" }}>
            ✕ Clear
          </button>
        )}
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--color-text-tertiary)" }}>
          {filtered.length !== allAds.length ? `${filtered.length} of ${allAds.length}` : `${allAds.length} total`}
          {checkedIds.size > 0 && <span style={{ marginLeft: 6, color: "var(--color-accent)", fontWeight: 500 }}>{checkedIds.size} selected</span>}
        </span>
      </div>

      {/* ── Content ───────────────────────────────────────────── */}
      {loading ? (
        <div className="empty-state"><p>Loading…</p></div>
      ) : paged.length === 0 ? (
        <div className="card empty-state">
          <p style={{ fontSize: 13, marginBottom: 10 }}>No ads here yet.</p>
          <Link href="/collect" className="btn btn-primary btn-sm">Collect ads</Link>
        </div>
      ) : viewMode === "detailed" ? (
        /* ── DETAILED: card grid ──────────────────────────────── */
        <>
          {paged.map((ad) => (
            <DetailedCard
              key={ad.id as string}
              ad={ad}
              isSelected={!!(selected && selected.id === ad.id)}
              onSelect={() => setSelected((prev) => prev && prev.id === ad.id ? null : ad)}
              onUpdate={handlePanelUpdate}
              onDelete={handleDeleteSingle}
              onStatusUpdate={handleStatusUpdate}
              onTagSingle={handleTagSingleInline}
            />
          ))}
        </>
      ) : (
        /* ── COMPACT: table ───────────────────────────────────── */
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 32 }}>
                    <input type="checkbox" checked={allPageChecked}
                      ref={(el) => { if (el) el.indeterminate = somePageChecked && !allPageChecked; }}
                      onChange={toggleAll} style={{ cursor: "pointer" }} />
                  </th>
                  <th style={{ width: 28 }}>#</th>
                  <th style={{ width: 60 }}>Preview</th>
                  <th>Platform</th>
                  <th>Hook / Copy</th>
                  <th style={{ width: 72, textAlign: "center" }}>Score</th>
                  <th style={{ width: 88, textAlign: "center" }}>Link</th>
                  <th style={{ width: 110 }}>Status</th>
                  <th style={{ width: 56, textAlign: "center" }}>Del</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((ad, i) => {
                  const n = normalise(ad);
                  const isSelected = !!(selected && selected.id === ad.id);
                  const isChecked = checkedIds.has(ad.id as string);
                  const rowNum = (page - 1) * PAGE_SIZE + i + 1;
                  const hook = String(ad.hookType || ad.hookExample || "");
                  const copy = String(ad.adCopy || ad.hookExample || ad.description || "");
                  const overallScore = ad.overallUsefulnessScore ?? ad.overallScore;
                  const primaryUrl = getPrimaryUrl(ad);
                  const videoUrl   = getVideoUrl(ad);
                  const isYt = !!getYouTubeId(primaryUrl);
                  const linkLabel = isYt ? "▶ Watch" : videoUrl ? "▶ Video" : "↗ Open";
                  const isToDelete = (ad.reviewStatus as string) === "rejected" || ad.recommendedAction === "delete_candidate";

                  return (
                    <tr key={ad.id as string} onClick={() => setSelected(isSelected ? null : ad)} className={isSelected ? "selected" : ""}
                      style={isToDelete ? { opacity: 0.6 } : undefined}>
                      <td style={{ width: 32 }} onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={isChecked} onChange={() => toggleCheck(ad.id as string)} style={{ cursor: "pointer" }} />
                      </td>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-text-tertiary)", width: 28 }}>{rowNum}</td>
                      <td style={{ padding: "5px 8px", width: 60 }} onClick={(e) => e.stopPropagation()}>
                        <Thumb ad={ad} size="sm" linkUrl={primaryUrl || undefined} />
                      </td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                          {n._platform ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              {PLATFORM_COLORS[n._platform.toLowerCase()] && (
                                <div style={{ width: 13, height: 13, borderRadius: 3, background: PLATFORM_COLORS[n._platform.toLowerCase()], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, color: "white", fontWeight: 700, flexShrink: 0 }}>
                                  {PLATFORM_ICONS[n._platform.toLowerCase()] || "•"}
                                </div>
                              )}
                              <span className={`badge ${platformBadgeClass(n._platform)}`}>{n._platform}</span>
                            </div>
                          ) : <span style={{ color: "var(--color-text-tertiary)" }}>—</span>}
                          <SourceBadge source={ad.ingestionSource} />
                        </div>
                      </td>
                      <td style={{ maxWidth: 320 }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          {hook && <span className="chip" style={{ fontSize: 10, alignSelf: "flex-start" }}>{hook}</span>}
                          {copy && <span style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{copy}</span>}
                          {!!(ad.brandOrCreator || ad.brand) && <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>{String(ad.brandOrCreator || ad.brand)}</span>}
                        </div>
                      </td>
                      <td style={{ width: 72, textAlign: "center" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "center" }}>
                          <ScorePill value={overallScore} label="Overall Usefulness Score" />
                          <TaggingBadge status={ad.taggingStatus} />
                        </div>
                      </td>
                      <td style={{ width: 88, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                        {primaryUrl ? (
                          <a href={primaryUrl} target="_blank" rel="noopener noreferrer"
                            style={{ color: "var(--color-accent-dark)", fontSize: 11, fontWeight: 600, textDecoration: "none", padding: "3px 8px", borderRadius: 7, border: "1px solid var(--color-accent)", background: "var(--color-accent-light)", display: "inline-block", whiteSpace: "nowrap" }}>
                            {linkLabel}
                          </a>
                        ) : <span style={{ color: "var(--color-text-tertiary)", fontSize: 11 }}>—</span>}
                      </td>
                      <td style={{ width: 110 }} onClick={(e) => e.stopPropagation()}>
                        <QuickStatus ad={ad} onUpdate={handleStatusUpdate} />
                      </td>
                      <td style={{ width: 56, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                        <DeleteBtn adId={ad.id as string} onDeleted={handleDeleteSingle} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", borderTop: "1px solid var(--color-border-tertiary)", background: "var(--color-background-secondary)" }}>
              <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginRight: "auto" }}>
                {(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE, sorted.length)} of {sorted.length}
              </span>
              <button className="page-btn" onClick={() => setPage((p) => p-1)} disabled={page===1}>‹</button>
              {pageNums.map((n, i) => n === "…"
                ? <span key={`e-${i}`} style={{ fontSize: 12, color: "var(--color-text-tertiary)", padding: "0 4px" }}>…</span>
                : <button key={n} className={`page-btn${page===n?" active":""}`} onClick={() => setPage(n as number)}>{n}</button>
              )}
              <button className="page-btn" onClick={() => setPage((p) => p+1)} disabled={page===totalPages}>›</button>
            </div>
          )}
        </div>
      )}

      {/* Detailed pagination */}
      {viewMode === "detailed" && totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "12px 0", justifyContent: "center" }}>
          <button className="page-btn" onClick={() => setPage((p) => p-1)} disabled={page===1}>‹</button>
          {pageNums.map((n, i) => n === "…"
            ? <span key={`e-${i}`} style={{ fontSize: 12, color: "var(--color-text-tertiary)", padding: "0 4px" }}>…</span>
            : <button key={n} className={`page-btn${page===n?" active":""}`} onClick={() => setPage(n as number)}>{n}</button>
          )}
          <button className="page-btn" onClick={() => setPage((p) => p+1)} disabled={page===totalPages}>›</button>
          <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginLeft: 8 }}>
            {(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE, sorted.length)} of {sorted.length}
          </span>
        </div>
      )}

      {/* ── Side panel ────────────────────────────────────────── */}
      {selected && (
        <AdPanel
          ad={selected}
          onClose={() => setSelected(null)}
          onUpdate={handlePanelUpdate}
        />
      )}
    </div>
  );
}

// ── Inline delete button (compact row) ────────────────────────
function DeleteBtn({ adId, onDeleted }: { adId: string; onDeleted: (id: string) => void }) {
  return (
    <button onClick={() => onDeleted(adId)} title="Delete ad"
      style={{ fontSize: 13, padding: "2px 6px", borderRadius: 6, border: "1px solid #FCA5A5", color: "#D14040", background: "transparent", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
      🗑
    </button>
  );
}
