"use client";

import { useState, useCallback } from "react";
import { useDb } from "@/lib/db-context";
import type { ValidationSummary, RowValidationResult } from "@/lib/schema-contract";

// ── helpers ───────────────────────────────────────────────────

function pct(n: number, total: number) {
  if (!total) return "0";
  return ((n / total) * 100).toFixed(0);
}

// ── sub-components ────────────────────────────────────────────

function SeverityBar({ blocked, withWarnings, clean, total }: ValidationSummary) {
  const bPct = pct(blocked, total);
  const wPct = pct(withWarnings, total);
  const cPct = pct(clean, total);
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 99, background: "var(--color-border-tertiary)", overflow: "hidden", display: "flex" }}>
        <div style={{ width: `${bPct}%`, background: "#EF4444", transition: "width 0.3s" }} />
        <div style={{ width: `${wPct}%`, background: "#F59E0B", transition: "width 0.3s" }} />
        <div style={{ width: `${cPct}%`, background: "#22C55E", transition: "width 0.3s" }} />
      </div>
      <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", whiteSpace: "nowrap" }}>
        <span style={{ color: "#EF4444", fontWeight: 600 }}>{blocked}</span>
        <span> blocked · </span>
        <span style={{ color: "#F59E0B", fontWeight: 600 }}>{withWarnings}</span>
        <span> warn · </span>
        <span style={{ color: "#22C55E", fontWeight: 600 }}>{clean}</span>
        <span> clean</span>
      </div>
    </div>
  );
}

