"use client";

import { useEffect, useState, useMemo } from "react";
import { useDb } from "@/lib/db-context";
import { normalise, scoreBadgeClass, platformBadgeClass } from "@/lib/normalise";

type Ad = Record<string, unknown>;

// ── Brief generator (full deterministic template) ──────────────
function generateBrief(ad: Ad): string {
  const n       = normalise(ad);
  const id      = n._id ? `#${n._id}` : "";
  const cat     = (n._cat || "this category") as string;
  const hook    = (n._hook || "standard hook") as string;
  const fmt     = ((ad.formatType || ad.avatarOrCreativeType || "video") as string);
  const plat    = (n._platform || "social media") as string;
  const score   = n._score !== null ? `Score: ${Math.round(n._score)}/100` : "Unscored";
  const cta     = ((ad.ctaType || "Learn more") as string);
  const persona = ((ad.personaTarget || "target demographic") as string);
  const hookEx  = ((ad.hookExample || ad.first3Seconds || `${hook} opening that stops the scroll`) as string);
  const why     = (n._why || `Uses a ${hook} to immediately capture attention and build urgency.`) as string;
  const how     = (n._replicate || `Replicate the core ${hook} hook with an AI avatar and adapted script.`) as string;
  const useCase = ((ad.useCaseForUs || ad.valueForUs || `Strong reference for our ${cat} creative stack.`) as string);
  const angle   = ((ad.creativeAngle || "aspiration + transformation") as string);
  const funnel  = ((ad.funnelStage || "awareness") as string);
  const script  = (ad.scriptStructure as string) || null;
  const aiAdapt = (ad.aiAvatarAdaptation as string) || null;
  const comply  = (ad.complianceRisk as string) || null;

  const lines: string[] = [
    `REPLICATION BRIEF ${id}`,
    "═".repeat(50),
    "",
    "OVERVIEW",
    "─".repeat(40),
    `Format:    ${fmt}`,
    `Platform:  ${plat}`,
    `Category:  ${cat}`,
    `Hook type: ${hook}`,
    `CTA:       ${cta}`,
    `Funnel:    ${funnel}`,
    `Persona:   ${persona}`,
    `${score}`,
    "",
    "WHY IT WORKS",
    "─".repeat(40),
    why,
    "",
    "HOOK EXAMPLE",
    "─".repeat(40),
    `"${hookEx}"`,
    "",
  ];

  if (script) {
    lines.push("SCRIPT STRUCTURE", "─".repeat(40), script, "");
  }

  lines.push(
    "HOW WE REPLICATE (PEPTIDE / AI PLATFORM)",
    "─".repeat(40),
    how,
    "",
    "AI AVATAR ADAPTATION",
    "─".repeat(40),
  );

  if (aiAdapt) {
    lines.push(aiAdapt);
  } else {
    lines.push(
      `• Replace original talent with AI avatar (gender-neutral, clinical-meets-aspirational)`,
      `• Match persona: ${persona}`,
      `• Background: clean white / neutral clinical — precision health, not fitness hustle`,
      `• Tone: confident, measured, science-backed`,
    );
  }

  lines.push(
    "",
    "SUGGESTED SCRIPT (15–30 SEC)",
    "─".repeat(40),
    `[0–3s]   HOOK:    "${hookEx}"`,
    `[3–10s]  PROBLEM: Establish the pain — why typical solutions fail for ${persona}`,
    `[10–20s] REVEAL:  AI-powered personalised peptide protocols. Not generic. Precision.`,
    `[20–27s] PROOF:   Quick visual / stat: "X users saw results in Y weeks"`,
    `[27–30s] CTA:     "${cta}" — direct, low friction`,
    "",
    "CREATIVE ANGLE",
    "─".repeat(40),
    `Primary angle: ${angle}`,
    `Key message:   Precision weight loss via AI-driven peptide protocols.`,
    `Differentiator: AI decision tool — personalised, not generic diet advice.`,
    "",
    "USE CASE FOR OUR CAMPAIGNS",
    "─".repeat(40),
    useCase,
  );

  if (comply) {
    lines.push("", "COMPLIANCE NOTES", "─".repeat(40), comply);
  }

  lines.push(
    "",
    "─".repeat(50),
    `Generated: ${new Date().toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`,
  );

  return lines.join("\n");
}

// ── Score pill ─────────────────────────────────────────────────
function ScorePill({ score }: { score: number | null }) {
  if (score === null) return <span className="score-pill score-none">—</span>;
  return <span className={`score-pill ${scoreBadgeClass(score)}`}>{Math.round(score)}</span>;
}

