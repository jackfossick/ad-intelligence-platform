"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useDb } from "@/lib/db-context";

// ── Design tokens (mirror docs/design.html) ───────────────────
const T = {
  accent: "#5B4FD9", al: "#EEEDFE", ad: "#26215C",
  green:  "#27A06A", gl: "#E1F5EE", gd: "#085041",
  amber:  "#D4870A", ambl: "#FEF3DA",
  red:    "#D14040", rl: "#FEECEC", rd: "#7A1F1F",
  bg:     "#f8f8f6", bg2: "#fff",   bg3: "#f1efe8",
  text:   "#1a1a18", text2: "#73726c", text3: "#9c9a92",
  border: "#e8e6df", border2: "#d3d1c7",
} as const;

// inputKind drives the keyword-field label and placeholder per platform:
//   keyword  → free-form search term (TikTok, Meta, YouTube)
//   username → Instagram handle (the BD IG dataset discovers by username, not hashtag)
const PLATFORMS = [
  { id: "TikTok",    label: "TikTok",    sub: "Creative Centre", color: "#1a1a2e", supported: true,  inputKind: "keyword"  },
  { id: "Meta",      label: "Meta",      sub: "Ad Library",      color: "#1877F2", supported: true,  inputKind: "keyword"  },
  { id: "Instagram", label: "Instagram", sub: "by Username",     color: "#534AB7", supported: true,  inputKind: "username" },
  { id: "YouTube",   label: "YouTube",   sub: "Search",          color: "#cc0000", supported: true,  inputKind: "keyword"  },
] as const;

const NICHES = ["Beauty & Skincare", "Health & Wellness", "Fitness", "DTC / E-commerce", "Finance", "SaaS / Tech"];
const FORMATS = ["All formats", "UGC only", "Talking head", "Product demo", "Slideshow"];
const LANGS   = ["English", "Spanish", "French", "Any"];

const EXAMPLES = [
  '"50 TikTok UGC skincare ads targeting Gen Z"',
  '"Meta supplement ads using social proof hooks"',
  '"YouTube fitness ads, curiosity gap, last 30 days"',
  '"100 DTC ads all platforms, problem-first hook"',
];

type Tab = "scrape" | "history" | "import" | "tagging";
type Mode = "fast" | "regular";

type JobEntry = {
  id: string;
  kind: "scrape" | "import";
  source: string;
  status: string;
  databaseName?: string;
  keyword?: string;
  actor?: string;
  platform?: string;
  imported?: number;
  rowCount?: number;
  totalRows?: number;
  failed?: number;
  createdAt: string;
};
type Ad = Record<string, unknown> & { id: string };

// ── Page ──────────────────────────────────────────────────────
export default function CollectPage() {
  const { activeDb } = useDb();
  const [tab, setTab] = useState<Tab>("scrape");
  const [mode, setMode] = useState<Mode>("fast");

  // Tab badge counts
  const [runningCount,  setRunningCount]  = useState(0);
  const [untaggedCount, setUntaggedCount] = useState(0);

  return (
    <div>
      {/* ── Top row: mode toggle + shortcuts ──────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{ display: "inline-flex", padding: 3, borderRadius: 10, background: T.bg3 }}>
          <button onClick={() => setMode("fast")}    style={modeBtnStyle(mode === "fast")}>⚡ Fast</button>
          <button onClick={() => setMode("regular")} style={modeBtnStyle(mode === "regular")}>Regular</button>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button onClick={() => setTab("history")} style={btnStyle({})}>Job history</button>
          <button onClick={() => setTab("import")}  style={btnStyle({})}>Manual import</button>
        </div>
      </div>

      {/* ── Sub-tabs ──────────────────────────────────────────── */}
      <div style={{
        display: "flex", gap: 0, borderBottom: `1px solid ${T.border}`, marginBottom: 0,
      }}>
        <Stab on={tab === "scrape"}  onClick={() => setTab("scrape")}>Configure scrape</Stab>
        <Stab on={tab === "history"} onClick={() => setTab("history")}>
          Job history
          {runningCount > 0 && <Badge tone="run">{runningCount} running</Badge>}
        </Stab>
        <Stab on={tab === "import"}  onClick={() => setTab("import")}>Manual import</Stab>
        <Stab on={tab === "tagging"} onClick={() => setTab("tagging")}>
          AI tagging
          {untaggedCount > 0 && <Badge tone="accent">{untaggedCount} untagged</Badge>}
        </Stab>
      </div>

      {/* ── Panes ─────────────────────────────────────────────── */}
      <div style={{ paddingTop: 14 }}>
        {tab === "scrape"  && <ScrapePane mode={mode} setMode={setMode} setTab={setTab} />}
        {tab === "history" && <HistoryPane onCounts={setRunningCount} />}
        {tab === "import"  && <ImportPane />}
        {tab === "tagging" && <TaggingPane onCounts={setUntaggedCount} />}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────
function Stab({ children, on, onClick }: { children: React.ReactNode; on: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: "9px 14px", fontSize: 12, fontWeight: on ? 500 : 400,
        color: on ? T.text : T.text2,
        borderBottom: on ? `2px solid ${T.accent}` : "2px solid transparent",
        marginBottom: -1, cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
      }}
    >
      {children}
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "run" | "accent" }) {
  const bg = tone === "run" ? "#FEF3DA" : T.al;
  const color = tone === "run" ? "#854F0B" : T.ad;
  return (
    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: bg, color, fontWeight: 500 }}>
      {children}
    </span>
  );
}

