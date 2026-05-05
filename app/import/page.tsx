"use client";

import { useState, useCallback, useRef } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { useDb } from "@/lib/db-context";

// ── Canonical target fields ────────────────────────────────────
const TARGET_FIELDS = [
  { value: "__skip__",              label: "— skip —" },
  { value: "primaryCategory",       label: "Primary category" },
  { value: "subCategory",           label: "Sub-category" },
  { value: "segment",               label: "Segment" },
  { value: "niche",                 label: "Niche" },
  { value: "platform",              label: "Platform" },
  { value: "contentType",           label: "Content type" },
  { value: "hookType",              label: "Hook type" },
  { value: "formatType",            label: "Format type" },
  { value: "ctaType",               label: "CTA type" },
  { value: "creativeAngle",         label: "Creative angle" },
  { value: "funnelStage",           label: "Funnel stage" },
  { value: "personaTarget",         label: "Persona target" },
  { value: "adLink",                label: "Ad link (YouTube)" },
  { value: "referenceUrl",          label: "Reference URL" },
  { value: "backupSearchUrl",       label: "Backup search URL" },
  { value: "urlType",               label: "URL type" },
  { value: "urlReviewed",           label: "URL reviewed" },
  { value: "assetStatus",           label: "Asset status" },
  { value: "reviewStatus",          label: "Review status" },
  { value: "brandOrCreator",        label: "Brand / creator" },
  { value: "sourceType",            label: "Source type" },
  { value: "strategicTag",          label: "Strategic tag" },
  { value: "complianceRisk",        label: "Compliance risk" },
  { value: "monetisationPath",      label: "Monetisation path" },
  { value: "priorityRank",          label: "Priority rank" },
  { value: "externalId",            label: "External ID" },
  { value: "performanceScore",      label: "Performance score" },
  { value: "overallScore",          label: "Overall score" },
  { value: "performanceProxyScore", label: "Performance proxy score" },
  { value: "hookScore",             label: "Hook score" },
  { value: "retentionScore",        label: "Retention score" },
  { value: "trustScore",            label: "Trust score" },
  { value: "conversionIntentScore", label: "Conversion intent score" },
  { value: "aiReplicabilityScore",  label: "AI replicability score" },
  { value: "nicheTransferScore",    label: "Niche transfer score" },
  { value: "hookExample",           label: "Hook example" },
  { value: "first3Seconds",         label: "First 3 seconds" },
  { value: "scriptStructure",       label: "Script structure" },
  { value: "whyItWorks",            label: "Why it works" },
  { value: "howToReplicate",        label: "How to replicate" },
  { value: "replicationInstruction",label: "Replication instruction" },
  { value: "valueForUs",            label: "Value for us" },
  { value: "useCaseForUs",          label: "Use case for us" },
  { value: "aiAvatarAdaptation",    label: "AI avatar adaptation" },
  { value: "notes",                 label: "Notes" },
  { value: "referenceTitle",        label: "Reference title" },
  { value: "referenceName",         label: "Reference name" },
  { value: "avatarOrCreativeType",  label: "Avatar / creative type" },
  { value: "brand",                 label: "Brand" },
];

