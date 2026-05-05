"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useDb } from "@/lib/db-context";

// ── Types ──────────────────────────────────────────────────────
type ScrapedItem = Record<string, unknown>;

// ── Actor config ───────────────────────────────────────────────
const ACTORS = [
  {
    id: "apify/facebook-ads-scraper",
    label: "Meta Ad Library",
    platform: "Meta",
    description: "Scrapes the Facebook Ad Library by keyword. Returns active ads with page info.",
    color: "#185FA5",
  },
  {
    id: "clockworks/tiktok-scraper",
    label: "TikTok",
    platform: "TikTok",
    description: "Scrapes TikTok posts by hashtag. Returns organic videos.",
    color: "#993C1D",
  },
  {
    id: "apify/instagram-scraper",
    label: "Instagram",
    platform: "Instagram",
    description: "Scrapes Instagram posts by hashtag. Limited to ~10 per run on free tier.",
    color: "#534AB7",
  },
];

const COUNTRIES = ["US", "AU", "GB", "CA", "NZ", "SG", "IN", "DE", "FR"];

// ── Claude Chrome prompt builder ──────────────────────────────
function buildChromePrompt(fields: {
  brief: string;
  niche: string;
  brands: string;
  country: string;
  platforms: string;
  maxAds: string;
  notes: string;
}): string {
  const v = (s: string, fallback = "(not specified)") => s.trim() || fallback;

  // Combine niche + brands into a single search target line
  const searchTarget = [fields.niche.trim(), fields.brands.trim()].filter(Boolean).join(" — brands: ") || "(not specified)";

  // Combine brief + notes into extra context
  const contextParts = [fields.brief.trim(), fields.notes.trim()].filter(Boolean);
  const extraContext = contextParts.join(" | ") || "(none)";

  return `Use Chrome to collect public ad/video data.

Source to search:
${v(fields.platforms)}

Search target:
${searchTarget}

Country/region:
${v(fields.country)}

Collect up to:
${v(fields.maxAds, "20")} ads/videos

Extra context:
${extraContext}

Only collect factual visible information.
Do not analyse the videos.
Do not score them.
Do not identify hooks, angles, emotional triggers, or why they worked.
Do not infer missing fields.
Do not invent links.
Do not log into private accounts or bypass access controls.

Return valid JSON array only.

For each item, include factual fields where visible:

platform
source_type
paid_or_organic
brand_or_creator
advertiser_name
creator_handle
source_url
ad_library_url
creative_video_url
creative_image_url
thumbnail_url
destination_url
landing_page_url
caption_or_ad_copy
headline
description
cta
hashtags
audio_or_sound
posted_date
first_seen
last_seen
ad_status
country_or_region
language
video_length_seconds
views
likes
comments
shares
saves
impressions
reach
spend
currency
engagement_rate_if_visible
follower_count_if_visible
profile_url
landing_page_title
visible_offer
visible_price
discount_code
comments_sample_if_visible

Use blank strings for unavailable fields.
Every row must include at least one real usable URL: source_url, ad_library_url, creative_video_url, or creative_image_url.
Preserve URLs exactly.`;
}

// ── Recommendation engine ─────────────────────────────────────

type AdRow = Record<string, unknown>;

interface DbStats {
  total: number;
  organicCount: number;
  paidCount: number;
  withDestUrl: number;
  withProofType: number;
  withObjHandling: number;
  withAiAvatarFormat: number;
  untaggedCount: number;
  distinctHookTypes: number;
  distinctAngles: number;
  distinctPlatforms: number;
}