// ── SCRAPE PANE ───────────────────────────────────────────────
function ScrapePane({ mode, setMode, setTab }: { mode: Mode; setMode: (m: Mode) => void; setTab: (t: Tab) => void }) {
  return mode === "fast"
    ? <FastMode onSwitchToRegular={() => setMode("regular")} onLaunched={() => setTab("history")} />
    : <RegularMode onLaunched={() => setTab("history")} />;
}

function FastMode({ onSwitchToRegular, onLaunched }: { onSwitchToRegular: () => void; onLaunched: () => void }) {
  const [text, setText] = useState("");
  const inferred = useMemo(() => inferFromText(text), [text]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 500, color: T.text2, marginBottom: 8 }}>
          Describe your scrape — keywords + platform + filters
        </div>
        <div style={{ display: "flex", alignItems: "stretch", border: `1.5px solid ${T.accent}`, borderRadius: 12, background: T.bg2, padding: 10, gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: `linear-gradient(135deg, #6C3FB5, ${T.accent})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 11 11" fill="none">
              <path d="M5.5 1L6.5 4.5H10L7.5 6.5 8.5 10 5.5 8 2.5 10 3.5 6.5 1 4.5H4.5L5.5 1Z" fill="#fff"/>
            </svg>
          </div>
          <textarea
            value={text} onChange={(e) => setText(e.target.value)}
            placeholder='e.g. "Find 50 TikTok UGC ads about skincare for Gen Z" or "Get Meta ads in the supplement space with social proof hooks"'
            rows={2}
            style={{ flex: 1, border: "none", outline: "none", resize: "vertical", fontFamily: "inherit", fontSize: 13, color: T.text, background: "transparent", padding: 4 }}
          />
        </div>
      </div>

      <div>
        <div style={{ fontSize: 11, color: T.text2, marginBottom: 7 }}>Try an example</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {EXAMPLES.map((ex) => (
            <span key={ex} onClick={() => setText(ex.replace(/^"|"$/g, ""))}
              style={{ padding: "5px 11px", borderRadius: 999, fontSize: 11, background: T.bg2, border: `1px solid ${T.border2}`, color: T.text2, cursor: "pointer" }}
            >
              {ex}
            </span>
          ))}
        </div>
      </div>

      {/* Inferred preview */}
      {text.trim().length > 8 && (
        <div style={{ border: `1px solid ${T.accent}40`, background: T.al, borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: T.ad }}>Inferred parameters — review before running</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, fontSize: 11, marginBottom: 12 }}>
            <InfRow label="Platform"  value={inferred.platform ?? "—"} />
            <InfRow label="Keywords"  value={inferred.keywords.length ? inferred.keywords.join(", ") : "—"} />
            <InfRow label="Max ads"   value={String(inferred.maxResults)} />
            <InfRow label="Hook"      value={inferred.hook ?? "any"} />
            <InfRow label="Format"    value={inferred.format ?? "any"} />
            <InfRow label="Date range" value={inferred.dateRange ?? "last 30 days"} />
          </div>
          {error && (
            <div style={{
              padding: "8px 10px", marginBottom: 8, borderRadius: 6,
              background: T.rl, color: T.rd, fontSize: 11, fontFamily: "var(--font-mono)",
              whiteSpace: "pre-wrap", wordBreak: "break-word",
            }}>{error}</div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={async () => {
                if (!inferred.platform || !inferred.keywords.length) return;
                setRunning(true); setError(null);
                try {
                  await runScrape({
                    platformId: inferred.platform,
                    keywords:   inferred.keywords,
                    maxResults: inferred.maxResults,
                  });
                  onLaunched();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Failed to start scrape.");
                } finally {
                  setRunning(false);
                }
              }}
              disabled={running || !inferred.platform || !inferred.keywords.length}
              style={btnStyle({ primary: true, disabled: running || !inferred.platform || !inferred.keywords.length })}
            >
              {running ? "Starting…" : "Run with these parameters"}
            </button>
            <button onClick={onSwitchToRegular} style={btnStyle({})}>Edit in regular mode</button>
            <span style={{ fontSize: 11, color: T.text2, marginLeft: "auto" }}>Not right? Switch to regular mode</span>
          </div>
        </div>
      )}
    </div>
  );
}

function InfRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: T.bg2, padding: "6px 10px", borderRadius: 6, border: `1px solid ${T.border}` }}>
      <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: T.text2 }}>{label}</div>
      <div style={{ fontSize: 12, color: T.text, marginTop: 1 }}>{value}</div>
    </div>
  );
}

function RegularMode({ onLaunched }: { onLaunched: () => void }) {
  const [platform, setPlatform] = useState<string>("TikTok");
  const [keywords, setKeywords] = useState<string[]>(["skincare", "DTC"]);
  const [kwInput, setKwInput]   = useState("");
  const [niche, setNiche]       = useState(NICHES[0]);
  const [maxAds, setMaxAds]     = useState(100);
  const [minDur, setMinDur]     = useState(15);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [format, setFormat] = useState(FORMATS[0]);
  const [lang, setLang]     = useState(LANGS[0]);
  const [skipDup, setSkipDup] = useState(true);
  const [validate, setValidate] = useState(true);
  const [autoTag, setAutoTag] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const addKeyword = (k: string) => {
    const v = k.trim();
    if (v && !keywords.includes(v)) setKeywords([...keywords, v]);
    setKwInput("");
  };

  const onRun = async () => {
    if (!keywords.length) { setError("Add at least one keyword."); return; }
    setRunning(true); setError(null);
    try {
      await runScrape({ platformId: platform, keywords, maxResults: maxAds });
      onLaunched();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start scrape.");
    } finally {
      setRunning(false);
    }
  };

  const selectedPlatform = PLATFORMS.find((p) => p.id === platform);
  const supported = selectedPlatform?.supported ?? false;
  const inputKind = selectedPlatform?.inputKind ?? "keyword";
  const estMin = Math.max(1, Math.round(maxAds / 25));

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 12 }}>
        {/* Platform */}
        <div>
          <div style={cardTitleStyle()}>Platform</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
            {PLATFORMS.map((p) => (
              <div
                key={p.id}
                onClick={() => p.supported && setPlatform(p.id)}
                style={{
                  padding: "12px 10px", borderRadius: 10, background: T.bg2,
                  border: `1px solid ${platform === p.id ? T.accent : T.border}`,
                  boxShadow: platform === p.id ? `0 0 0 3px ${T.accent}12` : "none",
                  cursor: p.supported ? "pointer" : "not-allowed",
                  opacity: p.supported ? 1 : 0.45,
                  position: "relative",
                  display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start",
                }}
              >
                <div style={{ width: 22, height: 22, borderRadius: 6, background: p.color, color: "#fff", fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {p.id === "TikTok" ? "TT" : p.id === "Meta" ? "M" : p.id === "Instagram" ? "IG" : "YT"}
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, color: T.text }}>{p.label}</div>
                <div style={{ fontSize: 10, color: T.text2 }}>{p.sub}{!p.supported && " · coming soon"}</div>
                {platform === p.id && (
                  <span style={{ position: "absolute", top: 8, right: 8, width: 14, height: 14, borderRadius: "50%", background: T.accent, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 9 }}>✓</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Keywords + Niche */}
        <div>
          <div style={cardTitleStyle()}>{inputKind === "username" ? "Usernames & target" : "Keywords & target"}</div>
          <div style={fieldStyle()}>
            <div style={fieldLabelStyle()}>
              {inputKind === "username" ? "Usernames" : "Keywords"}
              <span style={{ color: T.text3, fontWeight: 400 }}> — press Enter</span>
            </div>
            <div
              onClick={() => document.getElementById("kwi")?.focus()}
              style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "6px 8px", borderRadius: 8, background: T.bg2, border: `1px solid ${T.border2}`, minHeight: 36, cursor: "text" }}
            >
              {keywords.map((k) => (
                <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, padding: "3px 8px", borderRadius: 5, background: T.al, color: T.ad }}>
                  {k}
                  <span onClick={(e) => { e.stopPropagation(); setKeywords(keywords.filter((x) => x !== k)); }}
                    style={{ cursor: "pointer", fontSize: 14, lineHeight: 1, color: T.ad, opacity: 0.6 }}>×</span>
                </span>
              ))}
              <input
                id="kwi" value={kwInput} onChange={(e) => setKwInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addKeyword(kwInput); } }}
                placeholder={keywords.length ? "" : inputKind === "username" ? "Add username..." : "Add keyword..."}
                style={{ flex: 1, minWidth: 80, border: "none", outline: "none", background: "transparent", fontSize: 12, color: T.text, padding: 0 }}
              />
            </div>
            {inputKind === "username" && (
              <div style={{ fontSize: 10, color: T.text2, marginTop: 4 }}>
                Bright Data's Instagram scraper discovers posts by username — enter one or more handles (e.g. <code>natgeo</code>).
              </div>
            )}
          </div>
          <div style={{ ...fieldStyle(), marginBottom: 0 }}>
            <div style={fieldLabelStyle()}>Niche</div>
            <select value={niche} onChange={(e) => setNiche(e.target.value)} style={selectStyle()}>
              {NICHES.map((n) => <option key={n}>{n}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 12 }}>
        {/* Scrape parameters */}
        <div className="card" style={cardStyle()}>
          <div style={cardTitleStyle()}>Scrape parameters</div>
          <div style={fieldStyle()}>
            <div style={fieldLabelStyle()}>Max ads</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input type="range" min={10} max={500} step={10} value={maxAds} onChange={(e) => setMaxAds(Number(e.target.value))} style={{ flex: 1 }} />
              <span style={{ fontSize: 12, fontWeight: 500, color: T.text, minWidth: 36, textAlign: "right" }}>{maxAds}</span>
            </div>
          </div>
          <div style={fieldStyle()}>
            <div style={fieldLabelStyle()}>Min duration (s)</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input type="range" min={5} max={120} step={5} value={minDur} onChange={(e) => setMinDur(Number(e.target.value))} style={{ flex: 1 }} />
              <span style={{ fontSize: 12, fontWeight: 500, color: T.text, minWidth: 36, textAlign: "right" }}>{minDur}s</span>
            </div>
          </div>
          <div style={{ ...fieldStyle(), marginBottom: 0 }}>
            <div style={fieldLabelStyle()}>Date range</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ ...selectStyle(), flex: 1 }} />
              <input type="date" value={endDate}   onChange={(e) => setEndDate(e.target.value)}   style={{ ...selectStyle(), flex: 1 }} />
            </div>
          </div>
        </div>

        {/* Filters & AI options */}
        <div className="card" style={cardStyle()}>
          <div style={cardTitleStyle()}>Filters & AI options</div>
          <div style={fieldStyle()}>
            <div style={fieldLabelStyle()}>Format</div>
            <select value={format} onChange={(e) => setFormat(e.target.value)} style={selectStyle()}>
              {FORMATS.map((f) => <option key={f}>{f}</option>)}
            </select>
          </div>
          <div style={fieldStyle()}>
            <div style={fieldLabelStyle()}>Language</div>
            <select value={lang} onChange={(e) => setLang(e.target.value)} style={selectStyle()}>
              {LANGS.map((l) => <option key={l}>{l}</option>)}
            </select>
          </div>
          <div style={{ ...fieldStyle(), marginBottom: 0 }}>
            <div style={fieldLabelStyle()}>Options</div>
            <label style={chkRowStyle()}>
              <input type="checkbox" checked={skipDup} onChange={(e) => setSkipDup(e.target.checked)} />
              <span>Skip duplicates on collect</span>
            </label>
            <label style={chkRowStyle()}>
              <input type="checkbox" checked={validate} onChange={(e) => setValidate(e.target.checked)} />
              <span>Validate schema on collect</span>
            </label>
            <label style={chkRowStyle()}>
              <input type="checkbox" checked={autoTag} onChange={(e) => setAutoTag(e.target.checked)} />
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 14, height: 14, borderRadius: 4, background: `linear-gradient(135deg, #6C3FB5, ${T.accent})`, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="8" height="8" viewBox="0 0 11 11" fill="none"><path d="M5.5 1L6.5 4.5H10L7.5 6.5 8.5 10 5.5 8 2.5 10 3.5 6.5 1 4.5H4.5L5.5 1Z" fill="#fff"/></svg>
                </span>
                Auto-tag hook + format with AI
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Run panel */}
      <div className="card" style={{ ...cardStyle(), display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 10, fontSize: 11 }}>
          <SumItem label="Platform" value={platform} />
          <SumItem label="Keywords" value={keywords.join(", ") || "—"} />
          <SumItem label="Target" value={`${maxAds} ads`} />
          <SumItem label="Niche" value={niche} />
          <SumItem label="Date range" value={`${startDate} – ${endDate}`} />
          <SumItem label="Hook + format" value={autoTag ? "AI tagging on" : "off"} accent={autoTag} />
        </div>
        {error && <p style={{ fontSize: 11, color: T.rd, margin: 0 }}>{error}</p>}
        {!supported && (
          <p style={{ fontSize: 11, color: T.rd, margin: 0 }}>
            {platform} scraping isn't wired yet.
          </p>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={onRun} disabled={running || !supported || !keywords.length} style={btnStyle({ primary: true, disabled: running || !supported || !keywords.length })}>
            {running ? "Starting…" : "Run scrape"}
          </button>
          <button style={btnStyle({ disabled: true })} disabled title="Coming soon">Save as preset</button>
          <button style={btnStyle({ disabled: true })} disabled title="Coming soon">Schedule recurring</button>
          <span style={{ fontSize: 11, color: T.text2, marginLeft: "auto" }}>
            Est. ~{estMin} min · {maxAds} ads max
          </span>
        </div>
      </div>
    </div>
  );
}

function SumItem({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ background: T.bg3, padding: "6px 10px", borderRadius: 6 }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: accent ? T.ad : T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
      <div style={{ fontSize: 9, color: T.text2, marginTop: 1, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
    </div>
  );
}

// ── HISTORY PANE ──────────────────────────────────────────────
function HistoryPane({ onCounts }: { onCounts: (n: number) => void }) {
  const { activeDb } = useDb();
  const [jobs, setJobs] = useState<JobEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("All");

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/jobs${activeDb ? `?databaseId=${activeDb.id}` : ""}`)
      .then((r) => r.json())
      .then((d: JobEntry[]) => {
        setJobs(Array.isArray(d) ? d : []);
        const running = (Array.isArray(d) ? d : []).filter((j) => j.status.toLowerCase() === "running").length;
        onCounts(running);
      })
      .finally(() => setLoading(false));
  }, [activeDb?.id, onCounts]);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    if (filter === "All") return jobs;
    const f = filter.toLowerCase();
    return jobs.filter((j) =>
      (j.platform ?? "").toLowerCase().includes(f) ||
      (j.source ?? "").toLowerCase().includes(f) ||
      (j.actor ?? "").toLowerCase().includes(f),
    );
  }, [jobs, filter]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: T.text2 }}>
          {jobs.length} job{jobs.length === 1 ? "" : "s"}
          {activeDb && <> · scoped to <strong style={{ color: T.text }}>{activeDb.name}</strong></>}
        </span>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ ...selectStyle(), width: "auto", fontSize: 11, padding: "5px 8px" }}>
          {["All", "TikTok", "Meta", "Instagram", "YouTube", "BrightData", "Import"].map((p) => <option key={p}>{p}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ padding: 30, textAlign: "center", color: T.text2 }}>Loading…</div>
      ) : visible.length === 0 ? (
        <div style={{ padding: 30, textAlign: "center", color: T.text2, background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 12 }}>
          No jobs yet. Run a scrape from the <strong>Configure scrape</strong> tab.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {visible.map((j) => <JobRow key={`${j.kind}-${j.id}`} j={j} />)}
        </div>
      )}
    </div>
  );
}

function JobRow({ j }: { j: JobEntry }) {
  const s = j.status.toLowerCase();
  const dotColor =
    s === "running" || s === "started" ? T.amber :
    s === "completed" || s === "succeeded" || s === "ok" || s === "done" ? T.green :
    s === "failed" || s === "error" ? T.red : T.border2;
  const badgeBg =
    s === "running" || s === "started" ? T.ambl :
    s === "completed" || s === "succeeded" || s === "ok" || s === "done" ? T.gl :
    s === "failed" || s === "error" ? T.rl : T.bg3;
  const badgeColor =
    s === "running" || s === "started" ? "#854F0B" :
    s === "completed" || s === "succeeded" || s === "ok" || s === "done" ? T.gd :
    s === "failed" || s === "error" ? T.rd : T.text2;

  const title = j.kind === "scrape"
    ? `${j.platform ?? "BrightData"} · ${j.keyword ?? "—"}`
    : `Import · ${j.source}${j.keyword ? ` · ${j.keyword}` : ""}`;

  const count = j.kind === "import" ? (j.imported ?? 0) : (j.rowCount ?? 0);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 10 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: T.text }}>{title}</div>
        <div style={{ fontSize: 11, color: T.text2, marginTop: 2 }}>
          {new Date(j.createdAt).toLocaleString()}
          {j.databaseName && <> · {j.databaseName}</>}
        </div>
      </div>
      <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 4, background: badgeBg, color: badgeColor, fontWeight: 500, flexShrink: 0 }}>{j.status}</span>
      <div style={{ fontSize: 13, fontWeight: 500, color: T.text, minWidth: 60, textAlign: "right", flexShrink: 0 }}>
        {count.toLocaleString()} <span style={{ fontSize: 10, color: T.text2, fontWeight: 400 }}>ads</span>
      </div>
    </div>
  );
}

// ── IMPORT PANE ───────────────────────────────────────────────
function ImportPane() {
  const { activeDb, databases } = useDb();
  const [json, setJson]       = useState("");
  const [destId, setDestId]   = useState(activeDb?.id ?? "");
  const [autoTag, setAutoTag] = useState(true);
  const [validateOnly, setValidateOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => { if (activeDb?.id) setDestId(activeDb.id); }, [activeDb?.id]);

  const submit = async (validateOnlyFlag: boolean) => {
    if (!json.trim()) { setResult({ ok: false, msg: "Paste JSON first." }); return; }
    let parsed: unknown;
    try { parsed = JSON.parse(json); }
    catch { setResult({ ok: false, msg: "Invalid JSON." }); return; }
    if (!Array.isArray(parsed)) { setResult({ ok: false, msg: "Expected an array of ads." }); return; }
    if (!destId) { setResult({ ok: false, msg: "Pick a destination database." }); return; }

    setBusy(true); setResult(null);
    try {
      const res = await fetch("/api/ads/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ databaseId: destId, source: "manual", ads: parsed, autoTag, validateOnly: validateOnlyFlag }),
      });
      const data = await res.json();
      if (!res.ok) { setResult({ ok: false, msg: data.error ?? "Import failed." }); return; }
      setResult({ ok: true, msg: validateOnlyFlag
        ? `Validated: ${data.validated ?? parsed.length} ads, ${data.errors?.length ?? 0} issue${(data.errors?.length ?? 0) === 1 ? "" : "s"}.`
        : `Imported ${data.imported ?? 0} ads (${data.deduped ?? 0} deduped, ${data.failed ?? 0} failed).`
      });
    } catch (e) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : "Import failed." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {/* Left: dropzone + required fields */}
        <div>
          <div style={cardTitleStyle()}>Upload file</div>
          <label htmlFor="file" style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            padding: "30px 20px", borderRadius: 10, border: `2px dashed ${T.border2}`,
            background: T.bg2, cursor: "pointer", marginBottom: 14,
          }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: T.al, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 11V3m0 0L5 6m3-3l3 3" stroke={T.accent} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><path d="M2 12h12" stroke={T.accent} strokeWidth="1.4" strokeLinecap="round"/></svg>
            </div>
            <div style={{ fontSize: 13, fontWeight: 500, color: T.text, marginBottom: 3 }}>Drop JSON or CSV here</div>
            <div style={{ fontSize: 11, color: T.text2 }}>or click to browse · max 10MB</div>
            <input id="file" type="file" accept=".json,.csv" style={{ display: "none" }} onChange={(e) => {
              const f = e.target.files?.[0]; if (!f) return;
              const reader = new FileReader();
              reader.onload = () => { setJson(typeof reader.result === "string" ? reader.result : ""); };
              reader.readAsText(f);
            }} />
          </label>
          <div className="card" style={{ ...cardStyle(), padding: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: T.text, marginBottom: 8 }}>Required fields</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11, color: T.text2 }}>
              <ReqField required label="platform" hint="TikTok · Meta · YouTube" />
              <ReqField required label="ad_url"   hint="unique, valid URL" />
              <ReqField required label="ad_copy"  hint="min 10 characters" />
              <ReqField label="hook"   hint="optional — AI can infer" />
              <ReqField label="format" hint="optional — AI can infer" />
            </div>
          </div>
        </div>

        {/* Right: paste JSON + destination + actions */}
        <div>
          <div style={cardTitleStyle()}>Paste JSON</div>
          <textarea
            value={json} onChange={(e) => setJson(e.target.value)}
            placeholder='[{"platform":"TikTok","ad_url":"https://...","ad_copy":"..."}]'
            style={{ ...selectStyle(), minHeight: 100, resize: "vertical", fontFamily: "monospace", fontSize: 11, marginBottom: 10 }}
          />
          <div style={fieldStyle()}>
            <div style={fieldLabelStyle()}>Destination</div>
            <select value={destId} onChange={(e) => setDestId(e.target.value)} style={selectStyle()}>
              {databases.map((db) => (
                <option key={db.id} value={db.id}>{db.name}{db.id === activeDb?.id ? " (active)" : ""}</option>
              ))}
            </select>
          </div>
          <label style={chkRowStyle()}>
            <input type="checkbox" checked={autoTag} onChange={(e) => setAutoTag(e.target.checked)} />
            <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: T.text2 }}>
              <span style={{ width: 14, height: 14, borderRadius: 4, background: `linear-gradient(135deg, #6C3FB5, ${T.accent})`, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="8" height="8" viewBox="0 0 11 11" fill="none"><path d="M5.5 1L6.5 4.5H10L7.5 6.5 8.5 10 5.5 8 2.5 10 3.5 6.5 1 4.5H4.5L5.5 1Z" fill="#fff"/></svg>
              </span>
              Auto-tag missing hook + format with AI
            </span>
          </label>
          {result && (
            <p style={{ fontSize: 11, color: result.ok ? T.gd : T.rd, margin: "8px 0" }}>{result.msg}</p>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={() => submit(true)}  disabled={busy} style={{ ...btnStyle({ disabled: busy }), flex: 1 }}>
              {busy && validateOnly ? "Validating…" : "Validate JSON"}
            </button>
            <button onClick={() => submit(false)} disabled={busy} style={{ ...btnStyle({ primary: true, disabled: busy }), flex: 1 }}>
              {busy && !validateOnly ? "Importing…" : "Import to DB"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReqField({ required, label, hint }: { required?: boolean; label: string; hint: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: required ? T.red : T.border2, flexShrink: 0 }} />
      <code style={{ fontSize: 10, background: T.bg3, padding: "1px 5px", borderRadius: 3 }}>{label}</code>
      <span>{hint}</span>
    </div>
  );
}

// ── TAGGING PANE ──────────────────────────────────────────────
function TaggingPane({ onCounts }: { onCounts: (n: number) => void }) {
  const { activeDb } = useDb();
  const dbId = activeDb?.id ?? "";
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAll, setBusyAll] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    if (!dbId) { setAds([]); setLoading(false); return; }
    setLoading(true);
    const res = await fetch(`/api/ads?databaseId=${dbId}`);
    const data = await res.json() as { ads: Ad[] };
    const untagged = (data.ads ?? []).filter((a) => {
      const h = String(a.hookType ?? "");
      const f = String(a.formatType ?? "");
      return !h || !f;
    });
    setAds(untagged);
    onCounts(untagged.length);
    setLoading(false);
  }, [dbId, onCounts]);

  useEffect(() => { load(); }, [load]);

  const tagOne = async (ad: Ad) => {
    setBusyId(ad.id);
    try {
      const res = await fetch("/api/tag-ad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adId: ad.id }),
      });
      if (res.ok) await load();
    } finally {
      setBusyId(null);
    }
  };

  const tagAll = async () => {
    setBusyAll(true);
    try {
      for (const ad of ads) {
        await fetch("/api/tag-ad", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adId: ad.id }),
        }).catch(() => null);
      }
      await load();
    } finally {
      setBusyAll(false);
    }
  };

  const visible = showAll ? ads : ads.slice(0, 4);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", background: T.al, border: `1px solid ${T.accent}40`, borderRadius: 12, marginBottom: 14 }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: `linear-gradient(135deg, #6C3FB5, ${T.accent})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 11 11" fill="none"><path d="M5.5 1L6.5 4.5H10L7.5 6.5 8.5 10 5.5 8 2.5 10 3.5 6.5 1 4.5H4.5L5.5 1Z" fill="#fff"/></svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: T.ad }}>
            {ads.length} ad{ads.length === 1 ? "" : "s"} missing hook or format — AI can tag them automatically
          </div>
          <div style={{ fontSize: 11, color: T.text2, marginTop: 2 }}>
            AI reads ad copy and infers hook + format. Review and confirm before saving.
          </div>
        </div>
        <button onClick={tagAll} disabled={busyAll || ads.length === 0} style={btnStyle({ primary: true, disabled: busyAll || ads.length === 0 })}>
          {busyAll ? "Tagging…" : `⚡ Tag all ${ads.length} with AI`}
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 30, textAlign: "center", color: T.text2 }}>Loading…</div>
      ) : ads.length === 0 ? (
        <div style={{ padding: 30, textAlign: "center", color: T.text2, background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 12 }}>
          All ads in <strong style={{ color: T.text }}>{activeDb?.name}</strong> have a hook and format. Nothing to tag.
        </div>
      ) : (
        <div style={{ background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 14px", borderBottom: `1px solid ${T.border}` }}>
            <span style={{ fontWeight: 500, color: T.text, fontSize: 12 }}>Untagged ads</span>
            <span style={{ fontSize: 10, color: T.text2 }}>— hook or format missing</span>
            <span style={{ marginLeft: "auto", fontSize: 11, color: T.text2 }}>{ads.length} remaining</span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: T.bg3 }}>
                <Th width={65}>Platform</Th>
                <Th>Ad copy</Th>
                <Th width={110}>Hook</Th>
                <Th width={90}>Format</Th>
                <Th width={90}>Action</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((ad) => {
                const platform = String(ad.platform ?? "");
                const platColor = platform.toLowerCase().includes("tiktok") ? "#1a1a2e" : platform.toLowerCase().includes("meta") || platform.toLowerCase().includes("facebook") ? "#1877F2" : platform.toLowerCase().includes("youtube") ? "#cc0000" : T.text2;
                const copy = String(ad.adCopy ?? ad.hookExample ?? ad.description ?? "");
                const hook = String(ad.hookType ?? "");
                const format = String(ad.formatType ?? "");
                return (
                  <tr key={ad.id} style={{ borderTop: `1px solid ${T.border}` }}>
                    <Td><span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: platColor, color: "#fff", fontWeight: 500 }}>{platform || "—"}</span></Td>
                    <Td style={{ color: T.text2, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 320 }}>
                      &ldquo;{copy.slice(0, 90)}{copy.length > 90 ? "…" : ""}&rdquo;
                    </Td>
                    <Td>
                      {hook
                        ? <span style={{ fontSize: 11, background: T.al, color: T.ad, padding: "2px 6px", borderRadius: 4 }}>{hook}</span>
                        : <span style={{ fontSize: 11, color: T.rd, display: "inline-flex", alignItems: "center", gap: 4 }}>
                            <span style={{ width: 5, height: 5, borderRadius: "50%", background: T.red }} />missing
                          </span>}
                    </Td>
                    <Td>
                      {format
                        ? <span style={{ fontSize: 11, background: T.al, color: T.ad, padding: "2px 6px", borderRadius: 4 }}>{format}</span>
                        : <span style={{ fontSize: 11, color: T.rd, display: "inline-flex", alignItems: "center", gap: 4 }}>
                            <span style={{ width: 5, height: 5, borderRadius: "50%", background: T.red }} />missing
                          </span>}
                    </Td>
                    <Td>
                      <button onClick={() => tagOne(ad)} disabled={busyId === ad.id} style={btnStyle({ primary: true, small: true, disabled: busyId === ad.id })}>
                        {busyId === ad.id ? "…" : "Tag with AI"}
                      </button>
                    </Td>
                  </tr>
                );
              })}
              {!showAll && ads.length > 4 && (
                <tr>
                  <td colSpan={5} style={{ padding: 10, textAlign: "center", fontSize: 11, color: T.text2, background: T.bg3, borderTop: `1px solid ${T.border}` }}>
                    {ads.length - 4} more untagged ads —{" "}
                    <span onClick={() => setShowAll(true)} style={{ color: T.accent, cursor: "pointer", textDecoration: "underline" }}>show all</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 12, padding: "12px 14px", background: T.bg3, borderRadius: 10, fontSize: 11, color: T.text2, lineHeight: 1.8 }}>
        <span style={{ fontWeight: 500, color: T.text }}>How AI tagging works:</span> The AI reads each ad's copy and infers the most likely hook type and format from the controlled vocabulary in <code style={{ fontSize: 10, background: T.bg2, padding: "1px 5px", borderRadius: 3 }}>lib/enums.ts</code>. Confidence is shown per tag — low-confidence tags are flagged for manual review. Tags are saved on AI completion.
      </div>
    </div>
  );
}