// ── Auto-mapping heuristics ────────────────────────────────────
const COLUMN_ALIASES: Record<string, string> = {
  // category
  "primary_category": "primaryCategory", "primarycategory": "primaryCategory",
  "category": "primaryCategory", "ad_category": "primaryCategory",
  "sub_category": "subCategory", "subcategory": "subCategory",
  // platform
  "platform": "platform", "source_platform": "platform",
  // scores
  "performance_score": "performanceScore", "performancescore": "performanceScore",
  "overall_performance_proxy_100": "overallScore", "overallscore": "overallScore",
  "performance_proxy_score": "performanceProxyScore",
  "hook_score": "hookScore", "retention_score": "retentionScore",
  "trust_score": "trustScore",
  "conversion_intent_score": "conversionIntentScore",
  "ai_replicability_score": "aiReplicabilityScore",
  "niche_transfer_score": "nicheTransferScore",
  // links
  "ad_link": "adLink", "adlink": "adLink",
  "reference_url": "referenceUrl", "referenceurl": "referenceUrl",
  "backup_search_url": "backupSearchUrl",
  "url_type": "urlType", "urltype": "urlType",
  "url_reviewed": "urlReviewed",
  // creative
  "hook_type": "hookType", "hooktype": "hookType",
  "format_type": "formatType", "formattype": "formatType",
  "cta_type": "ctaType", "ctatype": "ctaType", "cta": "ctaType",
  "creative_angle": "creativeAngle", "creativeangle": "creativeAngle",
  "funnel_stage": "funnelStage", "funnelstage": "funnelStage",
  "persona_target": "personaTarget", "personatarget": "personaTarget",
  "content_type": "contentType", "contenttype": "contentType",
  // text fields
  "hook_example": "hookExample", "hookexample": "hookExample",
  "first_3_seconds": "first3Seconds", "first3seconds": "first3Seconds",
  "script_structure": "scriptStructure",
  "why_it_works": "whyItWorks", "whyitworks": "whyItWorks",
  "how_to_replicate": "howToReplicate", "howtoreplicate": "howToReplicate",
  "replication_instruction": "replicationInstruction",
  "value_for_us": "valueForUs", "valuefor_us": "valueForUs",
  "use_case_for_us": "useCaseForUs",
  "ai_avatar_adaptation": "aiAvatarAdaptation",
  "notes": "notes",
  // status
  "asset_status": "assetStatus", "review_status": "reviewStatus",
  "strategic_tag": "strategicTag",
  "compliance_risk": "complianceRisk",
  "brand_or_creator": "brandOrCreator", "brand": "brand",
  "source_type": "sourceType",
  "priority_rank": "priorityRank", "priorityrank": "priorityRank",
  "external_id": "externalId", "externalid": "externalId",
  "niche": "niche", "segment": "segment",
  "reference_title": "referenceTitle", "reference_name": "referenceName",
  "avatar_or_creative_type": "avatarOrCreativeType",
  "monetisation_path": "monetisationPath",
};

function autoMap(col: string): string {
  const key = col.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
  return COLUMN_ALIASES[key] || col;  // returns original col if no match (will land in extraFields)
}

// ── File parsing ───────────────────────────────────────────────
async function parseFile(file: File): Promise<{ columns: string[]; rows: Record<string, string>[] }> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".csv")) {
    return new Promise((resolve, reject) => {
      Papa.parse<Record<string, string>>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (result) => {
          const columns = result.meta.fields ?? [];
          resolve({ columns, rows: result.data });
        },
        error: reject,
      });
    });
  }

  // XLSX / XLS
  const buf = await file.arrayBuffer();
  const wb  = XLSX.read(buf, { type: "array" });
  const ws  = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });
  const columns = raw.length > 0 ? Object.keys(raw[0]) : [];
  return { columns, rows: raw.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v ?? "")]))) };
}