function computeStats(ads: AdRow[]): DbStats {
  const s = (a: AdRow, k: string) => String(a[k] ?? "").toLowerCase().trim();
  const has = (a: AdRow, k: string) => !!String(a[k] ?? "").trim();

  const aiAvatarFormats = new Set(["talking_head","ugc_selfie","ai_avatar","talking head","ugc selfie","ai avatar"]);

  return {
    total:              ads.length,
    organicCount:       ads.filter(a => s(a,"organicOrPaid").includes("organic")).length,
    paidCount:          ads.filter(a => s(a,"organicOrPaid").includes("paid")).length,
    withDestUrl:        ads.filter(a => has(a,"destinationUrl")).length,
    withProofType:      ads.filter(a => has(a,"proofType")).length,
    withObjHandling:    ads.filter(a => s(a,"creativeAngle").includes("objection")).length,
    withAiAvatarFormat: ads.filter(a => aiAvatarFormats.has(s(a,"formatType"))).length,
    untaggedCount:      ads.filter(a => !s(a,"taggingStatus") || s(a,"taggingStatus") === "untagged").length,
    distinctHookTypes:  new Set(ads.map(a => s(a,"hookType")).filter(Boolean)).size,
    distinctAngles:     new Set(ads.map(a => s(a,"creativeAngle")).filter(Boolean)).size,
    distinctPlatforms:  new Set(ads.map(a => s(a,"platform")).filter(Boolean)).size,
  };
}

interface Recommendation {
  id: string;
  title: string;
  reason: string;
  brief: string;
  platforms: string;
  maxAds: string;
  notes: string;
  score: number;
}

interface RecTemplate {
  id: string;
  title: string;
  reason: string;
  briefTemplate: string; // [niche] is replaced at render time
  platforms: string;
  maxAds: string;
  notes: string;
  score: (s: DbStats) => number;
}

