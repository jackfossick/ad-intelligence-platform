/**
 * Normalisation layer.
 *
 * Different databases use different column names for the same concept.
 * This module extracts canonical _prefixed fields so the UI can display
 * any ad consistently regardless of which database it came from.
 *
 * All original fields are preserved alongside the normalised ones.
 */

export type AdRecord = Record<string, unknown>;

export interface NormalisedAd {
  // Canonical display fields
  _url:        string | null;   // primary watchable/clickable link
  _backup_url: string | null;   // secondary search link
  _score:      number | null;   // primary performance score (any scale)
  _scoreMax:   number;          // 10 or 100 depending on database
  _cat:        string | null;   // primary category / segment
  _platform:   string | null;
  _hook:       string | null;
  _id:         string | null;   // external ID or priority rank
  _title:      string | null;   // best available title for the ad
  _why:        string | null;
  _replicate:  string | null;

  // Link classification
  _linkType: "youtube" | "search" | "direct" | "none";

  // 6-part score breakdown (Database 2 only)
  _hasBreakdown:       boolean;
  _hookScore:          number | null;
  _retentionScore:     number | null;
  _trustScore:         number | null;
  _conversionScore:    number | null;
  _aiReplicability:    number | null;
  _nicheTransfer:      number | null;
}

/** Detect what kind of link a URL is. */
export function classifyUrl(url: string | null | undefined): NormalisedAd["_linkType"] {
  if (!url) return "none";
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  if (
    url.includes("facebook.com/ads/library") ||
    url.includes("tiktok.com/business/creativecenter") ||
    url.includes("search_type=") ||
    url.includes("tiktok.com/search")
  ) return "search";
  return "direct";
}

/** Extract the YouTube video ID from any YouTube URL. Returns null if not found. */
export function getYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

/** Normalise a raw Prisma Ad record into canonical display fields. */
export function normalise(ad: AdRecord): NormalisedAd {
  const s = (k: string) => (ad[k] != null && ad[k] !== "" ? String(ad[k]) : null);
  const n = (k: string) => {
    const v = parseFloat(String(ad[k]));
    return isNaN(v) ? null : v;
  };

  // Primary URL: direct video link takes priority, then reference URL
  const url = s("adLink") || s("referenceUrl") || null;
  const backupUrl = s("backupSearchUrl") || null;

  // Score: use whatever score field is populated, determine scale
  const perfScore   = n("performanceScore");
  const overallScore = n("overallScore");
  const proxyScore  = n("performanceProxyScore");
  const rawScore    = perfScore ?? overallScore ?? proxyScore ?? null;

  // Score max: if any individual breakdown score exists, it's /100 scale
  const hasBreakdown = [
    n("hookScore"), n("retentionScore"), n("trustScore"),
    n("conversionIntentScore"), n("aiReplicabilityScore"), n("nicheTransferScore"),
  ].some((v) => v !== null);

  // DB1 & DB3 score out of 100, DB2 overall out of 100 — all consistent
  const scoreMax = 100;

  return {
    _url:       url,
    _backup_url: backupUrl !== url ? backupUrl : null,
    _score:     rawScore,
    _scoreMax:  scoreMax,
    _cat:       s("primaryCategory") || s("segment") || null,
    _platform:  s("platform") || null,
    _hook:      s("hookType") || null,
    _id:        s("externalId") || (ad["priorityRank"] != null ? String(ad["priorityRank"]) : null),
    _title:     s("referenceTitle") || s("referenceName") || s("subCategory") || s("primaryCategory") || null,
    _why:       s("whyItWorks") || s("valueForUs") || null,
    _replicate: s("howToReplicate") || s("replicationInstruction") || null,
    _linkType:  classifyUrl(url),

    _hasBreakdown:    hasBreakdown,
    _hookScore:       n("hookScore"),
    _retentionScore:  n("retentionScore"),
    _trustScore:      n("trustScore"),
    _conversionScore: n("conversionIntentScore"),
    _aiReplicability: n("aiReplicabilityScore"),
    _nicheTransfer:   n("nicheTransferScore"),
  };
}

/** Return the CSS class for a score badge. Score is always out of 100. */
export function scoreBadgeClass(score: number | null): string {
  if (score === null) return "score-none";
  if (score >= 85) return "score-high";
  if (score >= 65) return "score-mid";
  return "score-low";
}

/** Return the CSS class for a platform badge. */
export function platformBadgeClass(platform: string | null | undefined): string {
  if (!platform) return "badge-gray";
  const p = platform.toLowerCase();
  if (p.includes("tiktok") && p.includes("meta")) return "badge-meta";
  if (p.includes("tiktok"))     return "badge-tiktok";
  if (p.includes("instagram"))  return "badge-instagram";
  if (p.includes("youtube"))    return "badge-youtube";
  if (p.includes("facebook") || p.includes("meta")) return "badge-facebook";
  if (p.includes("pinterest"))  return "badge-pinterest";
  if (p.includes("snapchat"))   return "badge-snapchat";
  return "badge-gray";
}
