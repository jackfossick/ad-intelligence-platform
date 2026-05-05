"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useDb } from "@/lib/db-context";
import { normalise, scoreBadgeClass, platformBadgeClass, getYouTubeId } from "@/lib/normalise";
import AdPanel from "@/components/AdPanel";

type Ad = Record<string, unknown>;

const PAGE_SIZE = 25;

// ── Platform display config ───────────────────────────────────
const PLATFORM_ICONS: Record<string, string> = {
  tiktok: "♪", facebook: "f", instagram: "◉", youtube: "▶",
  meta: "f", pinterest: "P", snapchat: "◎", twitter: "𝕏",
};
const PLATFORM_COLORS: Record<string, string> = {
  tiktok: "#000000", facebook: "#1877F2", instagram: "#E1306C",
  youtube: "#FF0000", meta: "#1877F2", pinterest: "#E60023",
  snapchat: "#FFFC00", twitter: "#1DA1F2",
};

// ── Thumbnail cell ─────────────────────────────────────────────
function ThumbnailCell({ ad }: { ad: Ad }) {
  const n = normalise(ad);
  const ytId = getYouTubeId(n._url);
  const platform = (n._platform || "").toLowerCase();
  const [imgError, setImgError] = useState(false);

  if (ytId && !imgError) {
    return (
      <div className="thumb">
        <img
          src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`}
          alt=""
          onError={() => setImgError(true)}
        />
        <div style={{
          position: "absolute", bottom: 3, right: 3,
          background: "rgba(0,0,0,0.7)", borderRadius: 2,
          padding: "1px 4px", fontSize: 9, color: "white", fontWeight: 600,
        }}>YT</div>
      </div>
    );
  }

  const bg = PLATFORM_COLORS[platform] || "#6B7280";
  const icon = PLATFORM_ICONS[platform] || "▶";
  const isLight = platform === "snapchat";

  return (
    <div className="thumb">
      <div
        className="thumb-placeholder"
        style={{ background: bg + "22", color: bg }}
      >
        <div style={{ fontSize: 18, opacity: 0.7 }}>{icon}</div>
      </div>
    </div>
  );
}

// ── Platform cell with icon + badge ──────────────────────────
function PlatformCell({ platform }: { platform: string | null }) {
  if (!platform) return <span style={{ color: "var(--color-text-tertiary)" }}>—</span>;
  const key = platform.toLowerCase();
  const bg = PLATFORM_COLORS[key];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      {bg && (
        <div style={{
          width: 16, height: 16, borderRadius: 4,
          background: bg, display: "flex", alignItems: "center",
          justifyContent: "center", fontSize: 9, color: "white", fontWeight: 700, flexShrink: 0,
        }}>
          {(PLATFORM_ICONS[key] || "•")}
        </div>
      )}
      <span className={`badge ${platformBadgeClass(platform)}`}>{platform}</span>
    </div>
  );
}

// ── Score cell ────────────────────────────────────────────────
function ScoreCell({ ad }: { ad: Ad }) {
  const n = normalise(ad);
  if (n._score === null) return <span className="score-pill score-none">—</span>;
  return (
    <span className={`score-pill ${scoreBadgeClass(n._score)}`}>
      {Math.round(n._score)}
    </span>
  );
}

// ── Link cell ─────────────────────────────────────────────────
function LinkCell({ ad }: { ad: Ad }) {
  const n = normalise(ad);
  if (n._linkType === "none") return <span style={{ color: "var(--color-text-tertiary)", fontSize: 11 }}>—</span>;
  const label = n._linkType === "search" ? "Search" : n._linkType === "youtube" ? "Watch" : "Open";
  const icon  = n._linkType === "search" ? "🔍" : n._linkType === "youtube" ? "▶" : "↗";
  const color = n._linkType === "search" ? "#92400E" : "var(--color-accent-dark)";
  return (
    <a
      href={n._url!}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      style={{ color, fontSize: 11, fontWeight: 500, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 3 }}
    >
      {icon} {label}
    </a>
  );
}

// ── Sort header ───────────────────────────────────────────────
function SortTh({ label, field, sortCol, sortDir, onSort, style: extraStyle }: {
  label: string; field: string;
  sortCol: string; sortDir: "asc" | "desc";
  onSort: (f: string) => void;
  style?: React.CSSProperties;
}) {
  const active = sortCol === field;
  return (
    <th
      onClick={() => onSort(field)}
      style={{ cursor: "pointer", ...extraStyle }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {label}
        {active ? (
          <span style={{ color: "var(--color-accent)", fontSize: 9 }}>
            {sortDir === "asc" ? "▲" : "▼"}
          </span>
        ) : (
          <span style={{ color: "var(--color-border-secondary)", fontSize: 9 }}>⇅</span>
        )}
      </div>
    </th>
  );
}

// ── Filter chip select ────────────────────────────────────────
function FilterChip({ label, value, options, onChange }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`filter-select${value ? " active" : ""}`}
    >
      <option value="">{label}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

// ── Smart pagination ──────────────────────────────────────────
function getPageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "…", total];
  if (current >= total - 3) return [1, "…", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "…", current - 1, current, current + 1, "…", total];
}

// ── Review status dot ─────────────────────────────────────────
function ReviewDot({ status }: { status: string }) {
  const map: Record<string, string> = {
    reviewed: "#16A34A",
    unreviewed: "#F59E0B",
    flagged: "#DC2626",
    archived: "#9CA3AF",
  };
  const color = map[status?.toLowerCase()] || "#9CA3AF";
  return (
    <span title={status} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--color-text-secondary)" }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} />
      {status || "—"}
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function AdsPage() {
  const { activeDb } = useDb();

  const [allAds,   setAllAds]   = useState<Ad[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [selected, setSelected] = useState<Ad | null>(null);

  // Filters
  const [search,        setSearch]        = useState("");
  const [filterCat,     setFilterCat]     = useState("");
  const [filterPlat,    setFilterPlat]    = useState("");
  const [filterHook,    setFilterHook]    = useState("");
  const [filterFormat,  setFilterFormat]  = useState("");
  const [filterFunnel,  setFilterFunnel]  = useState("");
  const [filterReview,  setFilterReview]  = useState("");
  const [filterScore,   setFilterScore]   = useState(""); // "high" | "mid" | "low" | "unscored"

  // Sort
  const [sortCol, setSortCol] = useState("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Pagination
  const [page, setPage] = useState(1);

  // View mode
  const [viewMode, setViewMode] = useState<"table" | "card">("table");

  const fetchAds = useCallback(async () => {
    if (!activeDb) return;
    setLoading(true); setPage(1); setSelected(null);
    try {
      const res = await fetch(`/api/ads?databaseId=${activeDb.id}`);
      const data = await res.json();
      setAllAds(data.ads ?? []);
    } finally { setLoading(false); }
  }, [activeDb]);

  useEffect(() => { fetchAds(); }, [fetchAds]);

  // ── Distinct filter values ──────────────────────────────────
  const cats    = useMemo(() => [...new Set(allAds.map((a) => String(a.primaryCategory || a.segment || "")).filter(Boolean))].sort(), [allAds]);
  const plats   = useMemo(() => [...new Set(allAds.map((a) => String(a.platform || "")).filter(Boolean))].sort(), [allAds]);
  const hooks   = useMemo(() => [...new Set(allAds.map((a) => String(a.hookType || "")).filter(Boolean))].sort(), [allAds]);
  const formats = useMemo(() => [...new Set(allAds.map((a) => String(a.formatType || a.avatarOrCreativeType || "")).filter(Boolean))].sort(), [allAds]);
  const funnels = useMemo(() => [...new Set(allAds.map((a) => String(a.funnelStage || "")).filter(Boolean))].sort(), [allAds]);
  const reviews = useMemo(() => [...new Set(allAds.map((a) => String(a.reviewStatus || "")).filter(Boolean))].sort(), [allAds]);

  // ── Filter ──────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return allAds.filter((a) => {
      if (q) {
        const haystack = [a.primaryCategory, a.segment, a.hookType, a.brandOrCreator,
          a.platform, a.hookExample, a.whyItWorks, a.notes, a.formatType, a.creativeAngle]
          .map(String).join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      const cat = String(a.primaryCategory || a.segment || "");
      if (filterCat    && cat !== filterCat) return false;
      if (filterPlat   && a.platform !== filterPlat) return false;
      if (filterHook   && a.hookType !== filterHook) return false;
      const fmt = String(a.formatType || a.avatarOrCreativeType || "");
      if (filterFormat && fmt !== filterFormat) return false;
      if (filterFunnel && a.funnelStage !== filterFunnel) return false;
      if (filterReview && a.reviewStatus !== filterReview) return false;
      if (filterScore) {
        const score = normalise(a)._score;
        if (filterScore === "high"    && (score === null || score < 75)) return false;
        if (filterScore === "mid"     && (score === null || score < 50 || score >= 75)) return false;
        if (filterScore === "low"     && (score === null || score >= 50)) return false;
        if (filterScore === "unscored" && score !== null) return false;
      }
      return true;
    });
  }, [allAds, search, filterCat, filterPlat, filterHook, filterFormat, filterFunnel, filterReview, filterScore]);

  // ── Sort ────────────────────────────────────────────────────
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av: unknown = a[sortCol];
      let bv: unknown = b[sortCol];
      if (sortCol === "_score") { av = normalise(a)._score ?? -1; bv = normalise(b)._score ?? -1; }
      if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
      return sortDir === "asc"
        ? String(av ?? "").localeCompare(String(bv ?? ""))
        : String(bv ?? "").localeCompare(String(av ?? ""));
    });
  }, [filtered, sortCol, sortDir]);

  // ── Paginate ────────────────────────────────────────────────
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const paged = useMemo(() => sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [sorted, page]);

  const handleSort = (field: string) => {
    if (sortCol === field) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortCol(field); setSortDir("desc"); }
    setPage(1);
  };

  const resetFilters = () => {
    setSearch(""); setFilterCat(""); setFilterPlat(""); setFilterHook("");
    setFilterFormat(""); setFilterFunnel(""); setFilterReview(""); setFilterScore("");
    setPage(1);
  };

  const anyFilter = !!(search || filterCat || filterPlat || filterHook || filterFormat || filterFunnel || filterReview || filterScore);
  const activeFilterCount = [search, filterCat, filterPlat, filterHook, filterFormat, filterFunnel, filterReview, filterScore].filter(Boolean).length;
  const pageNums = getPageNumbers(page, totalPages);

  return (
    <div style={{ position: "relative" }}>

      {/* ── Page header ─────────────────────────────────────── */}
      <div style={{ marginBottom: 20, display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em" }}>Ad Library</h2>
          <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 3 }}>
            {anyFilter
              ? <><strong style={{ color: "var(--color-text-primary)" }}>{filtered.length}</strong> results · filtered from {allAds.length} total</>
              : <><strong style={{ color: "var(--color-text-primary)" }}>{allAds.length}</strong> ads in {activeDb?.name ?? "…"}</>
            }
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* View toggle */}
          <div style={{ display: "flex", border: "1px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", overflow: "hidden", boxShadow: "var(--shadow-xs)" }}>
            {(["table", "card"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                style={{
                  padding: "5px 10px", fontSize: 11, fontFamily: "var(--font-sans)",
                  border: "none", cursor: "pointer", fontWeight: 500,
                  background: viewMode === mode ? "var(--color-accent)" : "var(--color-background-primary)",
                  color: viewMode === mode ? "white" : "var(--color-text-secondary)",
                  transition: "all 0.12s",
                }}
              >
                {mode === "table" ? "≡ Table" : "⊞ Cards"}
              </button>
            ))}
          </div>
          <Link href="/ads/new" className="btn btn-primary btn-sm">+ Add Ad</Link>
        </div>
      </div>

      {/* ── Search + filter bar ─────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {/* Search */}
        <div style={{ position: "relative", flex: 1, minWidth: 200, maxWidth: 320 }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "var(--color-text-tertiary)", pointerEvents: "none" }}>⌕</span>
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search ads, hooks, brands…"
            style={{ paddingLeft: 28, borderRadius: 20, fontSize: 12, height: 32, border: "1px solid var(--color-border-secondary)", boxShadow: "var(--shadow-xs)" }}
          />
        </div>

        {/* Filter chips */}
        <FilterChip label="All categories" value={filterCat}    options={cats}    onChange={(v) => { setFilterCat(v);    setPage(1); }} />
        <FilterChip label="All platforms"  value={filterPlat}   options={plats}   onChange={(v) => { setFilterPlat(v);   setPage(1); }} />
        <FilterChip label="All hooks"      value={filterHook}   options={hooks}   onChange={(v) => { setFilterHook(v);   setPage(1); }} />
        <FilterChip label="All formats"    value={filterFormat}  options={formats}  onChange={(v) => { setFilterFormat(v);  setPage(1); }} />
        <FilterChip label="Funnel stage"   value={filterFunnel}  options={funnels}  onChange={(v) => { setFilterFunnel(v);  setPage(1); }} />
        <FilterChip label="Review status"  value={filterReview}  options={reviews}  onChange={(v) => { setFilterReview(v);  setPage(1); }} />
        <FilterChip
          label="Score"
          value={filterScore}
          options={["high (75+)", "mid (50–74)", "low (<50)", "unscored"]}
          onChange={(v) => { setFilterScore(v.split(" ")[0]); setPage(1); }}
        />

        {anyFilter && (
          <button className="btn btn-sm" onClick={resetFilters} style={{ borderRadius: 20, color: "var(--color-text-secondary)" }}>
            ✕ Clear {activeFilterCount > 1 ? `(${activeFilterCount})` : ""}
          </button>
        )}
      </div>

      {/* ── Table or Card view ───────────────────────────────── */}
      {viewMode === "table" ? (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            {loading ? (
              <div className="empty-state"><p>Loading…</p></div>
            ) : paged.length === 0 ? (
              <div className="empty-state">
                <p style={{ fontSize: 13, marginBottom: 12 }}>No ads match your filters.</p>
                {anyFilter && <button className="btn btn-sm" onClick={resetFilters}>Clear filters</button>}
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 28 }}>#</th>
                    <th style={{ width: 80 }}>Preview</th>
                    <SortTh label="Brand / Category" field="primaryCategory" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                    <SortTh label="Platform"  field="platform"   sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                    <SortTh label="Hook"      field="hookType"   sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                    <SortTh label="Format"    field="formatType" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                    <SortTh label="Score"     field="_score"     sortCol={sortCol} sortDir={sortDir} onSort={handleSort} style={{ width: 64 }} />
                    <th>Review</th>
                    <th>Link</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((ad, i) => {
                    const n = normalise(ad);
                    const isSelected = !!(selected && selected.id === ad.id);
                    const rowNum = (page - 1) * PAGE_SIZE + i + 1;
                    const cat = (n._cat || "—") as string;
                    const brand = (ad.brandOrCreator || ad.brand || "") as string;

                    return (
                      <tr
                        key={ad.id as string}
                        onClick={() => setSelected(isSelected ? null : ad)}
                        className={isSelected ? "selected" : ""}
                      >
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-text-tertiary)", width: 28 }}>
                          {rowNum}
                        </td>
                        <td style={{ width: 80, padding: "7px 10px" }}>
                          <ThumbnailCell ad={ad} />
                        </td>
                        <td style={{ maxWidth: 180 }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            <span className="badge badge-blue" style={{ alignSelf: "flex-start", fontSize: 10 }}>{cat}</span>
                            {brand && (
                              <span style={{ fontSize: 11, color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>
                                {brand}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <PlatformCell platform={n._platform} />
                        </td>
                        <td style={{ maxWidth: 140 }}>
                          {n._hook
                            ? <span className="chip" style={{ fontSize: 10 }}>{n._hook}</span>
                            : <span style={{ color: "var(--color-text-tertiary)" }}>—</span>
                          }
                        </td>
                        <td style={{ color: "var(--color-text-secondary)", fontSize: 11 }}>
                          {(ad.formatType as string) || (ad.avatarOrCreativeType as string) || "—"}
                        </td>
                        <td style={{ width: 64 }}>
                          <ScoreCell ad={ad} />
                        </td>
                        <td>
                          <ReviewDot status={ad.reviewStatus as string} />
                        </td>
                        <td>
                          <LinkCell ad={ad} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* ── Pagination ───────────────────────────────────── */}
          {totalPages > 1 && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8, padding: "10px 16px",
              borderTop: "1px solid var(--color-border-tertiary)",
              fontSize: 12, color: "var(--color-text-secondary)",
              background: "var(--color-background-secondary)",
            }}>
              <span style={{ marginRight: "auto", fontSize: 11, color: "var(--color-text-tertiary)" }}>
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sorted.length)} of {sorted.length}
              </span>
              <button className="page-btn" onClick={() => setPage((p) => p - 1)} disabled={page === 1}>‹</button>
              {pageNums.map((n, i) =>
                n === "…"
                  ? <span key={`ellipsis-${i}`} style={{ fontSize: 12, color: "var(--color-text-tertiary)", padding: "0 4px" }}>…</span>
                  : <button
                      key={n}
                      className={`page-btn${page === n ? " active" : ""}`}
                      onClick={() => setPage(n as number)}
                    >
                      {n}
                    </button>
              )}
              <button className="page-btn" onClick={() => setPage((p) => p + 1)} disabled={page === totalPages}>›</button>
            </div>
          )}
        </div>
      ) : (
        /* ── Card grid view ───────────────────────────────── */
        <>
          {loading ? (
            <div className="empty-state"><p>Loading…</p></div>
          ) : paged.length === 0 ? (
            <div className="empty-state">
              <p style={{ fontSize: 13, marginBottom: 12 }}>No ads match your filters.</p>
              {anyFilter && <button className="btn btn-sm" onClick={resetFilters}>Clear filters</button>}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12, marginBottom: 16 }}>
              {paged.map((ad) => {
                const n = normalise(ad);
                const isSelected = !!(selected && selected.id === ad.id);
                return (
                  <div
                    key={ad.id as string}
                    onClick={() => setSelected(isSelected ? null : ad)}
                    style={{
                      background: "var(--color-background-primary)",
                      border: `1px solid ${isSelected ? "var(--color-accent)" : "var(--color-border-tertiary)"}`,
                      borderRadius: "var(--border-radius-lg)",
                      overflow: "hidden",
                      cursor: "pointer",
                      boxShadow: isSelected ? "0 0 0 2px var(--color-accent-light)" : "var(--shadow-sm)",
                      transition: "box-shadow 0.12s, border-color 0.12s",
                    }}
                  >
                    {/* Card thumbnail */}
                    <div style={{ width: "100%", aspectRatio: "16/9", background: "var(--color-background-tertiary)", position: "relative", overflow: "hidden" }}>
                      <ThumbnailCell ad={ad} />
                      <div style={{ position: "absolute", top: 6, right: 6 }}>
                        <ScoreCell ad={ad} />
                      </div>
                    </div>
                    {/* Card body */}
                    <div style={{ padding: "10px 12px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, gap: 6 }}>
                        <span className="badge badge-blue" style={{ fontSize: 10 }}>{n._cat || "—"}</span>
                        <PlatformCell platform={n._platform} />
                      </div>
                      {n._hook && (
                        <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 4 }}>
                          <span className="chip" style={{ fontSize: 10 }}>{n._hook}</span>
                        </div>
                      )}
                      {!!(ad.brandOrCreator || ad.brand) && (
                        <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {String(ad.brandOrCreator || ad.brand)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {/* Pagination for card view */}
          {totalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 16 }}>
              <button className="page-btn" onClick={() => setPage((p) => p - 1)} disabled={page === 1}>‹</button>
              {pageNums.map((n, i) =>
                n === "…"
                  ? <span key={`e-${i}`} style={{ fontSize: 12, color: "var(--color-text-tertiary)", padding: "0 4px" }}>…</span>
                  : <button key={n} className={`page-btn${page === n ? " active" : ""}`} onClick={() => setPage(n as number)}>{n}</button>
              )}
              <button className="page-btn" onClick={() => setPage((p) => p + 1)} disabled={page === totalPages}>›</button>
            </div>
          )}
        </>
      )}

      {/* ── Detail panel ──────────────────────────────────────── */}
      {selected && (
        <AdPanel
          ad={selected}
          onClose={() => setSelected(null)}
          onUpdate={(id, fields) => {
            setAllAds((prev) => prev.map((a) =>
              (a.id as string) === id ? { ...a, ...fields } : a
            ));
            setSelected((prev) => prev ? { ...prev, ...fields } : prev);
          }}
        />
      )}
    </div>
  );
}