const REC_TEMPLATES: RecTemplate[] = [
  {
    id: "competitor",
    title: "Competitor Landscape Scan",
    reason: "Essential baseline — find what's working in your niche before creating ads.",
    briefTemplate: "Find public ads and organic short-form videos from direct competitors and adjacent brands in [niche]. Prioritise ads with clear offers, strong hooks, repeated visual formats, and patterns useful for AI-generated ads.",
    platforms: "Meta Ad Library, TikTok, Instagram",
    maxAds: "20",
    notes: "",
    score: (s) => (s.total < 30 ? 10 : 4),
  },
  {
    id: "hooks",
    title: "Winning Hook Scan",
    reason: "Hooks are the highest-leverage creative element — low variety in your library is a gap.",
    briefTemplate: "Find short-form ads/videos in [niche] with strong opening hooks. Prioritise curiosity gaps, pain-point callouts, transformation claims, controversial takes, mistake warnings, and before-after openings.",
    platforms: "TikTok, Instagram Reels, Meta Ad Library",
    maxAds: "20",
    notes: "Focus on the first 3 seconds of each video.",
    score: (s) => {
      let n = 0;
      if (s.distinctHookTypes < 4) n += 8;
      if (s.untaggedCount > s.total * 0.6) n += 4;
      if (s.total < 15) n += 3;
      return n;
    },
  },
  {
    id: "organic",
    title: "Organic Viral Pattern Scan",
    reason: "Organic content reveals what resonates with real audiences before you spend on ads.",
    briefTemplate: "Find organic TikTok/Reels videos in [niche] designed for engagement, shares, saves, or debate. Prioritise relatable truths, useful explanations, controversy, transformation stories, and comment-worthy claims.",
    platforms: "TikTok, Instagram Reels, YouTube Shorts",
    maxAds: "20",
    notes: "Organic posts only — not paid ads.",
    score: (s) => {
      let n = 0;
      if (s.organicCount < 5) n += 9;
      if (s.organicCount < s.paidCount * 0.5) n += 4;
      return n;
    },
  },
  {
    id: "paid",
    title: "Paid Conversion Ad Scan",
    reason: "Paid ads show proven offers — library is light on direct-response examples.",
    briefTemplate: "Find paid ads in [niche] with strong conversion intent. Prioritise clear offers, CTAs, proof mechanisms, testimonials, demonstrations, landing-page links, and objection-handling angles.",
    platforms: "Meta Ad Library, Google Ads Transparency Center, TikTok Creative Center",
    maxAds: "15",
    notes: "Active/running ads preferred.",
    score: (s) => {
      let n = 0;
      if (s.paidCount < 5) n += 9;
      if (s.paidCount < s.organicCount * 0.5) n += 4;
      return n;
    },
  },
  {
    id: "proof",
    title: "Proof Mechanism Scan",
    reason: "Low proof-type coverage — results, testimonials, and demos are high-converting elements.",
    briefTemplate: "Find ads/videos in [niche] using strong proof mechanisms: before-after, testimonials, expert authority, numbers/results, live demos, side-by-side comparisons, reviews, or comments on screen.",
    platforms: "Meta Ad Library, TikTok, YouTube",
    maxAds: "15",
    notes: "Note the specific proof type used by each ad.",
    score: (s) => (s.total > 5 && s.withProofType < s.total * 0.3 ? 8 : 2),
  },
  {
    id: "objection",
    title: "Objection Handling Scan",
    reason: "No objection-handling examples in library — a critical gap for conversion-focused ads.",
    briefTemplate: "Find ads/videos in [niche] that handle objections, doubts, safety concerns, price concerns, scepticism, or comparison against alternatives. Prioritise videos that reduce friction before the CTA.",
    platforms: "Meta Ad Library, TikTok, YouTube",
    maxAds: "15",
    notes: "",
    score: (s) => (s.total > 5 && s.withObjHandling === 0 ? 8 : 1),
  },
  {
    id: "ai_avatar",
    title: "AI Avatar Reference Scan",
    reason: "Few AI-replicable formats — talking-head and UGC-style ads are easiest to recreate with AI.",
    briefTemplate: "Find creator-led, talking-head, UGC selfie, and AI-avatar-style ads/videos in [niche]. Prioritise formats recreatable cheaply using AI avatars, synthetic voice, stock footage, or simple editing.",
    platforms: "TikTok, Instagram Reels, Meta Ad Library",
    maxAds: "15",
    notes: "Flag whether each ad could be remade with an AI avatar.",
    score: (s) => (s.total > 5 && s.withAiAvatarFormat < 3 ? 7 : 2),
  },
  {
    id: "landing_page",
    title: "Landing Page Funnel Scan",
    reason: "Few destination URLs captured — missing the full funnel picture.",
    briefTemplate: "Find public ads in [niche] that link to landing pages. Collect the ad plus the destination URL and notes on the offer, CTA, lead magnet, pricing, funnel structure, and trust signals.",
    platforms: "Meta Ad Library, Google Ads Transparency Center",
    maxAds: "15",
    notes: "Always record the destination_url and any offer details.",
    score: (s) => (s.total > 5 && s.withDestUrl < s.total * 0.3 ? 7 : 2),
  },
  {
    id: "adjacent",
    title: "Adjacent Market Inspiration Scan",
    reason: "Broaden creative reference pool — adjacent markets often have transferable patterns.",
    briefTemplate: "Find high-performing ads/videos from adjacent markets using similar psychology to [niche], such as fitness transformation, skincare, supplements, biohacking, aesthetic medicine, or hair loss. Prioritise transferable hooks and formats.",
    platforms: "TikTok, Meta Ad Library, Instagram",
    maxAds: "15",
    notes: "Note what makes each ad transferable to your niche.",
    score: (s) => {
      let n = 0;
      if (s.total < 30) n += 5;
      if (s.distinctPlatforms < 2) n += 3;
      if (s.distinctAngles < 3) n += 2;
      return n;
    },
  },
  {
    id: "gap",
    title: "Weakness Gap Scan",
    reason: "Systematically fill the most underrepresented areas in your library.",
    briefTemplate: "Find ads/videos that fill gaps in the current ad database for [niche]. Prioritise underrepresented platforms, hook types, creative angles, formats, emotions, proof types, and examples useful for AI-generated ad creation.",
    platforms: "Meta Ad Library, TikTok, Instagram, YouTube",
    maxAds: "20",
    notes: "",
    score: () => 3, // always present as fallback
  },
];

function getRankedRecommendations(stats: DbStats, niche: string): Recommendation[] {
  const nicheLabel = niche.trim() || "your target niche";
  const fill = (t: string) => t.replace(/\[niche\]/g, nicheLabel);

  return REC_TEMPLATES
    .map(t => ({
      id: t.id,
      title: t.title,
      reason: t.reason,
      brief: fill(t.briefTemplate),
      platforms: t.platforms,
      maxAds: t.maxAds,
      notes: t.notes,
      score: t.score(stats),
    }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

// ── UI helpers ─────────────────────────────────────────────────
function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 600, textTransform: "uppercase",
      letterSpacing: "0.07em", color: "var(--color-text-tertiary)", marginBottom: 4,
    }}>
      {children}
    </div>
  );
}

