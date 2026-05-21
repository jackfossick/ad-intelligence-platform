"use client";

import Link from "next/link";
import { useState, useCallback } from "react";
import { useDb } from "@/lib/db-context";
import type { ValidationSummary, RowValidationResult } from "@/lib/schema-contract";

// ── Format options ────────────────────────────────────────────
const FORMATS = ["csv", "xlsx", "json"] as const;
type Format = typeof FORMATS[number];

// ── Main page ─────────────────────────────────────────────────

export default function ExportPage() {
  const { activeDb, databases, setActiveDbId } = useDb();

  const [validating, setValidating]     = useState(false);
  const [summary,    setSummary]        = useState<ValidationSummary | null>(null);
  const [preview,    setPreview]        = useState<RowValidationResult[]>([]);
  const [exporting,  setExporting]      = useState<Format | null>(null);
  const [validOnly,  setValidOnly]      = useState(true);
  const [format,     setFormat]         = useState<Format>("csv");
  const [showConfirm, setShowConfirm]   = useState(false);
  const [lastExported, setLastExported] = useState<string | null>(null);

  const effectiveDb = activeDb?.id ?? "";

  // ── Validate / preview ─────────────────────────────────────
  const runValidation = useCallback(async () => {
    if (!effectiveDb) return;
    setValidating(true);
    setSummary(null);
    setPreview([]);
    try {
      const res = await fetch(`/api/export?databaseId=${effectiveDb}&preview=1`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { summary: ValidationSummary; preview: RowValidationResult[] };
      setSummary(data.summary);
      setPreview(data.preview);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Validation failed");
    } finally {
      setValidating(false);
    }
  }, [effectiveDb]);

  // ── Download ───────────────────────────────────────────────
  const doExport = async (fmt: Format) => {
    if (!effectiveDb) return;
    setShowConfirm(false);
    setExporting(fmt);
    try {
      const params = new URLSearchParams({
        databaseId: effectiveDb,
        format: fmt,
        ...(validOnly ? { validOnly: "1" } : {}),
      });
      const res = await fetch(`/api/export?${params}`);
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ads-export-${Date.now()}.${fmt}`;
      a.click();
      URL.revokeObjectURL(url);
      setLastExported(new Date().toLocaleTimeString());
    } catch (e) {
      alert(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(null);
    }
  };

  // ── Derived state ──────────────────────────────────────────
  const total       = summary?.total       ?? activeDb?.adCount ?? 0;
  const blocked     = summary?.blocked     ?? 0;
  const warnings    = summary?.withWarnings ?? 0;
  const clean       = summary?.clean       ?? 0;
  const exportReady = clean + warnings;
  const exportCount = summary
    ? (validOnly ? summary.total - summary.blocked : summary.total)
    : activeDb?.adCount ?? 0;

  const healthPct = summary && summary.total > 0
    ? Math.round((summary.clean / summary.total) * 100)
    : null;

  // Schema-compliance card severity
  const schemaSeverity: Severity = !summary
    ? "neutral"
    : summary.blocked > 0
    ? "err"
    : summary.withWarnings > 0
    ? "warn"
    : "ok";

  // Data-integrity card severity (driven only by enum violations — what summariseValidation surfaces today)
  const enumIssueCount = summary
    ? summary.enumViolations.reduce((acc, e) => acc + e.count, 0)
    : 0;
  const integritySeverity: Severity = !summary
    ? "neutral"
    : enumIssueCount > 0
    ? "warn"
    : "ok";

  // Find specific missing-field counts for the schema card
  const findMissing = (label: string) =>
    summary?.missingFields.find((m) => m.label.toLowerCase() === label.toLowerCase())?.count ?? 0;

  const missingHook       = findMissing("Hook Type");
  const missingFormat     = findMissing("Format");
  const missingVideoUrl   = findMissing("Video URL");
  const missingAdCopy     = findMissing("Ad Copy");

  // Export hard-block: only block when validOnly is OFF and there are blocked rows
  const hardBlocked = !!summary && summary.blocked > 0 && !validOnly;

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1fr 280px",
      gap: 16,
      alignItems: "start",
      maxWidth: 1100,
    }}>
      {/* ─────────── MAIN COLUMN ─────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

        {/* Header */}
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>Export checkpoint</h2>
          <p style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
            Review dataset health before exporting. Hard errors are blocked from the export when{" "}
            <em>Export valid rows only</em> is on; otherwise they prevent download.
          </p>
        </div>

        {/* DB picker + validate */}
        <div className="card" style={{
          display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", flexWrap: "wrap",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 220 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase",
              color: "var(--color-text-tertiary)",
            }}>
              Database
            </span>
            <select
              value={effectiveDb}
              onChange={(e) => { setActiveDbId(e.target.value); setSummary(null); setPreview([]); }}
              style={{
                fontSize: 12, padding: "5px 8px", borderRadius: "var(--border-radius-md)",
                border: "1px solid var(--color-border-secondary)",
                background: "var(--color-background-primary)",
                color: "var(--color-text-primary)", flex: 1,
              }}
            >
              <option value="">— select —</option>
              {databases.map((db) => (
                <option key={db.id} value={db.id}>{db.name} ({db.adCount} ads)</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={runValidation}
            disabled={!effectiveDb || validating}
          >
            {validating ? "Validating…" : summary ? "↻ Re-validate" : "↻ Run validation"}
          </button>
        </div>

        {/* Blocked notice */}
        {summary && summary.blocked > 0 && (
          <div style={{
            display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px",
            background: "#FEECEC", border: "0.5px solid #F7C1C1",
            borderRadius: "var(--border-radius-md)", fontSize: 12, color: "#7A1F1F",
          }}>
            <span style={{
              width: 16, height: 16, borderRadius: "50%", background: "#D14040", color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10,
              flexShrink: 0, marginTop: 1, fontWeight: 700,
            }}>!</span>
            <div style={{ flex: 1 }}>
              <strong>Export {hardBlocked ? "blocked" : "would skip rows"}.</strong>{" "}
              {summary.blocked} record{summary.blocked === 1 ? "" : "s"} {hardBlocked ? "have" : "have"} hard errors.{" "}
              {hardBlocked
                ? "Resolve before proceeding, or enable \"Export valid rows only\" to skip them."
                : `They will be excluded from this export.`}{" "}
              <Link href="/validate" style={{ color: "#7A1F1F", textDecoration: "underline" }}>
                View in Validate →
              </Link>
            </div>
          </div>
        )}

        {/* Checkpoint cards */}
        <CheckpointCard
          icon={schemaSeverity === "ok" ? "✓" : schemaSeverity === "warn" ? "◑" : schemaSeverity === "err" ? "✕" : "○"}
          severity={schemaSeverity}
          title="Schema compliance"
        >
          <CheckRow
            label="Records with all required fields"
            value={summary
              ? `${exportReady} / ${summary.total} (${summary.total > 0 ? Math.round((exportReady / summary.total) * 100) : 0}%)`
              : "—"}
            valueClass={schemaSeverity}
          />
          <CheckRow
            label="Missing hook type"
            value={summary ? (missingHook > 0 ? `${missingHook} record${missingHook === 1 ? "" : "s"}` : "None") : "—"}
            valueClass={summary ? (missingHook > 0 ? "err" : "ok") : "neutral"}
          />
          <CheckRow
            label="Missing format"
            value={summary ? (missingFormat > 0 ? `${missingFormat} record${missingFormat === 1 ? "" : "s"}` : "None") : "—"}
            valueClass={summary ? (missingFormat > 0 ? "err" : "ok") : "neutral"}
          />
          <CheckRow
            label="Missing video URL"
            value={summary ? (missingVideoUrl > 0 ? `${missingVideoUrl} records (optional)` : "None") : "—"}
            valueClass={summary ? (missingVideoUrl > 0 ? "warn" : "ok") : "neutral"}
          />
          <CheckRow
            label="Missing ad copy"
            value={summary ? (missingAdCopy > 0 ? `${missingAdCopy} record${missingAdCopy === 1 ? "" : "s"}` : "None") : "—"}
            valueClass={summary ? (missingAdCopy > 0 ? "warn" : "ok") : "neutral"}
          />
        </CheckpointCard>

        <CheckpointCard
          icon={integritySeverity === "ok" ? "✓" : integritySeverity === "warn" ? "◑" : "○"}
          severity={integritySeverity}
          title="Data integrity"
        >
          {summary && summary.enumViolations.length > 0 ? (
            summary.enumViolations.slice(0, 4).map(({ label, count }) => (
              <CheckRow
                key={label}
                label={`Non-standard ${label.toLowerCase()} values`}
                value={`${count} record${count === 1 ? "" : "s"}`}
                valueClass="warn"
              />
            ))
          ) : (
            <>
              <CheckRow
                label="Non-standard platform values"
                value={summary ? "None" : "—"}
                valueClass={summary ? "ok" : "neutral"}
              />
              <CheckRow
                label="Non-standard hook values"
                value={summary ? "None" : "—"}
                valueClass={summary ? "ok" : "neutral"}
              />
              <CheckRow
                label="Non-standard format values"
                value={summary ? "None" : "—"}
                valueClass={summary ? "ok" : "neutral"}
              />
            </>
          )}
        </CheckpointCard>

        <CheckpointCard
          icon="✓"
          severity="ok"
          title="Scope"
        >
          <CheckRow label="Total records"  value={total > 0 ? `${total}` : "—"} />
          <CheckRow
            label="Export-ready"
            value={summary ? `${exportReady}` : "—"}
            valueClass={summary ? "ok" : "neutral"}
          />
          <CheckRow
            label="Export scope"
            value={validOnly ? "Export-ready only" : "All records"}
          />
          <CheckRow
            label="Will export"
            value={summary || activeDb ? `${exportCount} row${exportCount === 1 ? "" : "s"}` : "—"}
            valueClass={summary && validOnly && summary.blocked > 0 ? "warn" : undefined}
          />
        </CheckpointCard>

        {/* Format chooser */}
        <div>
          <div style={{
            fontSize: 12, fontWeight: 500, marginBottom: 8, color: "var(--color-text-primary)",
          }}>
            Format
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {FORMATS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFormat(f)}
                style={{
                  flex: 1, padding: "10px",
                  borderRadius: "var(--border-radius-md)",
                  border: format === f ? "0.5px solid #5B4FD9" : "0.5px solid var(--color-border-tertiary)",
                  background: format === f ? "#EEEDFE" : "var(--color-background-primary)",
                  color: format === f ? "#26215C" : "var(--color-text-secondary)",
                  fontWeight: format === f ? 500 : 400,
                  fontSize: 12, cursor: "pointer", textAlign: "center",
                }}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* validOnly toggle */}
        <label style={{
          display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer",
          padding: "10px 12px", border: "0.5px solid var(--color-border-tertiary)",
          borderRadius: "var(--border-radius-md)", background: "var(--color-background-primary)",
        }}>
          <input
            type="checkbox"
            checked={validOnly}
            onChange={(e) => setValidOnly(e.target.checked)}
            style={{ marginTop: 2, flexShrink: 0 }}
          />
          <div>
            <div style={{ fontSize: 12, fontWeight: 500 }}>Export valid rows only</div>
            <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 2 }}>
              Skips rows with hard errors. Recommended for downstream pipelines.
              {summary && validOnly && summary.blocked > 0 && (
                <span style={{ color: "#633806", marginLeft: 4 }}>
                  ({summary.blocked} will be excluded)
                </span>
              )}
            </div>
          </div>
        </label>

        {/* Export button */}
        <button
          type="button"
          onClick={() => setShowConfirm(true)}
          disabled={!effectiveDb || hardBlocked || exporting !== null}
          style={{
            width: "100%", padding: "12px", fontSize: 13, fontWeight: 500,
            borderRadius: "var(--border-radius-md)",
            border: "0.5px solid #5B4FD9",
            background: hardBlocked ? "#5B4FD9" : "#5B4FD9",
            color: "#EEEDFE",
            cursor: hardBlocked || !effectiveDb ? "not-allowed" : "pointer",
            opacity: hardBlocked || !effectiveDb ? 0.45 : 1,
          }}
          title={hardBlocked ? "Resolve hard errors or enable \"Export valid rows only\"" : undefined}
        >
          {exporting
            ? `Exporting ${exporting.toUpperCase()}…`
            : hardBlocked
            ? "Export dataset — resolve issues first"
            : `↓ Export dataset (${format.toUpperCase()})`}
        </button>

        {lastExported && (
          <div style={{ fontSize: 11, color: "#085041" }}>
            ✓ Last exported at {lastExported}
          </div>
        )}
      </div>

      {/* ─────────── SIDEBAR ─────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, position: "sticky", top: 24 }}>
        {/* Health donut */}
        <div className="card" style={{
          padding: 14, display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)",
            textTransform: "uppercase", letterSpacing: "0.05em", alignSelf: "flex-start",
          }}>
            Dataset health
          </div>
          <HealthDonut summary={summary} pct={healthPct} />
          <div style={{ display: "flex", gap: 12, fontSize: 11 }}>
            <LegendDot color="#27A06A" label="Ready" />
            <LegendDot color="#D4870A" label="Partial" />
            <LegendDot color="#D14040" label="Invalid" />
          </div>
        </div>

        {/* Dataset stats */}
        <div className="card" style={{ padding: 14 }}>
          <div style={{
            fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)",
            textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8,
          }}>
            Dataset stats
          </div>
          <DatasetStat label="Total ads"     value={total > 0 ? String(total) : "—"} />
          <DatasetStat label="Blocked"       value={summary ? String(blocked)   : "—"} valueColor={blocked > 0  ? "#7A1F1F" : undefined} />
          <DatasetStat label="With warnings" value={summary ? String(warnings)  : "—"} valueColor={warnings > 0 ? "#633806" : undefined} />
          <DatasetStat label="Clean"         value={summary ? String(clean)     : "—"} valueColor={clean > 0    ? "#085041" : undefined} />
          <DatasetStat label="Export-ready"  value={summary ? String(exportReady) : "—"} />
        </div>

        {/* Schema legend */}
        <div className="card" style={{ padding: 14 }}>
          <div style={{
            fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)",
            textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8,
          }}>
            Export schema
          </div>
          <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: 0, marginBottom: 8, lineHeight: 1.5 }}>
            9-field canonical schema. Hard fields block; soft fields warn.
          </p>
          {[
            { key: "id",                 req: "hard",     label: "ID" },
            { key: "platform",           req: "soft",     label: "Platform" },
            { key: "ad_url",             req: "hard",     label: "Ad URL" },
            { key: "creative_video_url", req: "optional", label: "Video URL" },
            { key: "ad_copy",            req: "soft",     label: "Ad Copy" },
            { key: "hook",               req: "soft",     label: "Hook Type" },
            { key: "format",             req: "soft",     label: "Format" },
            { key: "score",              req: "optional", label: "Score" },
            { key: "scraped_at",         req: "optional", label: "Date" },
          ].map(({ key, req, label }) => (
            <div key={key} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              fontSize: 11, padding: "3px 0",
              borderBottom: "0.5px solid var(--color-border-tertiary)",
            }}>
              <span style={{ color: "var(--color-text-secondary)" }}>{label}</span>
              <span style={{
                fontSize: 9, fontWeight: 500,
                color: req === "hard" ? "#7A1F1F" : req === "soft" ? "#633806" : "var(--color-text-tertiary)",
              }}>
                {req === "hard" ? "● hard" : req === "soft" ? "◐ soft" : "○ optional"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ─────────── Confirm modal ─────────── */}
      {showConfirm && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
        }}>
          <div className="card" style={{ width: 420, maxWidth: "90vw", padding: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
              Confirm export ({format.toUpperCase()})
            </div>
            <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 16, lineHeight: 1.6 }}>
              Exporting <strong>{exportCount.toLocaleString()} ad{exportCount === 1 ? "" : "s"}</strong> from{" "}
              <strong>{activeDb?.name}</strong>
              {validOnly && summary && summary.blocked > 0 && (
                <span style={{ color: "#633806" }}> — {summary.blocked} blocked rows excluded</span>
              )}.
            </div>
            {!summary && (
              <div style={{
                fontSize: 12, padding: "8px 12px", borderRadius: 6, marginBottom: 16,
                background: "#FEF3DA", color: "#633806",
              }}>
                ⚠ Schema not validated. Run validation first to check for blocking errors.
              </div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowConfirm(false)}>
                Cancel
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => doExport(format)}>
                ↓ Confirm & download
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview drawer (kept for parity with prior page) */}
      {summary && preview.length > 0 && (
        <details style={{ gridColumn: "1 / -1", marginTop: 8 }}>
          <summary style={{
            fontSize: 12, fontWeight: 500, cursor: "pointer",
            color: "var(--color-text-secondary)", userSelect: "none",
          }}>
            Preview first {preview.length} rows (click to expand)
          </summary>
          <PreviewTable rows={preview} />
        </details>
      )}
    </div>
  );
}

// ─────────── Sub-components ───────────

type Severity = "ok" | "warn" | "err" | "neutral";

function CheckpointCard({
  icon, severity, title, children,
}: {
  icon: string;
  severity: Severity;
  title: string;
  children: React.ReactNode;
}) {
  const headerStyle =
    severity === "ok"   ? { background: "#E1F5EE", color: "#085041", border: "#9FE1CB" } :
    severity === "warn" ? { background: "#FEF3DA", color: "#633806", border: "#FAC775" } :
    severity === "err"  ? { background: "#FEECEC", color: "#7A1F1F", border: "#F7C1C1" } :
                          { background: "var(--color-background-secondary)", color: "var(--color-text-secondary)", border: "var(--color-border-tertiary)" };
  return (
    <div style={{
      border: "0.5px solid var(--color-border-tertiary)",
      borderRadius: "var(--border-radius-lg)",
      overflow: "hidden",
    }}>
      <div style={{
        padding: "10px 14px", borderBottom: `0.5px solid ${headerStyle.border}`,
        display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 500,
        background: headerStyle.background, color: headerStyle.color,
      }}>
        <span>{icon}</span>
        <span>{title}</span>
      </div>
      <div style={{ padding: "10px 14px", fontSize: 12 }}>
        {children}
      </div>
    </div>
  );
}

function CheckRow({
  label, value, valueClass,
}: {
  label: string;
  value: string;
  valueClass?: Severity;
}) {
  const valColor =
    valueClass === "ok"   ? "#085041" :
    valueClass === "warn" ? "#633806" :
    valueClass === "err"  ? "#7A1F1F" :
                            "var(--color-text-primary)";
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "5px 0", borderBottom: "0.5px solid var(--color-border-tertiary)",
    }}>
      <span style={{ color: "var(--color-text-secondary)" }}>{label}</span>
      <span style={{ fontWeight: 500, color: valColor }}>{value}</span>
    </div>
  );
}

function HealthDonut({
  summary, pct,
}: {
  summary: ValidationSummary | null;
  pct: number | null;
}) {
  const r = 36;
  const c = 2 * Math.PI * r;
  const blockedFrac  = summary && summary.total > 0 ? summary.blocked / summary.total : 0;
  const warningFrac  = summary && summary.total > 0 ? summary.withWarnings / summary.total : 0;
  const cleanFrac    = summary && summary.total > 0 ? summary.clean / summary.total : 0;

  // Build dasharray segments for stacked donut: clean (green), warnings (orange), blocked (red)
  const cleanLen = cleanFrac * c;
  const warnLen  = warningFrac * c;
  const blockedLen = blockedFrac * c;

  return (
    <div style={{ position: "relative", width: 90, height: 90 }}>
      <svg width={90} height={90} viewBox="0 0 90 90">
        <circle cx={45} cy={45} r={r} fill="none" stroke="var(--color-background-tertiary)" strokeWidth={8} />
        {summary && summary.total > 0 && (
          <g transform="rotate(-90 45 45)">
            {cleanLen > 0 && (
              <circle
                cx={45} cy={45} r={r} fill="none" stroke="#27A06A" strokeWidth={8}
                strokeDasharray={`${cleanLen} ${c - cleanLen}`}
                strokeDashoffset={0}
                strokeLinecap="butt"
              />
            )}
            {warnLen > 0 && (
              <circle
                cx={45} cy={45} r={r} fill="none" stroke="#D4870A" strokeWidth={8}
                strokeDasharray={`${warnLen} ${c - warnLen}`}
                strokeDashoffset={-cleanLen}
                strokeLinecap="butt"
              />
            )}
            {blockedLen > 0 && (
              <circle
                cx={45} cy={45} r={r} fill="none" stroke="#D14040" strokeWidth={8}
                strokeDasharray={`${blockedLen} ${c - blockedLen}`}
                strokeDashoffset={-(cleanLen + warnLen)}
                strokeLinecap="butt"
              />
            )}
          </g>
        )}
        <text
          x={45} y={49} textAnchor="middle"
          fontSize={18} fontWeight={500} fill="var(--color-text-primary)"
        >
          {pct !== null ? `${pct}%` : "—"}
        </text>
      </svg>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--color-text-secondary)" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, display: "inline-block" }} />
      {label}
    </div>
  );
}

function DatasetStat({
  label, value, valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "5px 0", borderBottom: "0.5px solid var(--color-border-tertiary)",
      fontSize: 12,
    }}>
      <span style={{ color: "var(--color-text-secondary)" }}>{label}</span>
      <span style={{ fontWeight: 500, color: valueColor ?? "var(--color-text-primary)" }}>{value}</span>
    </div>
  );
}

function IssueBadge({ severity }: { severity: "error" | "warning" | "info" }) {
  const cfg = {
    error:   { bg: "#FEECEC", color: "#7A1F1F", label: "error" },
    warning: { bg: "#FEF3DA", color: "#633806", label: "warn" },
    info:    { bg: "#EEF4FF", color: "#1D64D8", label: "info" },
  }[severity];
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
      padding: "1px 5px", borderRadius: 4, background: cfg.bg, color: cfg.color,
    }}>
      {cfg.label}
    </span>
  );
}

function PreviewTable({ rows }: { rows: RowValidationResult[] }) {
  if (!rows.length) return null;
  return (
    <div style={{ marginTop: 12, overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr style={{ background: "var(--color-background-secondary)" }}>
            {["#", "ID (short)", "Platform", "Ad URL", "Ad Copy", "Hook", "Format", "Score", "Status"].map((h) => (
              <th key={h} style={{
                padding: "5px 8px", textAlign: "left", fontWeight: 600, fontSize: 10,
                color: "var(--color-text-tertiary)", borderBottom: "1px solid var(--color-border-tertiary)",
                whiteSpace: "nowrap",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const rowBg = r.blocked
              ? "rgba(226,75,74,0.05)"
              : r.issues.some((x) => x.severity === "warning")
              ? "rgba(239,159,39,0.05)"
              : "transparent";
            return (
              <tr key={r.id} style={{ background: rowBg, borderBottom: "1px solid var(--color-border-tertiary)" }}>
                <td style={{ padding: "5px 8px", color: "var(--color-text-tertiary)" }}>{i + 1}</td>
                <td style={{ padding: "5px 8px", fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}>
                  {r.id.slice(0, 8)}…
                </td>
                {(["platform", "ad_url", "ad_copy", "hook", "format", "score"] as const).map((key) => {
                  const issue = r.issues.find((x) => x.field === key);
                  const val = r.row[key];
                  return (
                    <td key={key} style={{ padding: "5px 8px", maxWidth: 180 }}>
                      {issue ? (
                        <span title={issue.message} style={{ cursor: "help" }}>
                          <IssueBadge severity={issue.severity} />
                          {val && <span style={{ marginLeft: 4, color: "var(--color-text-secondary)" }}>{val.slice(0, 40)}{val.length > 40 ? "…" : ""}</span>}
                        </span>
                      ) : (
                        <span style={{ color: "var(--color-text-primary)" }}>{val?.slice(0, 60)}{val && val.length > 60 ? "…" : ""}</span>
                      )}
                    </td>
                  );
                })}
                <td style={{ padding: "5px 8px" }}>
                  {r.blocked ? (
                    <span style={{ fontSize: 10, fontWeight: 600, color: "#7A1F1F", background: "#FEECEC", padding: "2px 6px", borderRadius: 4 }}>blocked</span>
                  ) : r.issues.some((x) => x.severity === "warning") ? (
                    <span style={{ fontSize: 10, fontWeight: 600, color: "#633806", background: "#FEF3DA", padding: "2px 6px", borderRadius: 4 }}>warns</span>
                  ) : (
                    <span style={{ fontSize: 10, fontWeight: 600, color: "#085041", background: "#E1F5EE", padding: "2px 6px", borderRadius: 4 }}>ok</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
