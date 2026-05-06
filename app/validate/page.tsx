"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDb } from "@/lib/db-context";
import type { RowValidationResult, ValidationSummary } from "@/lib/schema-contract";

type Bucket = "all" | "ready" | "incomplete" | "invalid";

const FIELD_FILTERS = [
  { key: "hook",               label: "Missing: hook" },
  { key: "format",             label: "Missing: format" },
  { key: "creative_video_url", label: "Missing: video URL" },
  { key: "ad_copy",            label: "Missing: ad copy" },
  { key: "platform",           label: "Missing: platform" },
] as const;

function readiness(row: RowValidationResult): number {
  const errs  = row.issues.filter((i) => i.severity === "error").length;
  const warns = row.issues.filter((i) => i.severity === "warning").length;
  if (errs > 0) return Math.max(0, 100 - errs * 30 - warns * 10);
  return Math.max(0, 100 - warns * 15);
}

function readinessClass(pct: number): { bar: string; text: string } {
  if (pct >= 95) return { bar: "#639922", text: "#3B6D11" };
  if (pct >= 60) return { bar: "#EF9F27", text: "#854F0B" };
  return { bar: "#E24B4A", text: "#A32D2D" };
}

function bucketOf(r: RowValidationResult): Bucket {
  if (r.blocked) return "invalid";
  const hasWarn = r.issues.some((i) => i.severity === "warning");
  return hasWarn ? "incomplete" : "ready";
}