function IssueBadge({ severity }: { severity: "error" | "warning" | "info" }) {
  const cfg = {
    error:   { bg: "#FEE2E2", color: "#B91C1C", label: "error" },
    warning: { bg: "#FEF3C7", color: "#B45309", label: "warn" },
    info:    { bg: "#EFF6FF", color: "#1D4ED8", label: "info" },
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
            {["#", "ID (short)", "Platform", "Ad URL", "Ad Copy", "Hook", "Format", "Score", "Status"].map(h => (
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
              ? "rgba(239,68,68,0.05)"
              : r.issues.some(x => x.severity === "warning")
              ? "rgba(245,158,11,0.04)"
              : "transparent";
            return (
              <tr key={r.id} style={{ background: rowBg, borderBottom: "1px solid var(--color-border-tertiary)" }}>
                <td style={{ padding: "5px 8px", color: "var(--color-text-tertiary)" }}>{i + 1}</td>
                <td style={{ padding: "5px 8px", fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}>
                  {r.id.slice(0, 8)}…
                </td>
                {(["platform", "ad_url", "ad_copy", "hook", "format", "score"] as const).map(key => {
                  const issue = r.issues.find(x => x.field === key);
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
                    <span style={{ fontSize: 10, fontWeight: 600, color: "#B91C1C", background: "#FEE2E2", padding: "2px 6px", borderRadius: 4 }}>blocked</span>
                  ) : r.issues.some(x => x.severity === "warning") ? (
                    <span style={{ fontSize: 10, fontWeight: 600, color: "#B45309", background: "#FEF3C7", padding: "2px 6px", borderRadius: 4 }}>warns</span>
                  ) : (
                    <span style={{ fontSize: 10, fontWeight: 600, color: "#15803D", background: "#DCFCE7", padding: "2px 6px", borderRadius: 4 }}>ok</span>
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

// ── main page ─────────────────────────────────────────────────

export default function ExportPage() {
  const { activeDb, databases, setActiveDbId } = useDb();

  const [validating, setValidating]   = useState(false);
  const [summary, setSummary]         = useState<ValidationSummary | null>(null);
  const [preview, setPreview]         = useState<RowValidationResult[]>([]);
  const [exporting, setExporting]     = useState<string | null>(null);
  const [validOnly, setValidOnly]     = useState(true);
  const [showConfirm, setShowConfirm] = useState<"csv" | "xlsx" | "json" | null>(null);
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
  const doExport = async (format: "csv" | "xlsx" | "json") => {
    if (!effectiveDb) return;
    setShowConfirm(null);
    setExporting(format);
    try {
      const params = new URLSearchParams({
        databaseId: effectiveDb,
        format,
        ...(validOnly ? { validOnly: "1" } : {}),
      });
      const res = await fetch(`/api/export?${params}`);
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ads-export-${Date.now()}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      setLastExported(new Date().toLocaleTimeString());
    } catch (e) {
      alert(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(null);
    }
  };

  // ── Derived ────────────────────────────────────────────────
  const readyToExport = !!effectiveDb;
  const exportCount = summary
    ? (validOnly ? summary.total - summary.blocked : summary.total)
    : activeDb?.adCount ?? 0;

  const schemaHealth = summary
    ? summary.blocked === 0 && summary.withWarnings === 0
      ? "clean"
      : summary.blocked > 0
      ? "errors"
      : "warnings"
    : null;

  const healthColor = schemaHealth === "clean" ? "#16A34A" : schemaHealth === "errors" ? "#DC2626" : schemaHealth === "warnings" ? "#D97706" : "var(--color-text-tertiary)";
  const healthLabel = schemaHealth === "clean" ? "Schema clean ✓" : schemaHealth === "errors" ? "Has blocking errors" : schemaHealth === "warnings" ? "Has warnings" : "Not yet validated";

  return (
    <div style={{ maxWidth: 900 }}>
      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 500 }}>Export</h2>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 4 }}>
          Download your ad database. Validate schema health before exporting to catch missing fields.
        </p>
      </div>

      {/* ── DB card ────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--color-text-tertiary)", marginBottom: 6 }}>
            Active database
          </div>
          <select
            value={effectiveDb}
            onChange={(e) => { setActiveDbId(e.target.value); setSummary(null); setPreview([]); }}
            style={{
              fontSize: 13, padding: "7px 10px", borderRadius: "var(--border-radius-md)",
              border: "1px solid var(--color-border-secondary)",
              background: "var(--color-background-primary)",
              color: "var(--color-text-primary)", width: "100%",
            }}
          >
            <option value="">— select database —</option>
            {databases.map((db) => (
              <option key={db.id} value={db.id}>{db.name} ({db.adCount} ads)</option>
            ))}
          </select>
        </div>

        {activeDb && (
          <div style={{ display: "flex", gap: 20, flexShrink: 0 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: "var(--color-text-primary)" }}>{activeDb.adCount}</div>
              <div style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>total ads</div>
            </div>
            {summary && (
              <>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#DC2626" }}>{summary.blocked}</div>
                  <div style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>blocked</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#D97706" }}>{summary.withWarnings}</div>
                  <div style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>warnings</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#16A34A" }}>{summary.clean}</div>
                  <div style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>clean</div>
                </div>
              </>
            )}
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: healthColor }}>{healthLabel}</div>
              <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginTop: 2 }}>schema</div>
            </div>
          </div>
        )}

        <button
          className="btn btn-secondary btn-sm"
          onClick={runValidation}
          disabled={!effectiveDb || validating}
          style={{ flexShrink: 0 }}
        >
          {validating ? "Validating…" : "↻ Validate schema"}
        </button>
      </div>

      {/* ── Validation summary ─────────────────────────────── */}
      {summary && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title" style={{ marginBottom: 8 }}>Schema validation</div>

          <SeverityBar {...summary} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
            {summary.missingFields.length > 0 && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-tertiary)", marginBottom: 6 }}>
                  Missing fields
                </div>
                {summary.missingFields.slice(0, 8).map(({ label, count }) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0", borderBottom: "1px solid var(--color-border-tertiary)" }}>
                    <span style={{ color: "var(--color-text-secondary)" }}>{label}</span>
                    <span style={{ fontWeight: 600, color: "#D97706" }}>{count} rows</span>
                  </div>
                ))}
              </div>
            )}

            {summary.enumViolations.length > 0 && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-tertiary)", marginBottom: 6 }}>
                  Enum violations
                </div>
                {summary.enumViolations.slice(0, 8).map(({ label, count }) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0", borderBottom: "1px solid var(--color-border-tertiary)" }}>
                    <span style={{ color: "var(--color-text-secondary)" }}>{label}</span>
                    <span style={{ fontWeight: 600, color: "#D97706" }}>{count} rows</span>
                  </div>
                ))}
              </div>
            )}

            {summary.missingFields.length === 0 && summary.enumViolations.length === 0 && (
              <div style={{ gridColumn: "1 / -1", fontSize: 13, color: "#16A34A", fontWeight: 500 }}>
                ✓ All rows pass schema validation — no missing required fields or enum violations.
              </div>
            )}
          </div>

          {preview.length > 0 && (
            <details style={{ marginTop: 12 }}>
              <summary style={{ fontSize: 12, fontWeight: 500, cursor: "pointer", color: "var(--color-text-secondary)", userSelect: "none" }}>
                Preview first {preview.length} rows (click to expand)
              </summary>
              <PreviewTable rows={preview} />
            </details>
          )}
        </div>
      )}

      {/* ── Export options ─────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title" style={{ marginBottom: 10 }}>Export options</div>

        <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={validOnly}
            onChange={(e) => setValidOnly(e.target.checked)}
            style={{ marginTop: 2, flexShrink: 0 }}
          />
          <div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Export valid rows only</div>
            <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 2 }}>
              Skip rows that have blocking errors (missing ID or no ad URL). Recommended for downstream AI pipelines.
              {summary && validOnly && summary.blocked > 0 && (
                <span style={{ color: "#DC2626", marginLeft: 6 }}>
                  {summary.blocked} rows will be excluded.
                </span>
              )}
            </div>
          </div>
        </label>
      </div>

      {/* ── Format cards ───────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
        {([
          { format: "csv"  as const, icon: "📄", title: "CSV",          desc: "Comma-separated. Compatible with Excel, Google Sheets, and most data tools." },
          { format: "xlsx" as const, icon: "📊", title: "Excel (XLSX)", desc: "Formatted spreadsheet. Open directly in Excel or Numbers." },
          { format: "json" as const, icon: "{ }", title: "JSON",         desc: "Structured data for AI systems, pipelines, and APIs." },
        ]).map(({ format, icon, title, desc }) => (
          <div key={format} className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 26, marginBottom: 2 }}>{icon}</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.5, flex: 1 }}>{desc}</p>
            {summary && (
              <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
                {exportCount.toLocaleString()} rows will be exported
                {validOnly && summary.blocked > 0 && <span style={{ color: "#D97706" }}> (−{summary.blocked} blocked)</span>}
              </div>
            )}
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setShowConfirm(format)}
              disabled={!readyToExport || exporting !== null}
              style={{ alignSelf: "flex-start" }}
            >
              {exporting === format ? "Exporting…" : `↓ Download ${format.toUpperCase()}`}
            </button>
          </div>
        ))}
      </div>

      {/* ── Schema note ────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Export schema</div>
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 10 }}>
          Canonical 9-field schema optimised for AI ingestion. Hard-required fields block a row if missing.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
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
          ].map(({ key, req, label }) => {
            const color = req === "hard" ? "#DC2626" : req === "soft" ? "#D97706" : "#6B7280";
            const bg    = req === "hard" ? "#FEE2E2" : req === "soft" ? "#FEF3C7" : "var(--color-background-secondary)";
            return (
              <div key={key} title={`${req} field`} style={{
                fontSize: 11, padding: "3px 8px", borderRadius: 6,
                background: bg, color, fontWeight: 500,
                fontFamily: "var(--font-mono)",
              }}>
                {label}
                <span style={{ fontSize: 9, marginLeft: 4, opacity: 0.7 }}>
                  {req === "hard" ? "●" : req === "soft" ? "◐" : "○"}
                </span>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 11, color: "var(--color-text-tertiary)" }}>
          <span><span style={{ color: "#DC2626" }}>●</span> hard — blocks row</span>
          <span><span style={{ color: "#D97706" }}>◐</span> soft — warns only</span>
          <span><span style={{ color: "#6B7280" }}>○</span> optional</span>
        </div>
      </div>

      {lastExported && (
        <div style={{ fontSize: 12, color: "#16A34A", marginTop: 8 }}>
          ✓ Last exported at {lastExported}
        </div>
      )}

      {/* ── Confirm modal ───────────────────────────────────── */}
      {showConfirm && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
        }}>
          <div className="card" style={{ width: 420, maxWidth: "90vw", padding: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
              Confirm export ({showConfirm.toUpperCase()})
            </div>
            <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 16, lineHeight: 1.6 }}>
              Exporting <strong>{exportCount.toLocaleString()} ads</strong> from{" "}
              <strong>{activeDb?.name}</strong>
              {validOnly && summary && summary.blocked > 0 && (
                <span style={{ color: "#D97706" }}> — {summary.blocked} blocked rows excluded</span>
              )}.
            </div>
            {!summary && (
              <div style={{
                fontSize: 12, padding: "8px 12px", borderRadius: 6, marginBottom: 16,
                background: "#FEF3C7", color: "#B45309",
              }}>
                ⚠ Schema not validated. Run "Validate schema" first to check for blocking errors.
              </div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowConfirm(null)}>
                Cancel
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => doExport(showConfirm)}>
                ↓ Confirm & download
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
