/**
 * Export schema contract.
 *
 * Defines required fields, their validation rules, and the downstream
 * column names used in exported files.  Used by both the export API
 * (validation + preview) and the Export UI (warnings panel).
 */

import { PLATFORMS, HOOK_TYPES, CREATIVE_FORMATS, isValidEnum } from "./enums";

// ── Field specification ───────────────────────────────────────

export type FieldRequirement = "hard" | "soft" | "optional";

export interface FieldSpec {
  /** Column name in the export file */
  exportKey: string;
  /** Human-readable label */
  label: string;
  /** Prisma field names to check (first non-empty wins) */
  sources: string[];
  /** hard = block export row; soft = warn; optional = info only */
  required: FieldRequirement;
  /** Valid enum values — violation is always treated as a warning */
  validEnum?: readonly string[];
  /** Whether the value must look like a URL */
  isUrl?: boolean;
  /** Short description for the tooltip */
  description?: string;
}

export const EXPORT_SCHEMA: FieldSpec[] = [
  {
    exportKey: "id",
    label: "ID",
    sources: ["id"],
    required: "hard",
    description: "Internal record ID — always present.",
  },
  {
    exportKey: "platform",
    label: "Platform",
    sources: ["platform"],
    required: "soft",
    validEnum: PLATFORMS,
    description: "Must be one of the known platforms for downstream filtering.",
  },
  {
    exportKey: "ad_url",
    label: "Ad URL",
    sources: ["referenceUrl", "adLibraryUrl", "adLink"],
    required: "hard",
    isUrl: true,
    description: "Primary public link to the ad (Ad Library, post, or video page).",
  },
  {
    exportKey: "creative_video_url",
    label: "Video URL",
    sources: ["creativeVideoUrl"],
    required: "optional",
    isUrl: true,
    description: "Direct video file or embed URL — needed for AI video analysis.",
  },
  {
    exportKey: "ad_copy",
    label: "Ad Copy",
    sources: ["adCopy", "hookExample", "description"],
    required: "soft",
    description: "Caption / body copy used for AI analysis and search.",
  },
  {
    exportKey: "hook",
    label: "Hook Type",
    sources: ["hookType"],
    required: "soft",
    validEnum: HOOK_TYPES,
    description: "AI-tagged hook type.  Run AI Tagging to populate this.",
  },
  {
    exportKey: "format",
    label: "Format",
    sources: ["formatType"],
    required: "soft",
    validEnum: CREATIVE_FORMATS,
    description: "Creative format — required for format-based filtering in downstream systems.",
  },
  {
    exportKey: "score",
    label: "Overall Score",
    sources: ["overallUsefulnessScore", "overallScore"],
    required: "optional",
    description: "Composite score (0–10) computed from granular AI scores.",
  },
  {
    exportKey: "scraped_at",
    label: "Date",
    sources: ["firstSeen", "scrapedAt", "createdAt"],
    required: "optional",
    description: "When the ad was first seen or imported.",
  },
];

// ── Row validation ────────────────────────────────────────────

export type RowIssue = {
  field: string;
  label: string;
  severity: "error" | "warning" | "info";
  message: string;
};

export type RowValidationResult = {
  id: string;
  issues: RowIssue[];
  /** resolved export row — fields may be empty strings */
  row: Record<string, string>;
  /** true if any hard-required field is missing/invalid */
  blocked: boolean;
};

function resolveField(ad: Record<string, unknown>, sources: string[]): unknown {
  for (const src of sources) {
    const v = ad[src];
    if (v !== null && v !== undefined && v !== "") return v;
  }
  return null;
}

function looksLikeUrl(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const t = v.trim();
  return (t.startsWith("http://") || t.startsWith("https://")) &&
    !t.includes("example.com") && !t.includes("placeholder");
}

export function validateRow(ad: Record<string, unknown>): RowValidationResult {
  const issues: RowIssue[] = [];
  const row: Record<string, string> = {};
  let blocked = false;

  for (const spec of EXPORT_SCHEMA) {
    const raw = resolveField(ad, spec.sources);
    const strVal = raw !== null && raw !== undefined ? String(raw).trim() : "";
    row[spec.exportKey] = strVal;

    const missing = strVal === "";
    const badEnum = !missing && spec.validEnum && !isValidEnum(strVal, spec.validEnum);
    const badUrl  = !missing && spec.isUrl && !looksLikeUrl(strVal);

    if (missing) {
      if (spec.required === "hard") {
        issues.push({ field: spec.exportKey, label: spec.label, severity: "error", message: `Required field is missing.` });
        blocked = true;
      } else if (spec.required === "soft") {
        issues.push({ field: spec.exportKey, label: spec.label, severity: "warning", message: `Recommended field is missing — downstream quality reduced.` });
      }
    } else {
      if (badEnum) {
        issues.push({ field: spec.exportKey, label: spec.label, severity: "warning", message: `"${strVal}" is not a recognised value. Expected one of: ${spec.validEnum!.join(", ")}.` });
      }
      if (badUrl) {
        issues.push({ field: spec.exportKey, label: spec.label, severity: "warning", message: `Value doesn't look like a valid URL: "${strVal.slice(0, 60)}"` });
      }
    }
  }

  return { id: String(ad.id ?? ""), issues, row, blocked };
}

// ── Database-level summary ────────────────────────────────────

export type ValidationSummary = {
  total: number;
  blocked: number;           // hard errors — would be excluded from export
  withWarnings: number;      // soft issues — exportable but degraded
  clean: number;             // no issues
  missingFields: { field: string; label: string; count: number }[];
  enumViolations: { field: string; label: string; count: number }[];
};

export function summariseValidation(results: RowValidationResult[]): ValidationSummary {
  const missCount: Record<string, { label: string; count: number }> = {};
  const enumCount: Record<string, { label: string; count: number }> = {};

  let blocked = 0, withWarnings = 0;

  for (const r of results) {
    if (r.blocked) blocked++;
    else if (r.issues.some((i) => i.severity === "warning")) withWarnings++;

    // Tally field-level issues across all rows (incl. blocked) so the
    // "Most common issue" callout reflects the real fix-list.
    for (const issue of r.issues) {
      if (issue.message.startsWith("Required") || issue.message.startsWith("Recommended")) {
        const slot = missCount[issue.field] ?? { label: issue.label, count: 0 };
        slot.count += 1;
        missCount[issue.field] = slot;
      } else if (issue.message.includes("not a recognised value")) {
        const slot = enumCount[issue.field] ?? { label: issue.label, count: 0 };
        slot.count += 1;
        enumCount[issue.field] = slot;
      }
    }
  }

  return {
    total: results.length,
    blocked,
    withWarnings,
    clean: results.length - blocked - withWarnings,
    missingFields: Object.entries(missCount)
      .map(([field, v]) => ({ field, label: v.label, count: v.count }))
      .sort((a, b) => b.count - a.count),
    enumViolations: Object.entries(enumCount)
      .map(([field, v]) => ({ field, label: v.label, count: v.count }))
      .sort((a, b) => b.count - a.count),
  };
}
