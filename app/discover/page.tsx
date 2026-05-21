"use client";

import { useState, useEffect, useRef } from "react";
import { useDb } from "@/lib/db-context";

type ScrapedItem = Record<string, unknown>;

// ── Platform presets (Bright Data Datasets API) ─────────────────
const PLATFORMS = [
  {
    id: "Meta",
    label: "Meta Ad Library",
    platform: "Meta",
    description: "Scrapes Facebook / Instagram Ad Library. Requires keyword.",
    color: "#185FA5",
  },
  {
    id: "TikTok",
    label: "TikTok Creative Center",
    platform: "TikTok",
    description: "Scrapes TikTok top ads by keyword.",
    color: "#993C1D",
  },
  {
    id: "Instagram",
    label: "Instagram",
    platform: "Instagram",
    description: "Scrapes Instagram posts by hashtag or keyword.",
    color: "#534AB7",
  },
] as const;

const COUNTRIES = ["US", "AU", "GB", "CA", "NZ", "SG"];

// ── Field mapper: Bright Data result → our schema ──────────────
function mapItem(item: ScrapedItem, platform: string): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const get = (path: string): unknown => path.split(".").reduce((o: any, k) => o?.[k], item);

  if (platform === "Meta") {
    return {
      platform: "Meta",
      referenceUrl: String(get("ad_library_url") ?? get("url") ?? ""),
      adLink: (get("video_url") ?? get("creative_video_url") ?? null) as string | null,
      brandOrCreator: String(get("page_name") ?? get("advertiser_name") ?? ""),
      primaryCategory: "Uncategorised",
      reviewStatus: "unreviewed",
      extraFields: JSON.stringify({ raw: JSON.stringify(item).slice(0, 500) }),
    };
  }
  if (platform === "TikTok") {
    return {
      platform: "TikTok",
      adLink: String(get("video_url") ?? get("download_url") ?? ""),
      referenceUrl: String(get("url") ?? get("post_url") ?? ""),
      brandOrCreator: String(get("author_name") ?? get("username") ?? ""),
      hookExample: String(get("caption") ?? get("description") ?? ""),
      primaryCategory: "Uncategorised",
      reviewStatus: "unreviewed",
    };
  }
  if (platform === "Instagram") {
    return {
      platform: "Instagram",
      adLink: String(get("video_url") ?? ""),
      referenceUrl: String(get("post_url") ?? get("url") ?? ""),
      brandOrCreator: String(get("username") ?? get("owner_username") ?? ""),
      hookExample: String(get("caption") ?? "").slice(0, 200),
      primaryCategory: "Uncategorised",
      reviewStatus: "unreviewed",
    };
  }
  return { primaryCategory: "Uncategorised", reviewStatus: "unreviewed" };
}

// ── Status badge ───────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const cls =
    s === "running" ? "badge-blue" :
    s === "ready" || s === "succeeded" ? "badge-green" :
    s === "failed" ? "badge-coral" :
    s === "canceled" || s === "aborted" ? "badge-gray" :
    "badge-gray";
  return <span className={`badge ${cls}`}>{status}</span>;
}

