"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Run = {
  id: string;
  actor: string;
  keyword: string | null;
  platform: string | null;
  status: string;
  rowCount: number | null;
  cost: number | null;
  createdAt: string;
};

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    running: "badge-blue", RUNNING: "badge-blue",
    completed: "badge-green", succeeded: "badge-green", SUCCEEDED: "badge-green",
    failed: "badge-coral", FAILED: "badge-coral",
    aborted: "badge-gray", ABORTED: "badge-gray",
  };
  return <span className={`badge ${map[status] || "badge-gray"}`}>{status}</span>;
}

export default function ScrapeRunsPage() {
  const [runs,    setRuns]    = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch("/api/scrape")
      .then((r) => r.json())
      .then((d) => setRuns(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <div>
      <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 500 }}>Scrape Runs</h2>
          <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 4 }}>
            History of Apify scraping jobs. Start new scrapes from the{" "}
            <Link href="/discover" style={{ color: "var(--color-accent)" }}>Discover</Link> page.
          </p>
        </div>
        <button className="btn btn-sm" onClick={load}>↻ Refresh</button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Run from terminal</div>
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 10 }}>
          You can also trigger scrapes from the Discover page, or use CLI scripts:
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {[
            "npx ts-node scripts/scrape.ts --actor apify/facebook-ads-scraper --keyword 'weight loss'",
            "npx ts-node scripts/scrape.ts --actor clockworks/tiktok-scraper --keyword 'peptide'",
          ].map((cmd, i) => (
            <div key={i} style={{ background: "#111318", borderRadius: "var(--border-radius-md)", padding: "8px 14px", fontFamily: "var(--font-mono)", fontSize: 11, color: "#7EB8F7", overflowX: "auto", whiteSpace: "nowrap" }}>
              {cmd}
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div className="empty-state"><p>Loading…</p></div>
        ) : runs.length === 0 ? (
          <div className="empty-state">
            <p style={{ fontSize: 14 }}>No scrape runs yet.</p>
            <p style={{ fontSize: 12, marginTop: 6 }}>
              <Link href="/discover" style={{ color: "var(--color-accent)" }}>Go to Discover →</Link>
            </p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Actor</th>
                  <th>Keyword</th>
                  <th>Platform</th>
                  <th>Status</th>
                  <th>Rows</th>
                  <th>Cost</th>
                  <th>Started</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{run.actor}</td>
                    <td style={{ color: "var(--color-text-secondary)" }}>{run.keyword || "—"}</td>
                    <td>
                      {run.platform
                        ? <span className="chip">{run.platform}</span>
                        : <span style={{ color: "var(--color-text-tertiary)" }}>—</span>
                      }
                    </td>
                    <td><StatusBadge status={run.status} /></td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{run.rowCount ?? "—"}</td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--color-text-secondary)" }}>
                      {run.cost != null ? `$${run.cost.toFixed(3)}` : "—"}
                    </td>
                    <td style={{ fontSize: 11, color: "var(--color-text-tertiary)", whiteSpace: "nowrap" }}>
                      {new Date(run.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