function Field({ children }: { children: React.ReactNode }) {
  return <div style={{ marginBottom: 14 }}>{children}</div>;
}

function inputStyle(): React.CSSProperties {
  return {
    padding: "7px 10px", fontSize: 13, width: "100%",
    borderRadius: "var(--border-radius-md)",
    border: "0.5px solid var(--color-border-tertiary)",
    background: "var(--color-background-primary)",
    color: "var(--color-text-primary)",
  };
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div style={{
      marginTop: 12, padding: "9px 12px",
      background: "#FCEBEB", borderRadius: "var(--border-radius-md)",
      color: "#A32D2D", fontSize: 12, lineHeight: 1.5,
    }}>
      {msg}
    </div>
  );
}

function SuccessBox({ msg }: { msg: string }) {
  return (
    <div style={{
      marginTop: 12, padding: "9px 12px",
      background: "#F0FDF4", borderRadius: "var(--border-radius-md)",
      color: "#166534", fontSize: 12, lineHeight: 1.5,
    }}>
      {msg}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    RUNNING:   ["#1D64D8", "#EEF4FF"],
    SUCCEEDED: ["#166534", "#DCFCE7"],
    FAILED:    ["#A32D2D", "#FCEBEB"],
    ABORTED:   ["#555", "#F3F4F6"],
    STARTING:  ["#92400E", "#FEF3C7"],
  };
  const [color, bg] = map[status] ?? ["#555", "#F3F4F6"];
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: "3px 9px",
      borderRadius: 12, color, background: bg,
    }}>
      {status}
    </span>
  );
}

function DbSelector({
  value, onChange, databases,
}: {
  value: string;
  onChange: (id: string) => void;
  databases: { id: string; name: string }[];
}) {
  return (
    <Field>
      <Label>Save to database</Label>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle()}>
        <option value="">— select database —</option>
        {databases.map((db) => (
          <option key={db.id} value={db.id}>{db.name}</option>
        ))}
      </select>
    </Field>
  );
}

