"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useDb } from "@/lib/db-context";

type JobEntry = {
  id:           string;
  kind:         "scrape" | "import";
  source:       string;
  status:       string;
  databaseId?:  string;
  databaseName?: string;
  keyword?:     string;
  actor?:       string;
  imported?:    number;
  skipped?:     number;
  failed?:      number;
  deduped?:     number;
  totalRows?:   number;
  rowCount?:    number;
  cost?:        number;
  errors?:      string[];
  createdAt:    string;
  completedAt?: string;
};

type KindFilter = "all" | "scrape" | "import";

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const cls =
    s === "running" || s === "started"               ? "badge-blue"  :
    s === "completed" || s === "succeeded" || s === "ok" || s === "done" ? "badge-green" :
    s === "failed" || s === "error"                  ? "badge-coral" :
    s === "aborted" || s === "cancelled"             ? "badge-gray"  :
    s === "partial"                                  ? "badge-amber" :
                                                       "badge-gray";
  return <span className={`badge ${cls}`}>{status}</span>;
}

function KindBadge({ kind }: { kind: JobEntry["kind"] }) {
  return (
    <span className={`badge ${kind === "scrape" ? "badge-purple" : "badge-blue"}`}>
      {kind}
    </span>
  );
}

function num(n: number | undefined) {
  return n == null ? "—" : n.toLocaleString();
}

