"use client";

import { useState, useEffect, useRef } from "react";
import { useDb } from "@/lib/db-context";

type ScrapedItem = Record<string, unknown>;

// ── Actor presets ──────────────────────────────────────────────
const ACTORS = [
  {
    id: "apify/facebook-ads-scraper",
    label: "Meta Ad Library",
    platform: "Meta",
    description: "Scrapes Facebook / Instagram Ad Library. Requires keyword.",
    color: "#185FA5",
  },
  {
    id: "clockworks/tiktok-scraper",
    label: "TikTok Creative Center",
    platform: "TikTok",
    description: "Scrapes TikTok top ads by keyword.",
    color: "#993C1D",
  },
  {
    id: "apify/instagram-scraper",
    label: "Instagram",
    platform: "Instagram",
    description: "Scrapes Instagram posts by hashtag or keyword.",
    color: "#534AB7",
  },
];

const COUNTRIES = ["US", "AU", "GB", "CA", "NZ", "SG"];

// ── Field mapper: Apify result → our schema ────────────────────
function mapItem(item: ScrapedItem, actor: string): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const get = (path: string): unknown => path.split(".").reduce((o: any, k) => o?.[k], item);

  if (actor.includes("facebook")) {
    const snap = get("snapshot") as Record<string, unknown> | undefined;
    const vids = (snap?.videos as Array<Record<string, unknown>>) ?? [];
    return {
      platform: "Meta",
      referenceUrl: String(get("adArchiveID") ? `https://www.facebook.com/ads/library/?id=${get("adArchiveID")}` : get("url") ?? ""),
      adLink: (vids[0]?.video_hd_url || vids[0]?.video_sd_url || null) as string | null,
      brandOrCreator: String(get("pageName") ?? ""),
      primaryCategory: "Uncategorised",
      reviewStatus: "unreviewed",
      extraFields: JSON.stringify({ raw: JSON.stringify(item).slice(0, 500) }),
    };
  }
  if (actor.includes("tiktok")) {
    const meta = get("videoMeta") as Record<string, unknown> | undefined;
    const author = get("authorMeta") as Record<string, unknown> | undefined;
    return {
      platform: "TikTok",
      adLink: String(meta?.downloadAddr || get("videoUrl") || ""),
      referenceUrl: String(get("webVideoUrl") ?? ""),
      brandOrCreator: String(author?.name || get("author") || ""),
      hookExample: String(get("text") ?? ""),
      primaryCategory: "Uncategorised",
      reviewStatus: "unreviewed",
    };
  }
  if (actor.includes("instagram")) {
    return {
      platform: "Instagram",
      adLink: String(get("videoUrl") ?? ""),
      referenceUrl: String(get("url") ?? ""),
      brandOrCreator: String(get("ownerUsername") ?? ""),
      hookExample: String(get("caption") ?? "").slice(0, 200),
      primaryCategory: "Uncategorised",
      reviewStatus: "unreviewed",
    };
  }
  return { primaryCategory: "Uncategorised", reviewStatus: "unreviewed" };
}

// ── Status badge ───────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    RUNNING: "badge-blue",
    SUCCEEDED: "badge-green",
    FAILED: "badge-coral",
    ABORTED: "badge-gray",
  };
  return <span className={`badge ${map[status] || "badge-gray"}`}>{status}</span>;
}

// ── Discover page ──────────────────────────────────────────────
export default function DiscoverPage() {
  const { activeDb, databases } = useDb();

  const [actor,      setActor]      = useState(ACTORS[0].id);
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
    setError(null); setRunning(true); setStatus("STARTING");
    setItems([]); setSaved(0); setRunId(null);

    try {
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actor, keyword, maxResults: parseInt(maxResults), country }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start run");

      const id = data.runId as string;
      setRunId(id);
      setStatus("RUNNING");

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
            setError(`Run ${pollData.status.toLowerCase()}.`);
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
      const payload = { ...mapItem(item, actor), databaseId: effectiveDb };
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

  const selectedActor = ACTORS.find((a) => a.id === actor) ?? ACTORS[0];

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
          Scrape ads from Meta, TikTok, and Instagram via Apify. Requires <code style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>APIFY_TOKEN</code> in your .env file.
        </p>
      </div>

      {/* ── Config card ─────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Scrape settings</div>

        {/* Actor selector */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          {ACTORS.map((a) => (
            <button
              key={a.id}
              onClick={() => setActor(a.id)}
              className="btn btn-sm"
              style={{
                borderColor: actor === a.id ? a.color : undefined,
                background: actor === a.id ? `${a.color}18` : undefined,
                color: actor === a.id ? a.color : undefined,
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 16 }}>
          {selectedActor.description}
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
          Add your Apify token to <code style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--color-background-secondary)", padding: "1px 4px", borderRadius: 3 }}>.env.local</code>:
        </p>
        <div style={{ background: "#111318", borderRadius: "var(--border-radius-md)", padding: "10px 14px", fontFamily: "var(--font-mono)", fontSize: 12, color: "#7EB8F7" }}>
          APIFY_TOKEN=your_apify_token_here
        </div>
        <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 8 }}>
          Get your token at{" "}
          <a href="https://console.apify.com/account/integrations" target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-accent)" }}>
            console.apify.com
          </a>
        </p>
      </div>
    </div>
  );
}