// ── Ad row ────────────────────────────────────────────────────
function AdRow({ ad, selected, onClick }: { ad: Ad; selected: boolean; onClick: () => void }) {
  const n = normalise(ad);
  return (
    <tr
      onClick={onClick}
      style={{ background: selected ? "#EBF3FC" : undefined, cursor: "pointer" }}
    >
      <td style={{ width: 36, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-text-tertiary)" }}>
        {n._id || "—"}
      </td>
      <td>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span className="badge badge-blue" style={{ alignSelf: "flex-start" }}>
            {(n._cat || "—") as string}
          </span>
          {n._title && (
            <span style={{ fontSize: 10, color: "var(--color-text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>
              {n._title}
            </span>
          )}
        </div>
      </td>
      <td>
        {n._platform
          ? <span className={`badge ${platformBadgeClass(n._platform)}`}>{n._platform}</span>
          : <span style={{ color: "var(--color-text-tertiary)" }}>—</span>
        }
      </td>
      <td>
        {n._hook ? <span className="chip">{n._hook}</span> : <span style={{ color: "var(--color-text-tertiary)" }}>—</span>}
      </td>
      <td><ScorePill score={n._score} /></td>
    </tr>
  );
}

// ── Factory page ───────────────────────────────────────────────
export default function FactoryPage() {
  const { activeDb } = useDb();
  const [ads,      setAds]      = useState<Ad[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [selected, setSelected] = useState<Ad | null>(null);
  const [search,   setSearch]   = useState("");
  const [copied,   setCopied]   = useState(false);

  useEffect(() => {
    if (!activeDb) return;
    setLoading(true);
    fetch(`/api/ads?databaseId=${activeDb.id}`)
      .then((r) => r.json())
      .then((d) => setAds(d.ads ?? []))
      .finally(() => setLoading(false));
  }, [activeDb]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return ads;
    return ads.filter((a) => Object.values(a).join(" ").toLowerCase().includes(q));
  }, [ads, search]);

  const sorted = useMemo(() =>
    [...filtered].sort((a, b) => {
      const sa = normalise(a)._score ?? -1;
      const sb = normalise(b)._score ?? -1;
      return sb - sa;
    }),
    [filtered]
  );

  const brief = useMemo(() =>
    selected ? generateBrief(selected) : "",
    [selected]
  );

  const handleCopy = () => {
    navigator.clipboard.writeText(brief);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const n = normalise(selected!);
    const name = `brief-${n._id || "ad"}-${Date.now()}.txt`;
    const blob = new Blob([brief], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: "flex", gap: 20, height: "calc(100vh - 40px)", overflow: "hidden" }}>

      {/* ── Left panel: ad list ─────────────────────────────── */}
      <div style={{ width: 440, flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 500 }}>Ad Factory</h2>
          <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 4 }}>
            Select an ad to generate its replication brief.
          </p>
        </div>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search ads…"
          style={{ marginBottom: 10, padding: "7px 12px", fontSize: 13, borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}
        />

        <div className="card" style={{ padding: 0, overflow: "hidden", flex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {loading ? (
              <div className="empty-state"><p>Loading…</p></div>
            ) : sorted.length === 0 ? (
              <div className="empty-state"><p style={{ fontSize: 13 }}>No ads found.</p></div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>#</th>
                    <th>Category</th>
                    <th>Platform</th>
                    <th>Hook</th>
                    <th>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((ad) => (
                    <AdRow
                      key={ad.id as string}
                      ad={ad}
                      selected={selected?.id === ad.id}
                      onClick={() => setSelected(ad)}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div style={{ padding: "8px 14px", borderTop: "0.5px solid var(--color-border-tertiary)", fontSize: 11, color: "var(--color-text-tertiary)" }}>
            {sorted.length} ads · sorted by score
          </div>
        </div>
      </div>

      {/* ── Right panel: brief ──────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {!selected ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-lg)", border: "0.5px solid var(--color-border-tertiary)" }}>
            <div style={{ textAlign: "center", color: "var(--color-text-tertiary)" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>✦</div>
              <p style={{ fontSize: 14 }}>Select an ad to generate its brief</p>
            </div>
          </div>
        ) : (
          <>
            {/* Brief header */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>
                  {(normalise(selected)._cat || "Ad")} — {(selected.subCategory || selected.niche || "") as string}
                </div>
                <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 2 }}>
                  {normalise(selected)._platform || ""}{normalise(selected)._score !== null ? ` · Score ${Math.round(normalise(selected)._score!)}` : ""}
                </div>
              </div>
              <button className="btn btn-sm" onClick={handleCopy}>
                {copied ? "✓ Copied" : "Copy brief"}
              </button>
              <button className="btn btn-sm" onClick={handleDownload}>↓ Download .txt</button>
            </div>

            {/* Brief text */}
            <div style={{
              flex: 1, overflowY: "auto",
              background: "var(--color-background-primary)",
              border: "0.5px solid var(--color-border-tertiary)",
              borderRadius: "var(--border-radius-lg)",
              padding: "20px 24px",
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              lineHeight: 1.75,
              color: "var(--color-text-primary)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}>
              {brief}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