export default function JobsPage() {
  const { activeDb } = useDb();
  const [jobs,    setJobs]    = useState<JobEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [kind,    setKind]    = useState<KindFilter>("all");
  const [scope,   setScope]   = useState<"active" | "all">("active");
  const [errorsFor, setErrorsFor] = useState<JobEntry | null>(null);

  const load = () => {
    setLoading(true);
    const qs = scope === "active" && activeDb?.id ? `?databaseId=${activeDb.id}` : "";
    fetch(`/api/jobs${qs}`)
      .then((r) => r.json())
      .then((d) => setJobs(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [scope, activeDb?.id]);

  const filtered = useMemo(
    () => kind === "all" ? jobs : jobs.filter((j) => j.kind === kind),
    [jobs, kind]
  );

  const counts = useMemo(() => {
    const t: Record<string, number> = { all: jobs.length, scrape: 0, import: 0 };
    for (const j of jobs) t[j.kind] = (t[j.kind] ?? 0) + 1;
    return t;
  }, [jobs]);

  const summary = useMemo(() => {
    let imported = 0, skipped = 0, failed = 0, deduped = 0, scraped = 0;
    for (const j of jobs) {
      imported += j.imported ?? 0;
      skipped  += j.skipped  ?? 0;
      failed   += j.failed   ?? 0;
      deduped  += j.deduped  ?? 0;
      scraped  += j.rowCount ?? 0;
    }
    return { imported, skipped, failed, deduped, scraped };
  }, [jobs]);

  return (
    <div>
      {/* ── Header ────────────────────────────────────────────── */}
      <div style={{ marginBottom: 16, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em" }}>Job Log</h2>
          <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 3 }}>
            Unified history of scrape runs and bulk imports
            {scope === "active" && activeDb ? <> · scoped to <strong>{activeDb.name}</strong></> : <> · all databases</>}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-sm" onClick={() => setScope(scope === "active" ? "all" : "active")}>
            {scope === "active" ? "Show all DBs" : "Scope to active"}
          </button>
          <button className="btn btn-sm" onClick={load}>↻ Refresh</button>
        </div>
      </div>

      {/* ── Summary strip ─────────────────────────────────────── */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
        gap: 8, marginBottom: 12,
      }}>
        {[
          { label: "Imported", value: summary.imported, tone: "var(--color-text-primary)" },
          { label: "Deduped",  value: summary.deduped,  tone: "var(--color-text-secondary)" },
          { label: "Skipped",  value: summary.skipped,  tone: "var(--color-text-secondary)" },
          { label: "Failed",   value: summary.failed,   tone: summary.failed ? "#BF4A20" : "var(--color-text-tertiary)" },
          { label: "Scraped",  value: summary.scraped,  tone: "var(--color-text-primary)" },
        ].map((s) => (
          <div key={s.label} className="card" style={{ padding: "10px 14px" }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--color-text-tertiary)" }}>
              {s.label}
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, marginTop: 2, fontFamily: "var(--font-mono)", color: s.tone }}>
              {s.value.toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      {/* ── Kind filter chips ─────────────────────────────────── */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {([
          ["all",    "All"],
          ["import", "Imports"],
          ["scrape", "Scrapes"],
        ] as [KindFilter, string][]).map(([k, label]) => {
          const active = kind === k;
          return (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`btn btn-sm`}
              style={{
                background: active ? "var(--color-accent-light)" : undefined,
                color:      active ? "var(--color-accent-dark)"  : undefined,
                borderColor: active ? "var(--color-accent)"      : undefined,
              }}
            >
              {label} <span style={{ opacity: 0.6, marginLeft: 4 }}>{counts[k] ?? 0}</span>
            </button>
          );
        })}
      </div>

      {/* ── Table ─────────────────────────────────────────────── */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div className="empty-state"><p>Loading…</p></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <p style={{ fontSize: 14 }}>No jobs in this view.</p>
            <p style={{ fontSize: 12, marginTop: 6 }}>
              <Link href="/discover" style={{ color: "var(--color-accent)" }}>Run a scrape</Link>
              {" · "}
              <Link href="/import" style={{ color: "var(--color-accent)" }}>Import a CSV</Link>
            </p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 70 }}>Kind</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th>Database</th>
                  <th>Keyword</th>
                  <th style={{ textAlign: "right" }}>Imported</th>
                  <th style={{ textAlign: "right" }}>Deduped</th>
                  <th style={{ textAlign: "right" }}>Failed</th>
                  <th style={{ textAlign: "right" }}>Total</th>
                  <th>Started</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((j) => {
                  const total = j.kind === "import"
                    ? (j.totalRows ?? ((j.imported ?? 0) + (j.skipped ?? 0) + (j.deduped ?? 0) + (j.failed ?? 0)))
                    : j.rowCount;
                  return (
                    <tr key={`${j.kind}-${j.id}`}>
                      <td><KindBadge kind={j.kind} /></td>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
                        {j.source}{j.actor ? <> · <span style={{ color: "var(--color-text-tertiary)" }}>{j.actor}</span></> : null}
                      </td>
                      <td><StatusBadge status={j.status} /></td>
                      <td style={{ color: "var(--color-text-secondary)" }}>{j.databaseName ?? "—"}</td>
                      <td style={{ color: "var(--color-text-secondary)" }}>{j.keyword || "—"}</td>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: 12, textAlign: "right" }}>{num(j.imported)}</td>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: 12, textAlign: "right", color: "var(--color-text-tertiary)" }}>{num(j.deduped)}</td>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: 12, textAlign: "right", color: (j.failed ?? 0) > 0 ? "#BF4A20" : "var(--color-text-tertiary)" }}>{num(j.failed)}</td>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: 12, textAlign: "right" }}>{num(total)}</td>
                      <td style={{ fontSize: 11, color: "var(--color-text-tertiary)", whiteSpace: "nowrap" }}>
                        {new Date(j.createdAt).toLocaleString()}
                      </td>
                      <td>
                        {j.errors && j.errors.length > 0 && (
                          <button className="btn btn-sm" onClick={() => setErrorsFor(j)}>
                            {j.errors.length} err
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Error drawer ──────────────────────────────────────── */}
      {errorsFor && (
        <div
          onClick={() => setErrorsFor(null)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.32)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 200,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="card"
            style={{ width: "min(640px, 92vw)", maxHeight: "80vh", overflow: "auto" }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div>
                <div className="card-title" style={{ marginBottom: 2 }}>Job errors</div>
                <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", fontFamily: "var(--font-mono)" }}>
                  {errorsFor.kind} · {errorsFor.id.slice(0, 8)}…
                </div>
              </div>
              <button className="btn btn-sm" onClick={() => setErrorsFor(null)}>Close</button>
            </div>
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
              {errorsFor.errors!.map((e, i) => (
                <li key={i} style={{ fontFamily: "var(--font-mono)", marginBottom: 4 }}>{e}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