function Th({ children, width }: { children: React.ReactNode; width?: number }) {
  return <th style={{ width, padding: "8px 12px", textAlign: "left", fontWeight: 500, fontSize: 11, color: T.text2 }}>{children}</th>;
}
function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={{ padding: "8px 12px", verticalAlign: "middle", ...(style ?? {}) }}>{children}</td>;
}

// ── Scrape runner (calls /api/discover) ───────────────────────
async function runScrape({ platformId, keywords, maxResults }: { platformId: string; keywords: string[]; maxResults: number }) {
  const platform = PLATFORMS.find((p) => p.id === platformId);
  if (!platform || !platform.supported) throw new Error(`${platformId} is not supported.`);
  const keyword = keywords.join(" ");
  const res = await fetch("/api/discover", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ platform: platform.id, keyword, maxResults, country: "US" }),
  });
  if (!res.ok) {
    // The server should always return JSON. If it doesn't (HTML 500 from an
    // unhandled exception, gateway timeout, etc.), include the status and a
    // snippet of the body so the surfaced error explains the actual cause.
    const text = await res.text();
    let parsed: { error?: string } | null = null;
    try { parsed = JSON.parse(text); } catch { /* not JSON */ }
    const msg = parsed?.error
      ?? `Scrape failed (HTTP ${res.status}). ${text.slice(0, 200).trim() || "Empty response body."}`;
    throw new Error(msg);
  }
  return res.json();
}