// ── Import page ────────────────────────────────────────────────
export default function ImportPage() {
  const { activeDb, databases } = useDb();

  const [dbId,       setDbId]       = useState<string>("");
  const [columns,    setColumns]    = useState<string[]>([]);
  const [rows,       setRows]       = useState<Record<string, string>[]>([]);
  const [mapping,    setMapping]    = useState<Record<string, string>>({});
  const [dragging,   setDragging]   = useState(false);
  const [fileName,   setFileName]   = useState<string | null>(null);
  const [importing,  setImporting]  = useState(false);
  const [result,     setResult]     = useState<{ imported: number; errors: string[] } | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Seed dbId from active database
  const effectiveDb = dbId || activeDb?.id || "";

  const handleFile = useCallback(async (file: File) => {
    setParseError(null);
    setResult(null);
    setFileName(file.name);
    try {
      const { columns: cols, rows: r } = await parseFile(file);
      setColumns(cols);
      setRows(r);
      const autoMapping: Record<string, string> = {};
      cols.forEach((c) => { autoMapping[c] = autoMap(c); });
      setMapping(autoMapping);
    } catch (e) {
      setParseError(String(e));
    }
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleImport = async () => {
    if (!effectiveDb || !rows.length) return;
    setImporting(true);
    setResult(null);
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, mapping, databaseId: effectiveDb }),
      });
      const data = await res.json();
      setResult(data);
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setColumns([]); setRows([]); setMapping({});
    setFileName(null); setResult(null); setParseError(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const PREVIEW_ROWS = 5;
  const mappedTargets = new Set(Object.values(mapping).filter((v) => v !== "__skip__"));

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 500 }}>Import / Export</h2>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 4 }}>
          Upload a CSV or Excel file to import ads, or export the current database to CSV.
        </p>
      </div>

      {/* ── Database selector ──────────────────────────────── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Target database</div>
        <select
          value={effectiveDb}
          onChange={(e) => setDbId(e.target.value)}
          style={{ maxWidth: 320, padding: "7px 10px", fontSize: 13, borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", width: "100%" }}
        >
          <option value="">— select database —</option>
          {databases.map((db) => (
            <option key={db.id} value={db.id}>{db.name}</option>
          ))}
        </select>
      </div>

      {/* ── Drop zone ───────────────────────────────────────── */}
      {!columns.length && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `1.5px dashed ${dragging ? "var(--color-accent)" : "var(--color-border-secondary)"}`,
            borderRadius: "var(--border-radius-lg)",
            background: dragging ? "#EBF3FC" : "var(--color-background-secondary)",
            padding: "48px 24px",
            textAlign: "center",
            cursor: "pointer",
            transition: "background 0.1s, border-color 0.1s",
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 12 }}>📂</div>
          <p style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)", marginBottom: 6 }}>
            Drop a CSV or Excel file here
          </p>
          <p style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
            or click to browse — .csv, .xlsx, .xls supported
          </p>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        onChange={onInputChange}
        style={{ display: "none" }}
      />

      {parseError && (
        <div style={{ marginBottom: 16, padding: "10px 14px", background: "#FCEBEB", border: "0.5px solid #A32D2D", borderRadius: "var(--border-radius-md)", color: "#A32D2D", fontSize: 13 }}>
          Parse error: {parseError}
        </div>
      )}

      {/* ── File loaded ─────────────────────────────────────── */}
      {columns.length > 0 && !result && (
        <>
          {/* File info bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, padding: "10px 14px", background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-md)" }}>
            <span style={{ fontSize: 13, color: "var(--color-text-primary)", fontWeight: 500 }}>📄 {fileName}</span>
            <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>{rows.length} rows · {columns.length} columns</span>
            <button className="btn btn-sm" style={{ marginLeft: "auto", color: "var(--color-text-tertiary)" }} onClick={reset}>✕ Clear</button>
          </div>

          {/* ── Column mapping ─────────────────────────────── */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">Column mapping</div>
            <p style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginBottom: 14 }}>
              Columns are auto-matched. Adjust any that are wrong. Unmapped columns are saved as extra fields.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "6px 20px" }}>
              {columns.map((col) => (
                <div key={col} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: "var(--color-text-secondary)", width: 130, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0 }} title={col}>
                    {col}
                  </span>
                  <span style={{ color: "var(--color-text-tertiary)", fontSize: 11 }}>→</span>
                  <select
                    value={mapping[col] ?? col}
                    onChange={(e) => setMapping((m) => ({ ...m, [col]: e.target.value }))}
                    style={{ flex: 1, padding: "4px 8px", fontSize: 12, borderRadius: "var(--border-radius-sm)", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: mapping[col] === "__skip__" ? "var(--color-text-tertiary)" : "var(--color-text-primary)" }}
                  >
                    {/* Auto-mapped to a known field */}
                    {!TARGET_FIELDS.find((f) => f.value === (mapping[col] ?? col)) && (
                      <option value={mapping[col] ?? col}>💾 {mapping[col] ?? col} (extra field)</option>
                    )}
                    {TARGET_FIELDS.map((f) => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* ── Preview table ──────────────────────────────── */}
          <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 16 }}>
            <div style={{ padding: "14px 20px 10px", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
              <div className="card-title" style={{ marginBottom: 0 }}>Preview (first {Math.min(PREVIEW_ROWS, rows.length)} rows)</div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    {columns.slice(0, 8).map((col) => (
                      <th key={col} style={{ maxWidth: 140 }}>
                        {mapping[col] === "__skip__"
                          ? <span style={{ textDecoration: "line-through", opacity: 0.4 }}>{col}</span>
                          : col}
                      </th>
                    ))}
                    {columns.length > 8 && <th>+{columns.length - 8} more</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, PREVIEW_ROWS).map((row, i) => (
                    <tr key={i}>
                      {columns.slice(0, 8).map((col) => (
                        <td key={col} style={{ maxWidth: 140, opacity: mapping[col] === "__skip__" ? 0.3 : 1 }}>
                          {row[col] || <span style={{ color: "var(--color-text-tertiary)" }}>—</span>}
                        </td>
                      ))}
                      {columns.length > 8 && <td style={{ color: "var(--color-text-tertiary)" }}>…</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Import button ──────────────────────────────── */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <button
              className="btn btn-primary"
              onClick={handleImport}
              disabled={importing || !effectiveDb}
            >
              {importing ? "Importing…" : `Import ${rows.length} rows`}
            </button>
            {!effectiveDb && (
              <span style={{ fontSize: 12, color: "#A32D2D" }}>Select a database first</span>
            )}
            <button className="btn" style={{ marginLeft: "auto" }} onClick={reset}>Start over</button>
          </div>
        </>
      )}

      {/* ── Export section ─────────────────────────────────── */}
      {!columns.length && !result && (
        <div className="card" style={{ marginTop: 24 }}>
          <div className="card-title">Export Ads</div>
          <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 6 }}>
            Download all ads from the selected database.
            Exports the 9 canonical fields: id, platform, ad_url, creative_video_url, ad_copy, hook, format, score, scraped_at.
          </p>
          {!effectiveDb && (
            <p style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginBottom: 12 }}>Select a database above first.</p>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <a
              href={effectiveDb ? `/api/export?databaseId=${effectiveDb}&format=csv` : "#"}
              className="btn btn-sm btn-primary"
              style={!effectiveDb ? { opacity: 0.4, pointerEvents: "none" } : {}}
              download
            >
              ↓ Export CSV
            </a>
            <a
              href={effectiveDb ? `/api/export?databaseId=${effectiveDb}&format=xlsx` : "#"}
              className="btn btn-sm"
              style={!effectiveDb ? { opacity: 0.4, pointerEvents: "none" } : {}}
              download
            >
              ↓ Export XLSX
            </a>
          </div>
        </div>
      )}

      {/* ── Result ─────────────────────────────────────────── */}
      {result && (
        <div style={{ marginTop: 8 }}>
          <div style={{ padding: "16px 20px", background: result.imported > 0 ? "#EAF3DE" : "#FAEEDA", border: `0.5px solid ${result.imported > 0 ? "#3B6D11" : "#854F0B"}`, borderRadius: "var(--border-radius-lg)", marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: result.imported > 0 ? "#3B6D11" : "#854F0B", marginBottom: 6 }}>
              {result.imported > 0 ? `✓ ${result.imported} ads imported successfully` : "No ads were imported"}
            </div>
            {result.errors.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: "#A32D2D", marginBottom: 4 }}>Errors ({result.errors.length}):</div>
                {result.errors.map((e, i) => (
                  <div key={i} style={{ fontSize: 11, color: "#A32D2D", fontFamily: "var(--font-mono)", marginBottom: 2 }}>{e}</div>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <a href="/ads" className="btn btn-primary btn-sm">View ads →</a>
            <button className="btn btn-sm" onClick={reset}>Import another file</button>
          </div>
        </div>
      )}
    </div>
  );
}