// ── Discover page ──────────────────────────────────────────────
export default function DiscoverPage() {
  const { activeDb, databases } = useDb();

  const [platform,   setPlatform]   = useState<string>(PLATFORMS[0].id);
  const [keyword,    setKeyword]    = useState("");
  const [maxResults, setMaxResults] = useState("20");
  const [country,    setCountry]    = useState("US");
  const [dbId,       setDbId]       = useState("");

  const [running,    setRunning]    = useState(false);
  const [runId,      setRunId]      = useState<string | null>(null);
  const [status,     setStatus]     = useState<string | null>(null);
  const [items,      setItems]      = useState<ScrapedItem[]>([]);
  const [error,      setError]      = useState<string | null>(null);
  const [saving,     setSaving]     = useState(false);
  const [saved,      setSaved]      = useState(0);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Seed dbId from activeDb
  const effectiveDb = dbId || activeDb?.id || "";

  // Stop polling on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const startScrape = async () => {
    if (!keyword.trim()) { setError("Enter a keyword first."); return; }
    setError(null); setRunning(true); setStatus("starting");
    setItems([]); setSaved(0); setRunId(null);

    try {
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, keyword, maxResults: parseInt(maxResults), country }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start run");

      const id = data.runId as string;
      setRunId(id);
      setStatus("running");

      // Poll every 5 seconds
      pollRef.current = setInterval(async () => {
        const pollRes = await fetch(`/api/discover?runId=${id}`);
        const pollData = await pollRes.json();
        setStatus(pollData.status);

        if (pollData.finished) {
          if (pollRef.current) clearInterval(pollRef.current);
          setRunning(false);
          if (pollData.succeeded) {
            setItems(pollData.items ?? []);
          } else {
            setError(`Run ${String(pollData.status).toLowerCase()}.`);
          }
        }
      }, 5000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setRunning(false);
    }
  };

  const cancelPoll = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setRunning(false);
    setStatus(null);
  };

  const saveAll = async () => {
    if (!effectiveDb || !items.length) return;
    setSaving(true);
    let count = 0;
    for (const item of items) {
      const payload = { ...mapItem(item, platform), databaseId: effectiveDb };
      await fetch("/api/ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      count++;
      setSaved(count);
    }
    setSaving(false);
  };

  const selectedPlatform = PLATFORMS.find((p) => p.id === platform) ?? PLATFORMS[0];

  // Preview columns to show (first 5 keys that have values)
  const previewCols = items.length > 0
    ? Object.keys(items[0]).filter((k) => items[0][k] && String(items[0][k]).length < 120).slice(0, 5)
    : [];

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 500 }}>Discover</h2>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 4 }}>
          Scrape ads from Meta, TikTok, and Instagram via Bright Data. Requires <code style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>BRIGHT_DATA_API_KEY</code> in your .env file.
        </p>
      </div>

      {/* ── Config card ─────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Scrape settings</div>

        {/* Platform selector */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          {PLATFORMS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPlatform(p.id)}
              className="btn btn-sm"
              style={{
                borderColor: platform === p.id ? p.color : undefined,
                background: platform === p.id ? `${p.color}18` : undefined,
                color: platform === p.id ? p.color : undefined,
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 16 }}>
          {selectedPlatform.description}
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 20px" }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--color-text-tertiary)", marginBottom: 4 }}>Keyword</div>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="e.g. weight loss peptide"
              style={{ padding: "7px 10px", fontSize: 13, borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", width: "100%" }}
              onKeyDown={(e) => e.key === "Enter" && !running && startScrape()}
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--color-text-tertiary)", marginBottom: 4 }}>Max results</div>
            <input
              value={maxResults}
              onChange={(e) => setMaxResults(e.target.value)}
              type="number" min="1" max="100"
              style={{ padding: "7px 10px", fontSize: 13, borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", width: "100%" }}
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--color-text-tertiary)", marginBottom: 4 }}>Country</div>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              style={{ padding: "7px 10px", fontSize: 13, borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", width: "100%" }}
            >
              {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button
            className="btn btn-primary"
            onClick={startScrape}
            disabled={running || !keyword.trim()}
          >
            {running ? "Running…" : "Run scrape"}
          </button>
          {running && (
            <button className="btn btn-sm btn-danger" onClick={cancelPoll}>Stop polling</button>
          )}
          {status && <StatusBadge status={status} />}
          {running && (
            <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
              Polling every 5 seconds…
            </span>
          )}
        </div>

        {error && (
          <div style={{ marginTop: 12, padding: "8px 12px", background: "#FCEBEB", borderRadius: "var(--border-radius-md)", color: "#A32D2D", fontSize: 12 }}>
            {error}
          </div>
        )}
      </div>

      {/* ── Results ─────────────────────────────────────────── */}
      {items.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>{items.length} results returned</span>

            {/* Database selector */}
            <select
              value={effectiveDb}
              onChange={(e) => setDbId(e.target.value)}
              style={{ padding: "6px 10px", fontSize: 12, borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}
            >
              <option value="">— select database —</option>
              {databases.map((db) => (
                <option key={db.id} value={db.id}>{db.name}</option>
              ))}
            </select>

            <button
              className="btn btn-primary btn-sm"
              onClick={saveAll}
              disabled={saving || !effectiveDb || saved === items.length}
            >
              {saving
                ? `Saving… ${saved}/${items.length}`
                : saved === items.length && saved > 0
                ? `✓ Saved all ${saved}`
                : `Save all ${items.length} to database`}
            </button>
            {!effectiveDb && (
              <span style={{ fontSize: 11, color: "#A32D2D" }}>Select a database first</span>
            )}
          </div>

          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    {previewCols.map((c) => <th key={c}>{c}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {items.slice(0, 25).map((item, i) => (
                    <tr key={i}>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-text-tertiary)", width: 28 }}>{i + 1}</td>
                      {previewCols.map((c) => (
                        <td key={c} style={{ maxWidth: 180 }}>
                          {item[c] != null ? String(item[c]).slice(0, 80) : <span style={{ color: "var(--color-text-tertiary)" }}>—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {items.length > 25 && (
              <div style={{ padding: "8px 14px", borderTop: "0.5px solid var(--color-border-tertiary)", fontSize: 11, color: "var(--color-text-tertiary)" }}>
                Showing 25 of {items.length} results. All {items.length} will be saved.
              </div>
            )}
          </div>
        </>
      )}

      {/* ── No token warning ────────────────────────────────── */}
      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-title">Setup</div>
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 10 }}>
          Add your Bright Data API key + dataset IDs to <code style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--color-background-secondary)", padding: "1px 4px", borderRadius: 3 }}>.env.local</code>:
        </p>
        <div style={{ background: "#111318", borderRadius: "var(--border-radius-md)", padding: "10px 14px", fontFamily: "var(--font-mono)", fontSize: 12, color: "#7EB8F7", whiteSpace: "pre", overflowX: "auto" }}>{`BRIGHT_DATA_API_KEY=your_api_key_here
BRIGHT_DATA_DATASET_TIKTOK=gd_xxxxxxxxxxxxxxxx
BRIGHT_DATA_DATASET_META=gd_xxxxxxxxxxxxxxxx
BRIGHT_DATA_DATASET_INSTAGRAM=gd_xxxxxxxxxxxxxxxx`}</div>
        <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 8 }}>
          Get your key + dataset IDs at{" "}
          <a href="https://brightdata.com/cp/datasets/marketplace" target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-accent)" }}>
            brightdata.com
          </a>
        </p>
      </div>
    </div>
  );
}