// ── Fast-mode inference (rule-based v1) ───────────────────────
function inferFromText(text: string): {
  platform: string | null;
  keywords: string[];
  maxResults: number;
  hook: string | null;
  format: string | null;
  dateRange: string | null;
} {
  const t = text.toLowerCase();
  // Default to TikTok when no platform is explicitly mentioned. Without a
  // default the "Run" button stays silently disabled for any natural-language
  // query that doesn't name a platform, which reads as "Fast mode is broken".
  const platform =
    /tiktok/.test(t) ? "TikTok" :
    /instagram|insta\b|\big\b/.test(t) ? "Instagram" :
    /meta|facebook/.test(t) ? "Meta" :
    /youtube|yt/.test(t) ? "YouTube" :
    "TikTok";
  const numMatch = t.match(/\b(\d{1,4})\b/);
  const maxResults = numMatch ? Math.max(10, Math.min(500, Number(numMatch[1]))) : 100;
  const hook =
    /problem.?first/.test(t) ? "Problem-first" :
    /curiosity/.test(t)      ? "Curiosity gap" :
    /social.?proof/.test(t)  ? "Social proof" :
    /direct.?offer/.test(t)  ? "Direct offer" :
    /story/.test(t)          ? "Story open" : null;
  const format =
    /ugc/.test(t)           ? "UGC" :
    /talking.?head/.test(t) ? "Talking head" :
    /demo/.test(t)          ? "Product demo" :
    /slideshow/.test(t)     ? "Slideshow" : null;
  const dateRange =
    /last\s*30/.test(t)  ? "last 30 days" :
    /last\s*7/.test(t)   ? "last 7 days"  :
    /last\s*90/.test(t)  ? "last 90 days" : null;

  // Keywords: pull noun-ish words, drop the platform/numbers/filter words
  const stop = new Set([
    "tiktok", "meta", "facebook", "instagram", "youtube", "yt",
    "ads", "ad", "the", "with", "for", "of", "in", "on", "from", "and", "or",
    "find", "get", "scrape", "all", "platforms", "ugc",
    "social", "proof", "curiosity", "gap", "problem", "first", "direct",
    "offer", "story", "open", "talking", "head", "demo", "slideshow",
    "last", "days", "hook", "hooks", "month", "week",
  ]);
  const keywords = Array.from(new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stop.has(w) && !/^\d+$/.test(w))
  )).slice(0, 5);

  return { platform, keywords, maxResults, hook, format, dateRange };
}