export default function ValidatePage() {
  const { activeDb } = useDb();
  const dbId = activeDb?.id ?? "";

  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [summary, setSummary]   = useState<ValidationSummary | null>(null);
  const [rows, setRows]         = useState<RowValidationResult[]>([]);
  const [bucket, setBucket]     = useState<Bucket>("all");
  const [missingFilter, setMissingFilter] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!dbId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/export?databaseId=${dbId}&validate=1`);
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { summary: ValidationSummary; preview: RowValidationResult[] };
      setSummary(data.summary);
      setRows(data.preview);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Validation failed");
    } finally {
      setLoading(false);
    }
  }, [dbId]);

  useEffect(() => { load(); }, [load]);

  const filteredRows = useMemo(() => {
    let r = rows;
    if (bucket !== "all") r = r.filter((row) => bucketOf(row) === bucket);
    if (missingFilter) {
      r = r.filter((row) => row.issues.some(
        (i) => i.field === missingFilter && (i.severity === "error" || i.severity === "warning"),
      ));
    }
    return r;
  }, [rows, bucket, missingFilter]);

  const ready       = summary ? summary.clean : 0;
  const incomplete  = summary ? summary.withWarnings : 0;
  const invalid     = summary ? summary.blocked : 0;
  const total       = summary ? summary.total : 0;
  const topMissing  = summary?.missingFields[0] ?? null;

  return (
    <div style={{ maxWidth: 1100 }}>
      {/* ── Header ──────────────────────────────────────────── */}
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 500 }}>Validate</h2>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 4 }}>
          Audit dataset health against the export schema. Fix incomplete rows before exporting.
          {activeDb && <span style={{ marginLeft: 8 }}>— <strong>{activeDb.name}</strong> ({activeDb.adCount} ads)</span>}
        </p>
      </div>

      {/* ── No DB state ─────────────────────────────────────── */}
      {!dbId && (
        <div className="card" style={{ padding: 20, fontSize: 13, color: "var(--color-text-secondary)" }}>
          Select a database from the sidebar to validate.
        </div>
      )}

      {/* ── Summary bar ─────────────────────────────────────── */}
      {summary && (
        <div className="card" style={{
          display: "flex", alignItems: "center", gap: 16, padding: "12px 16px",
          marginBottom: 12, flexWrap: "wrap",
        }}>
          <SumStat n={ready}      color="#3B6D11" label="export-ready" />
          <Sep />
          <SumStat n={incomplete} color="#854F0B" label="incomplete" />
          <Sep />
          <SumStat n={invalid}    color="#A32D2D" label="invalid" />
          <Sep />
          <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
            Most common issue: <strong style={{ color: "var(--color-text-primary)" }}>
              {topMissing ? `Missing ${topMissing.label} (${topMissing.count} ads)` : "None — dataset clean"}
            </strong>
          </span>
          {topMissing && (
            <Link
              href={`/review?missing=${encodeURIComponent(topMissing.field)}${dbId ? `&dbId=${dbId}` : ""}`}
              className="btn btn-sm"
              style={{ marginLeft: "auto", textDecoration: "none" }}
            >
              Fix all in Review →
            </Link>
          )}
          <button
            className="btn btn-secondary btn-sm"
            style={topMissing ? undefined : { marginLeft: "auto" }}
            onClick={load}
            disabled={loading}
          >
            {loading ? "Validating…" : "↻ Re-run"}
          </button>
        </div>
      )}

      {error && (
        <div className="card" style={{ padding: 12, marginBottom: 12, background: "#FCEBEB", color: "#791F1F", fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* ── Filter chips ────────────────────────────────────── */}
      {summary && (
        <div className="card" style={{ display: "flex", gap: 6, padding: "10px 16px", marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
          <Chip on={bucket === "all"}        onClick={() => setBucket("all")}>All ({total})</Chip>
          <Chip on={bucket === "ready"}      onClick={() => setBucket("ready")}>Export-ready ({ready})</Chip>
          <Chip on={bucket === "incomplete"} onClick={() => setBucket("incomplete")}>Incomplete ({incomplete})</Chip>
          <Chip on={bucket === "invalid"}    onClick={() => setBucket("invalid")}>Invalid ({invalid})</Chip>
          <Sep />
          {FIELD_FILTERS.map((f) => (
            <Chip
              key={f.key}
              on={missingFilter === f.key}
              onClick={() => setMissingFilter(missingFilter === f.key ? null : f.key)}
            >
              {f.label}
            </Chip>
          ))}
        </div>
      )}

      {/* ── Table ───────────────────────────────────────────── */}
      {summary && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto", maxHeight: 540, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
              <thead>
                <tr>
                  <Th width={90}>ID</Th>
                  <Th width={80}>Platform</Th>
                  <Th width={220}>Ad copy</Th>
                  <Th width={120}>Hook</Th>
                  <Th width={110}>Format</Th>
                  <Th width={70}>Video</Th>
                  <Th width={120}>Readiness</Th>
                  <Th width={70}>Fix</Th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 && (
                  <tr><td colSpan={8} style={{ padding: 24, textAlign: "center", fontSize: 12, color: "var(--color-text-tertiary)" }}>
                    {loading ? "Loading…" : "No rows match these filters."}
                  </td></tr>
                )}
                {filteredRows.map((r) => {
                  const pct = readiness(r);
                  const cls = readinessClass(pct);
                  const issueFor = (k: string) => r.issues.find((i) => i.field === k);
                  return (
                    <tr key={r.id} style={{ borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                      <td style={{ padding: "8px 10px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-text-secondary)" }}>
                        {r.id.slice(0, 8)}…
                      </td>
                      <td style={{ padding: "8px 10px" }}>
                        <ValueOrMissing val={r.row.platform} missing={!!issueFor("platform")} kind="tag" />
                      </td>
                      <td style={{ padding: "8px 10px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <span style={{ fontSize: 11, color: "var(--color-text-primary)" }}>
                          {r.row.ad_copy ? `"${r.row.ad_copy.slice(0, 60)}${r.row.ad_copy.length > 60 ? "…" : ""}"` : "—"}
                        </span>
                      </td>
                      <td style={{ padding: "8px 10px" }}>
                        <ValueOrMissing val={r.row.hook} missing={!!issueFor("hook")} kind="badge" />
                      </td>
                      <td style={{ padding: "8px 10px" }}>
                        <ValueOrMissing val={r.row.format} missing={!!issueFor("format")} kind="badge" />
                      </td>
                      <td style={{ padding: "8px 10px" }}>
                        {r.row.creative_video_url
                          ? <span style={{ fontSize: 11, color: "#3B6D11" }}>✓</span>
                          : <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>—</span>}
                      </td>
                      <td style={{ padding: "8px 10px" }}>
                        <span style={{
                          display: "inline-block", height: 4, width: 60, borderRadius: 2,
                          background: "var(--color-background-tertiary)", verticalAlign: "middle", overflow: "hidden",
                        }}>
                          <span style={{ display: "block", height: "100%", width: `${pct}%`, background: cls.bar, borderRadius: 2 }} />
                        </span>
                        <span style={{ marginLeft: 6, fontSize: 11, color: cls.text, verticalAlign: "middle" }}>{pct}%</span>
                      </td>
                      <td style={{ padding: "8px 10px" }}>
                        {r.blocked || r.issues.some((i) => i.severity === "warning") ? (
                          <Link
                            href={`/review?focusId=${r.id}${dbId ? `&dbId=${dbId}` : ""}`}
                            style={{
                              fontSize: 10, padding: "2px 7px", borderRadius: 4,
                              border: "0.5px solid var(--color-border-secondary)",
                              color: "var(--color-text-primary)", textDecoration: "none",
                              background: "var(--color-background-primary)",
                            }}
                          >
                            Fix ↗
                          </Link>
                        ) : (
                          <span style={{ fontSize: 11, color: "#3B6D11" }}>Ready</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Footer hint ─────────────────────────────────────── */}
      {summary && summary.blocked > 0 && (
        <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 12 }}>
          Export is blocked while {summary.blocked} record{summary.blocked === 1 ? "" : "s"} have hard errors. Use Fix → Review to resolve, then re-run validation.
        </div>
      )}
    </div>
  );
}

// ── Local sub-components ─────────────────────────────────────

function SumStat({ n, color, label }: { n: number; color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
      <span style={{ fontSize: 18, fontWeight: 500, color }}>{n}</span>
      <span style={{ color: "var(--color-text-secondary)" }}>{label}</span>
    </div>
  );
}

function Sep() {
  return <span style={{ width: "0.5px", height: 20, background: "var(--color-border-tertiary)" }} />;
}

function Chip({ on, onClick, children }: { on?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "4px 10px", borderRadius: 20, fontSize: 11,
        border: "0.5px solid var(--color-border-tertiary)",
        background: on ? "var(--color-background-secondary)" : "var(--color-background-primary)",
        color: on ? "var(--color-text-primary)" : "var(--color-text-secondary)",
        fontWeight: on ? 500 : 400,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function Th({ children, width }: { children: React.ReactNode; width?: number }) {
  return (
    <th style={{
      padding: "8px 10px", textAlign: "left",
      color: "var(--color-text-secondary)", fontWeight: 500, fontSize: 11,
      borderBottom: "0.5px solid var(--color-border-tertiary)",
      background: "var(--color-background-secondary)",
      position: "sticky", top: 0, width,
    }}>
      {children}
    </th>
  );
}

function ValueOrMissing({ val, missing, kind }: { val: string; missing: boolean; kind: "tag" | "badge" }) {
  if (!val || missing) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "#A32D2D" }}>
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#E24B4A" }} />
        missing
      </span>
    );
  }
  if (kind === "tag") {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", padding: "2px 7px", borderRadius: 4,
        fontSize: 10, fontWeight: 500, background: "var(--color-background-tertiary)",
        color: "var(--color-text-secondary)",
      }}>
        {val}
      </span>
    );
  }
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", padding: "3px 8px", borderRadius: 4,
      fontSize: 11, background: "var(--color-background-secondary)",
      color: "var(--color-text-secondary)",
      border: "0.5px solid var(--color-border-tertiary)",
    }}>
      {val}
    </span>
  );
}