// ── Section A: Apify Scrape ────────────────────────────────────
function ApifyScrapeSection({ activeDbId, databases }: {
  activeDbId: string;
  databases: { id: string; name: string }[];
}) {
  const [actor,      setActor]      = useState(ACTORS[0].id);
  const [keyword,    setKeyword]    = useState("");
  const [maxResults, setMaxResults] = useState("20");
  const [country,    setCountry]    = useState("US");
  const [dbId,       setDbId]       = useState(activeDbId);

  const [running,    setRunning]    = useState(false);
  const [status,     setStatus]     = useState<string | null>(null);
  const [error,      setError]      = useState<string | null>(null);
  const [result,     setResult]     = useState<{ imported: number; skipped: number } | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep dbId in sync when activeDb changes (unless user picked manually)
  useEffect(() => {
    if (!dbId && activeDbId) setDbId(activeDbId);
  }, [activeDbId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const selectedActor = ACTORS.find((a) => a.id === actor) ?? ACTORS[0];

  const startScrape = async () => {
    if (!keyword.trim()) { setError("Enter a keyword first."); return; }
    if (!dbId)           { setError("Select a target database first."); return; }

    setError(null); setResult(null);
    setRunning(true); setStatus("STARTING");

    try {
      // 1. Start the Apify run
      const startRes = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actor,
          keyword: keyword.trim(),
          maxResults: Math.min(Math.max(1, parseInt(maxResults) || 20), 100),
          country,
        }),
      });
      const startData = await startRes.json() as { runId?: string; error?: string };
      if (!startRes.ok) throw new Error(startData.error || `Apify start failed (${startRes.status})`);

      const runId = startData.runId!;
      setStatus("RUNNING");

      // 2. Poll until finished
      await new Promise<void>((resolve, reject) => {
        pollRef.current = setInterval(async () => {
          try {
            const pollRes = await fetch(`/api/discover?runId=${runId}`);
            const pollData = await pollRes.json() as {
              status: string;
              finished: boolean;
              succeeded: boolean;
              items: ScrapedItem[];
              itemCount: number;
            };

            setStatus(pollData.status);

            if (!pollData.finished) return;
            clearInterval(pollRef.current!);

            if (!pollData.succeeded) {
              reject(new Error(`Apify run ${pollData.status.toLowerCase()}.`));
              return;
            }

            const items: ScrapedItem[] = pollData.items ?? [];
            if (items.length === 0) {
              reject(new Error("Apify run succeeded but returned 0 results. Try a different keyword or platform."));
              return;
            }

            // 3. Bulk-save via normalizer
            const saveRes = await fetch("/api/ads/bulk", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                databaseId: dbId,
                items,
                source: "apify",
                actor,
                keyword: keyword.trim(),
              }),
            });
            const saveData = await saveRes.json() as { imported: number; skipped: number; errors: string[] };

            if (!saveRes.ok) {
              reject(new Error((saveData as { error?: string }).error || "Save failed"));
              return;
            }
            if (saveData.imported === 0) {
              reject(new Error(
                `Apify returned ${items.length} items but all were skipped (missing valid URL). ` +
                (saveData.errors.length ? `Errors: ${saveData.errors.slice(0, 2).join("; ")}` : "")
              ));
              return;
            }

            setResult({ imported: saveData.imported, skipped: saveData.skipped });
            resolve();
          } catch (e) {
            clearInterval(pollRef.current!);
            reject(e);
          }
        }, 5000);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
      setStatus(null);
    }
  };

  const stop = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setRunning(false);
    setStatus(null);
  };

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-title" style={{ marginBottom: 14 }}>
        Apify Live Scrape
      </div>

      {/* Actor pills */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {ACTORS.map((a) => (
          <button
            key={a.id}
            onClick={() => setActor(a.id)}
            className="btn btn-sm"
            style={{
              borderColor: actor === a.id ? a.color : undefined,
              background:  actor === a.id ? `${a.color}18` : undefined,
              color:       actor === a.id ? a.color : undefined,
              fontWeight:  actor === a.id ? 600 : undefined,
            }}
          >
            {a.label}
          </button>
        ))}
      </div>
      <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 16, lineHeight: 1.5 }}>
        {selectedActor.description}
      </p>

      {/* Inputs */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "0 16px" }}>
        <Field>
          <Label>Keyword / hashtag</Label>
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="e.g. weight loss"
            style={inputStyle()}
            onKeyDown={(e) => e.key === "Enter" && !running && startScrape()}
          />
        </Field>
        <Field>
          <Label>Max results</Label>
          <input
            type="number" min="1" max="100"
            value={maxResults}
            onChange={(e) => setMaxResults(e.target.value)}
            style={inputStyle()}
          />
        </Field>
        <Field>
          <Label>Country</Label>
          <select value={country} onChange={(e) => setCountry(e.target.value)} style={inputStyle()}>
            {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
      </div>

      <DbSelector value={dbId} onChange={setDbId} databases={databases} />

      {/* Actions */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button
          className="btn btn-primary"
          onClick={startScrape}
          disabled={running || !keyword.trim() || !dbId}
        >
          {running ? "Running…" : "Run Apify Scrape"}
        </button>
        {running && (
          <button className="btn btn-sm" onClick={stop} style={{ color: "#A32D2D", borderColor: "#FECACA" }}>
            Stop
          </button>
        )}
        {status && <StatusPill status={status} />}
        {running && (
          <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>Polling every 5 s…</span>
        )}
      </div>

      {error  && <ErrorBox msg={error} />}
      {result && (
        <SuccessBox msg={
          `✓ Imported ${result.imported} ad${result.imported !== 1 ? "s" : ""} ` +
          (result.skipped ? `(${result.skipped} skipped — missing URL)` : "") +
          ". Now visible in Library."
        } />
      )}
    </div>
  );
}