// ── Style helpers ─────────────────────────────────────────────
function btnStyle({ primary, danger, small, disabled }: { primary?: boolean; danger?: boolean; small?: boolean; disabled?: boolean }): React.CSSProperties {
  return {
    padding: small ? "5px 10px" : "6px 14px",
    borderRadius: 8,
    fontSize: small ? 11 : 12,
    fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer",
    border: `1px solid ${primary ? T.accent : danger ? T.red : T.border2}`,
    color: primary ? "#fff" : danger ? T.rd : T.text,
    background: primary ? T.accent : T.bg2,
    opacity: disabled ? 0.4 : 1,
    fontFamily: "inherit",
  };
}
function modeBtnStyle(on: boolean): React.CSSProperties {
  return {
    padding: "5px 12px",
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 500,
    border: "none",
    cursor: "pointer",
    background: on ? T.bg2 : "transparent",
    color: on ? T.text : T.text2,
    boxShadow: on ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
    fontFamily: "inherit",
  };
}
function cardStyle(): React.CSSProperties {
  return { background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 12, padding: "12px 14px" };
}
function cardTitleStyle(): React.CSSProperties {
  return { fontSize: 11, fontWeight: 600, color: T.text2, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 };
}
function fieldStyle(): React.CSSProperties {
  return { marginBottom: 10 };
}
function fieldLabelStyle(): React.CSSProperties {
  return { fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: T.text2, marginBottom: 4 };
}
function selectStyle(): React.CSSProperties {
  return {
    width: "100%", padding: "8px 10px", borderRadius: 8,
    border: `1px solid ${T.border2}`, fontSize: 12,
    background: T.bg2, color: T.text, fontFamily: "inherit",
    outline: "none",
  };
}
function chkRowStyle(): React.CSSProperties {
  return { display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: T.text2, padding: "4px 0", cursor: "pointer" };
}