// ── Section B: Claude Chrome Import ───────────────────────────
function ClaudeChromeSection({ activeDbId, databases }: {
  activeDbId: string;
  databases: { id: string; name: string }[];
}) {
  const [dbId,        setDbId]        = useState(activeDbId);
  const [json,        setJson]        = useState("");
  const [importing,   setImporting]   = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [result,      setResult]      = useState<{ imported: number; skipped: number } | null>(null);

  // Prompt generator state
  const [brief,      setBrief]      = useState("");
  const [niche,      setNiche]      = useState("");
  const [brands,     setBrands]     = useState("");
  const [country,    setCountry]    = useState("");
  const [platforms,  setPlatforms]  = useState("");
  const [maxAds,     setMaxAds]     = useState("20");
  const [notes,      setNotes]      = useState("");
  const [generated,  setGenerated]  = useState("");
  const [copied,     setCopied]     = useState(false);

  // DB stats for recommendations
  const [dbAds, setDbAds] = useState<AdRow[]>([]);

  useEffect(() => {
    if (!dbId && activeDbId) setDbId(activeDbId);
  }, [activeDbId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch ads for the active DB whenever it changes (for recommendation scoring)
  useEffect(() => {
    const id = dbId || activeDbId;
    if (!id) { setDbAds([]); return; }
    fetch(`/api/ads?databaseId=${id}`)
      .then(r => r.json())
      .then(d => setDbAds(d.ads ?? []))
      .catch(() => setDbAds([]));
  }, [dbId, activeDbId]);

  const stats = useMemo(() => computeStats(dbAds), [dbAds]);
  const recommendations = useMemo(() => getRankedRecommendations(stats, niche), [stats, niche]);

  const applyRec = (rec: Recommendation) => {
    setBrief(rec.brief);
    setPlatforms(rec.platforms);
    setMaxAds(rec.maxAds);
    if (rec.notes) setNotes(rec.notes);
    setGenerated(""); // clear previous output so user sees they need to regenerate
  };

  const generatePrompt = () => {
    if (!niche.trim() && !brief.trim()) return;
    setGenerated(buildChromePrompt({ brief, niche, brands, country, platforms, maxAds, notes }));
  };

  const copyGenerated = () => {
    navigator.clipboard.writeText(generated).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const doImport = async () => {
    if (!dbId)       { setError("Select a target database first."); return; }
    if (!json.trim()) { setError("Paste a JSON array first."); return; }

    setError(null); setResult(null); setImporting(true);

    let parsed: unknown;
    try {
      parsed = JSON.parse(json.trim());
    } catch (e) {
      setError(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
      setImporting(false);
      return;
    }

    if (!Array.isArray(parsed)) {
      setError("Expected a JSON array (starting with [). Wrap single objects in [].");
      setImporting(false);
      return;
    }

    if (parsed.length === 0) {
      setError("The array is empty — nothing to import.");
      setImporting(false);
      return;
    }

    try {
      const res = await fetch("/api/ads/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          databaseId: dbId,
          items: parsed,
          source: "claude_chrome",
        }),
      });
      const data = await res.json() as { imported: number; skipped: number; errors: string[]; error?: string };

      if (!res.ok) {
        setError(data.error || `Save failed (${res.status})`);
        setImporting(false);
        return;
      }

      if (data.imported === 0) {
        const detail = data.errors.length
          ? `Errors: ${data.errors.slice(0, 3).join("; ")}`
          : "All rows were missing a valid source_url or creative_video_url.";
        setError(`0 ads imported. ${detail}`);
        setImporting(false);
        return;
      }

      setResult({ imported: data.imported, skipped: data.skipped });
      setJson(""); // clear after success
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  };

  const codeStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono)", fontSize: 11,
    background: "#111318", color: "#7EB8F7",
    borderRadius: "var(--border-radius-md)",
    padding: "12px 16px", lineHeight: 1.6,
    whiteSpace: "pre-wrap", overflowX: "auto",
  };

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-title" style={{ marginBottom: 6 }}>
        Claude Chrome Import
      </div>
      <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 20, lineHeight: 1.6 }}>
        Generate a research prompt for Claude Chrome. Claude collects raw evidence and empirical data only. Creative insights are generated later by AI tagging inside this platform.
      </p>

      {/* ── How it works ── */}
      <div style={{
        marginBottom: 20, padding: "10px 14px",
        background: "var(--color-background-secondary)",
        border: "1px solid var(--color-border-tertiary)",
        borderRadius: "var(--border-radius-md)",
      }}>
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-text-tertiary)", marginBottom: 8 }}>How it works</div>
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 2 }}>
          <li>Write a research brief and fill in the fields below.</li>
          <li>Click <strong>Generate Claude Chrome Prompt</strong>.</li>
          <li>Copy the generated prompt.</li>
          <li>Open Claude Chrome (claude.ai in your browser).</li>
          <li>Paste the prompt and let Claude research public sources.</li>
          <li>Copy the JSON array Claude returns.</li>
          <li>Paste it into the <strong>Import JSON</strong> field below.</li>
          <li>Click <strong>Import JSON</strong> to save to your active database.</li>
        </ol>
      </div>

      {/* ── Recommended research prompts ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-text-tertiary)" }}>
            Recommended research prompts
          </span>
          <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
            · based on gaps in your library
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
          {recommendations.map(rec => (
            <div key={rec.id} style={{
              padding: "12px 14px",
              border: "1px solid var(--color-border-tertiary)",
              borderRadius: "var(--border-radius-md)",
              background: "var(--color-background-secondary)",
              display: "flex", flexDirection: "column", gap: 6,
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)", lineHeight: 1.3 }}>
                {rec.title}
              </div>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.4, flex: 1 }}>
                {rec.reason}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {rec.platforms.split(",").map(p => (
                  <span key={p} style={{
                    fontSize: 9, fontWeight: 500, padding: "1px 6px", borderRadius: 8,
                    background: "var(--color-background-primary)",
                    border: "1px solid var(--color-border-tertiary)",
                    color: "var(--color-text-secondary)",
                    whiteSpace: "nowrap",
                  }}>
                    {p.trim()}
                  </span>
                ))}
              </div>
              <button
                className="btn btn-sm"
                onClick={() => applyRec(rec)}
                style={{ alignSelf: "flex-start", marginTop: 2, fontSize: 11 }}
              >
                Use this prompt
              </button>
            </div>
          ))}
        </div>

        {/* Untagged warning */}
        {stats.total > 0 && stats.untaggedCount > stats.total * 0.6 && (
          <div style={{
            marginTop: 10, padding: "7px 12px", fontSize: 11, lineHeight: 1.5,
            background: "#FEF3C7", borderRadius: "var(--border-radius-md)",
            color: "#92400E", border: "1px solid #FDE68A",
          }}>
            💡 {stats.untaggedCount} of {stats.total} ads are untagged. Consider running AI Tagging on existing ads before collecting more.
          </div>
        )}

        {/* Why note */}
        <p style={{ marginTop: 10, fontSize: 11, color: "var(--color-text-tertiary)", lineHeight: 1.5 }}>
          <em>Why these recommendations?</em> Based on gaps in the active database and the ad types most useful for AI ad generation: hooks, formats, proof mechanisms, emotional triggers, conversion intent, and replicable creative patterns.
        </p>
      </div>

      {/* ── Prompt generator ── */}
      <div style={{ marginBottom: 20, padding: "14px 16px", border: "1px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)" }}>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-text-tertiary)", marginBottom: 14 }}>
          Research brief
        </div>

        <Field>
          <Label>What do you want to find? *</Label>
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={3}
            placeholder="e.g. Find weight loss ads using transformation stories, before/after hooks, or peptide/GLP-1 angles. Focus on high-engagement organic TikToks and Meta ads with strong CTAs."
            style={{ ...inputStyle(), resize: "vertical", lineHeight: 1.5 }}
          />
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
          <Field>
            <Label>Target niche / keyword *</Label>
            <input
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              placeholder="e.g. weight loss, GLP-1, looksmax"
              style={inputStyle()}
            />
          </Field>
          <Field>
            <Label>Target brands (optional)</Label>
            <input
              value={brands}
              onChange={(e) => setBrands(e.target.value)}
              placeholder="e.g. Ozempic, Found, Calibrate"
              style={inputStyle()}
            />
          </Field>
          <Field>
            <Label>Country / region (optional)</Label>
            <input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="e.g. US, Australia, global"
              style={inputStyle()}
            />
          </Field>
          <Field>
            <Label>Platforms to research (optional)</Label>
            <input
              value={platforms}
              onChange={(e) => setPlatforms(e.target.value)}
              placeholder="e.g. Meta Ad Library, TikTok, Instagram"
              style={inputStyle()}
            />
          </Field>
          <Field>
            <Label>Max ads to collect (optional)</Label>
            <input
              type="number" min="1" max="100"
              value={maxAds}
              onChange={(e) => setMaxAds(e.target.value)}
              style={inputStyle()}
            />
          </Field>
          <Field>
            <Label>Context / notes (optional)</Label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. avoid supplement ads, focus on SaaS-style offers"
              style={inputStyle()}
            />
          </Field>
        </div>

        <button
          className="btn btn-primary btn-sm"
          onClick={generatePrompt}
          disabled={!niche.trim() && !brief.trim()}
        >
          Generate Claude Chrome Prompt
        </button>

        {/* Generated output */}
        {generated && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)" }}>
                Generated prompt — copy and paste into Claude Chrome
              </span>
              <button className="btn btn-sm" onClick={copyGenerated}>
                {copied ? "✓ Copied!" : "Copy prompt"}
              </button>
            </div>
            <div style={codeStyle}>{generated}</div>
          </div>
        )}
      </div>

      {/* ── Divider ── */}
      <div style={{ borderTop: "1px solid var(--color-border-tertiary)", marginBottom: 20 }} />
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-text-tertiary)", marginBottom: 14 }}>
        Paste JSON returned by Claude Chrome
      </div>

      {/* DB selector */}
      <DbSelector value={dbId} onChange={setDbId} databases={databases} />

      {/* JSON input */}
      <Field>
        <Label>Paste JSON array</Label>
        <textarea
          value={json}
          onChange={(e) => { setJson(e.target.value); setError(null); setResult(null); }}
          rows={10}
          placeholder={'[\n  {\n    "platform": "Instagram",\n    "brand_or_creator": "example_brand",\n    "source_url": "https://www.instagram.com/p/xxxxx/",\n    "caption_or_ad_copy": "Transform your body in 30 days…"\n  }\n]'}
          style={{
            ...inputStyle(),
            fontFamily: "var(--font-mono)", fontSize: 12,
            resize: "vertical", lineHeight: 1.5,
          }}
        />
      </Field>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button
          className="btn btn-primary"
          onClick={doImport}
          disabled={importing || !json.trim() || !dbId}
        >
          {importing ? "Importing…" : "Import JSON"}
        </button>
        {json.trim() && !importing && (
          <button className="btn btn-sm" onClick={() => { setJson(""); setError(null); setResult(null); }}>
            Clear
          </button>
        )}
      </div>

      {error  && <ErrorBox msg={error} />}
      {result && (
        <SuccessBox msg={
          `✓ Imported ${result.imported} ad${result.imported !== 1 ? "s" : ""} ` +
          (result.skipped ? `(${result.skipped} skipped — missing URL)` : "") +
          ". Now visible in Library."
        } />
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────
export default function CollectPage() {
  const { activeDb, databases } = useDb();
  const activeDbId = activeDb?.id ?? "";

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 500 }}>Collect</h2>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 4 }}>
          Two ways to collect public ad data into your library.
        </p>
      </div>

      <ApifyScrapeSection   activeDbId={activeDbId} databases={databases} />
      <ClaudeChromeSection  activeDbId={activeDbId} databases={databases} />

      {/* Setup note */}
      <div style={{
        marginTop: 8, padding: "12px 16px",
        background: "var(--color-background-secondary)",
        border: "1px solid var(--color-border-tertiary)",
        borderRadius: "var(--border-radius-lg)",
        fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.6,
      }}>
        <strong>Apify token</strong> — add to{" "}
        <code style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--color-background-primary)", padding: "1px 5px", borderRadius: 3 }}>
          .env.local
        </code>:{" "}
        <code style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>APIFY_TOKEN=your_token</code>.
        Get yours at{" "}
        <a href="https://console.apify.com/account/integrations" target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-accent)" }}>
          console.apify.com
        </a>.
      </div>
    </div>
  );
}
