"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useDb } from "@/lib/db-context";
import type { ValidationSummary } from "@/lib/schema-contract";

// ── Types ──────────────────────────────────────────────────────
type Ad = Record<string, unknown> & { id: string };

// ── Field helpers (mirror Review/Validate) ─────────────────────
const HOOK_TYPES = ["Problem-first", "Curiosity gap", "Social proof", "Direct offer", "Story open"] as const;
const FORMATS    = ["UGC", "Talking head", "Product demo", "Slideshow"] as const;

function strField(ad: Ad, ...keys: string[]): string {
  for (const k of keys) {
    const v = ad[k];
    if (v !== null && v !== undefined && v !== "") return String(v);
  }
  return "";
}
function numField(ad: Ad, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = ad[k];
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}
function dateField(ad: Ad, ...keys: string[]): Date | null {
  for (const k of keys) {
    const v = ad[k];
    if (!v) continue;
    const d = new Date(v as string);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function hookOf(ad: Ad) {
  const h = strField(ad, "hookType");
  return HOOK_TYPES.find((t) => t.toLowerCase() === h.toLowerCase()) ?? h ?? "";
}
function formatOf(ad: Ad) {
  const f = strField(ad, "formatType");
  return FORMATS.find((t) => t.toLowerCase() === f.toLowerCase()) ?? f ?? "";
}
function scoreOf(ad: Ad) {
  return numField(ad, "overallUsefulnessScore", "overallScore");
}
function copyOf(ad: Ad) {
  return strField(ad, "adCopy", "hookExample", "description");
}
function platformOf(ad: Ad) {
  return strField(ad, "platform");
}

// ── Date helpers ───────────────────────────────────────────────
function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

// ── Small SVG charts ───────────────────────────────────────────
function LineChart({ points, width, height, color = "#534AB7" }: {
  points: { date: Date; value: number }[];
  width: number;
  height: number;
  color?: string;
}) {
  const pad = { l: 28, r: 12, t: 14, b: 22 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const maxV = Math.max(1, ...points.map((p) => p.value));
  const xs = (i: number) => pad.l + (points.length <= 1 ? w / 2 : (i / (points.length - 1)) * w);
  const ys = (v: number) => pad.t + h - (v / maxV) * h;
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${xs(i).toFixed(1)} ${ys(p.value).toFixed(1)}`).join(" ");
  const areaPath = `${path} L ${xs(points.length - 1).toFixed(1)} ${(pad.t + h).toFixed(1)} L ${xs(0).toFixed(1)} ${(pad.t + h).toFixed(1)} Z`;
  const ticks = [0, Math.round(maxV / 2), maxV];
  const labelEvery = Math.max(1, Math.ceil(points.length / 7));

  return (
    <svg width={width} height={height} role="img" aria-label="Collection over time">
      {ticks.map((t) => (
        <line key={t} x1={pad.l} x2={pad.l + w} y1={ys(t)} y2={ys(t)} stroke="var(--color-border-tertiary)" strokeDasharray="2 3" />
      ))}
      {ticks.map((t) => (
        <text key={t} x={pad.l - 6} y={ys(t) + 3} textAnchor="end" fontSize="9" fill="var(--color-text-tertiary)">{t}</text>
      ))}
      {points.map((p, i) =>
        i % labelEvery === 0 ? (
          <text key={i} x={xs(i)} y={pad.t + h + 14} textAnchor="middle" fontSize="9" fill="var(--color-text-tertiary)">
            {p.date.getDate()}
          </text>
        ) : null
      )}
      <path d={areaPath} fill={color} fillOpacity="0.10" />
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <circle key={i} cx={xs(i)} cy={ys(p.value)} r="2.5" fill={color} />
      ))}
    </svg>
  );
}

function Donut({ slices, size }: {
  slices: { value: number; color: string }[];
  size: number;
}) {
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-background-tertiary)" strokeWidth="8" />
      {slices.map((s, i) => {
        const len = (s.value / total) * c;
        const dashArray = `${len} ${c - len}`;
        const seg = (
          <circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth="8"
            strokeDasharray={dashArray}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            strokeLinecap="butt"
          />
        );
        offset += len;
        return seg;
      })}
    </svg>
  );
}

// ── Page ───────────────────────────────────────────────────────
export default function InsightsPage() {
  const { activeDb } = useDb();
  const dbId = activeDb?.id ?? "";

  const [ads, setAds] = useState<Ad[]>([]);
  const [summary, setSummary] = useState<ValidationSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!dbId) { setAds([]); setSummary(null); return; }
    setLoading(true);
    try {
      const [adsRes, valRes] = await Promise.all([
        fetch(`/api/ads?databaseId=${dbId}`),
        fetch(`/api/export?databaseId=${dbId}&summary=1`),
      ]);
      const adsData = await adsRes.json() as { ads: Ad[] };
      const valData = await valRes.json() as { summary: ValidationSummary };
      setAds(adsData.ads ?? []);
      setSummary(valData.summary ?? null);
    } finally {
      setLoading(false);
    }
  }, [dbId]);

  useEffect(() => { load(); }, [load]);

  // ── Derived stats ────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = ads.length;
    const ready = summary ? summary.clean : 0;
    const readyPct = total ? Math.round((ready / total) * 100) : 0;
    const needsFixing = summary ? summary.blocked + summary.withWarnings : 0;
    const scores = ads.map(scoreOf).filter((n): n is number => n !== null);
    const avgScore = scores.length ? scores.reduce((s, n) => s + n, 0) / scores.length : null;

    const sevenDays = Date.now() - 7 * 86400 * 1000;
    const newThisWeek = ads.filter((a) => {
      const d = dateField(a, "createdAt", "firstSeen", "scrapedAt");
      return d && d.getTime() >= sevenDays;
    }).length;

    let scoreDelta: number | null = null;
    const scored = ads
      .map((a) => ({ ad: a, s: scoreOf(a), d: dateField(a, "createdAt", "firstSeen", "scrapedAt") }))
      .filter((x) => x.s !== null && x.d) as { ad: Ad; s: number; d: Date }[];
    scored.sort((a, b) => b.d.getTime() - a.d.getTime());
    if (scored.length >= 4) {
      const top = scored.slice(0, Math.min(10, Math.floor(scored.length / 2)));
      const rest = scored.slice(top.length, top.length * 2);
      const a = top.reduce((s, x) => s + x.s, 0) / top.length;
      const b = rest.reduce((s, x) => s + x.s, 0) / rest.length;
      scoreDelta = Math.round((a - b) * 10) / 10;
    }

    return { total, ready, readyPct, needsFixing, avgScore, newThisWeek, scoreDelta };
  }, [ads, summary]);

  // ── Collection over time (last 14 days) ──────────────────────
  const series = useMemo(() => {
    const days: { date: Date; value: number }[] = [];
    const today = startOfDay(new Date());
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      days.push({ date: d, value: 0 });
    }
    const idx = new Map(days.map((d, i) => [dayKey(d.date), i]));
    for (const a of ads) {
      const d = dateField(a, "createdAt", "firstSeen", "scrapedAt");
      if (!d) continue;
      const key = dayKey(startOfDay(d));
      const i = idx.get(key);
      if (i !== undefined) days[i].value += 1;
    }
    return days;
  }, [ads]);

  // ── Hook performance ─────────────────────────────────────────
  const hookPerf = useMemo(() => {
    const byHook: Record<string, { sum: number; count: number; scored: number }> = {};
    for (const a of ads) {
      const h = hookOf(a);
      if (!h) continue;
      const s = scoreOf(a);
      if (!byHook[h]) byHook[h] = { sum: 0, count: 0, scored: 0 };
      byHook[h].count += 1;
      if (s !== null) { byHook[h].sum += s; byHook[h].scored += 1; }
    }
    return HOOK_TYPES
      .map((h) => ({
        hook: h,
        avg: byHook[h]?.scored ? byHook[h].sum / byHook[h].scored : null,
        count: byHook[h]?.count ?? 0,
      }))
      .filter((row) => row.count > 0)
      .sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));
  }, [ads]);

  const hookMaxAvg = useMemo(() => Math.max(0.001, ...hookPerf.map((h) => h.avg ?? 0)), [hookPerf]);

  // ── Top ads ──────────────────────────────────────────────────
  const topAds = useMemo(() => {
    return [...ads]
      .map((a) => ({ ad: a, s: scoreOf(a) }))
      .filter((x) => x.s !== null)
      .sort((a, b) => (b.s as number) - (a.s as number))
      .slice(0, 3);
  }, [ads]);

  // ── Coverage gaps (hook × format combos with < 3 ads) ───────
  const coverageGaps = useMemo(() => {
    const have = new Map<string, number>();
    for (const a of ads) {
      const h = hookOf(a);
      const f = formatOf(a);
      if (!h || !f) continue;
      const key = `${h} · ${f}`;
      have.set(key, (have.get(key) ?? 0) + 1);
    }
    const combos: { key: string; count: number }[] = [];
    for (const h of HOOK_TYPES) {
      for (const f of FORMATS) {
        const k = `${h} · ${f}`;
        const c = have.get(k) ?? 0;
        if (c < 3) combos.push({ key: k, count: c });
      }
    }
    return combos.sort((a, b) => a.count - b.count).slice(0, 6);
  }, [ads]);

  // ── Render ───────────────────────────────────────────────────
  if (!dbId) {
    return (
      <div className="card" style={{ padding: 20, fontSize: 13, color: "var(--color-text-secondary)" }}>
        Select a database from the sidebar to view analytics.
      </div>
    );
  }

  return (
    <div>
      {/* ── Header ────────────────────────────────────────────── */}
      <div style={{ marginBottom: 16, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em" }}>Analytics</h2>
          <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 3 }}>
            <strong>{activeDb?.name}</strong> · dataset health and creative coverage
          </p>
        </div>
        <button className="btn btn-sm" onClick={load} disabled={loading}>
          {loading ? "Loading…" : "↻ Refresh"}
        </button>
      </div>

      {/* ── 4 stat cards ──────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10, marginBottom: 12 }}>
        <StatCard
          label="Total ads"
          value={stats.total.toLocaleString()}
          sub={stats.newThisWeek > 0 ? `+${stats.newThisWeek} this week` : "—"}
          tone="primary"
        />
        <StatCard
          label="Export-ready"
          value={stats.ready.toLocaleString()}
          sub={stats.total ? `${stats.readyPct}% of dataset` : "—"}
          tone="ok"
        />
        <StatCard
          label="Avg score"
          value={stats.avgScore !== null ? stats.avgScore.toFixed(1) : "—"}
          sub={stats.scoreDelta !== null ? `${stats.scoreDelta >= 0 ? "↑" : "↓"} ${Math.abs(stats.scoreDelta).toFixed(1)} vs last batch` : "—"}
          tone="primary"
        />
        <StatCard
          label="Needs fixing"
          value={stats.needsFixing.toLocaleString()}
          sub={summary && summary.blocked > 0 ? "blocking export" : "—"}
          tone={stats.needsFixing > 0 ? "err" : "ok"}
        />
      </div>

      {/* ── Collection over time ──────────────────────────────── */}
      <div className="card" style={{ padding: "14px 16px", marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 2 }}>
          Collection over time
        </div>
        <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 8 }}>
          Daily ads collected — last 14 days
        </div>
        <LineChart points={series} width={1040} height={150} />
      </div>

      {/* ── Hook performance + Dataset health ─────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        <div className="card" style={{ padding: "14px 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 2 }}>
            Hook performance
          </div>
          <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 12 }}>
            Avg score · count
          </div>
          {hookPerf.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>No scored ads with hook types yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {hookPerf.map((row) => {
                const pct = row.avg ? (row.avg / hookMaxAvg) * 100 : 0;
                return (
                  <div key={row.hook} style={{ display: "grid", gridTemplateColumns: "120px 1fr 60px 36px", alignItems: "center", gap: 8, fontSize: 12 }}>
                    <span>{row.hook}</span>
                    <div style={{ height: 8, background: "var(--color-background-tertiary)", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: "#534AB7" }} />
                    </div>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600 }}>
                      {row.avg !== null ? row.avg.toFixed(1) : "—"}
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-text-tertiary)", textAlign: "right" }}>
                      {row.count}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card" style={{ padding: "14px 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 2 }}>
            Dataset health
          </div>
          <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 12 }}>
            Export readiness breakdown
          </div>
          {summary ? (
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ position: "relative" }}>
                <Donut
                  size={110}
                  slices={[
                    { value: summary.clean,         color: "#639922" },
                    { value: summary.withWarnings,  color: "#EF9F27" },
                    { value: summary.blocked,       color: "#E24B4A" },
                  ]}
                />
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 16, fontWeight: 600 }}>{stats.readyPct}%</span>
                  <span style={{ fontSize: 9, color: "var(--color-text-tertiary)" }}>ready</span>
                </div>
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
                <HealthRow color="#639922" label="Ready"      value={summary.clean} />
                <HealthRow color="#EF9F27" label="Incomplete" value={summary.withWarnings} />
                <HealthRow color="#E24B4A" label="Invalid"    value={summary.blocked} />
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>No validation summary yet.</div>
          )}
        </div>
      </div>

      {/* ── Top ads + Coverage gaps ──────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div className="card" style={{ padding: "14px 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 2 }}>
            Top ads
          </div>
          <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 12 }}>
            Highest scoring this batch
          </div>
          {topAds.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>No scored ads yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {topAds.map(({ ad, s }, i) => (
                <div key={ad.id} style={{ display: "grid", gridTemplateColumns: "18px 1fr 40px", alignItems: "center", gap: 10, fontSize: 12 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-text-tertiary)" }}>{i + 1}</span>
                  <div>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      &ldquo;{copyOf(ad).slice(0, 60) || "(no copy)"}{copyOf(ad).length > 60 ? "…" : ""}&rdquo;
                    </div>
                    <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginTop: 2, display: "flex", gap: 6 }}>
                      <span>{platformOf(ad) || "—"}</span>
                      {hookOf(ad) && <><span>·</span><span>{hookOf(ad)}</span></>}
                    </div>
                  </div>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, textAlign: "right" }}>
                    {(s as number).toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card" style={{ padding: "14px 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 2 }}>
            Coverage gaps
          </div>
          <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 12 }}>
            Hook × format combinations to collect next
          </div>
          {coverageGaps.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>Full coverage — every hook×format combo has 3+ ads.</div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {coverageGaps.map((c) => (
                <span
                  key={c.key}
                  style={{
                    fontSize: 11,
                    padding: "5px 10px",
                    borderRadius: 999,
                    background: c.count === 0 ? "#FFF0EC" : "#FFF8E8",
                    color: c.count === 0 ? "#BF4A20" : "#854F0B",
                    border: "1px solid",
                    borderColor: c.count === 0 ? "#F5C6BB" : "#F1E2B5",
                  }}
                >
                  {c.key} · {c.count}
                </span>
              ))}
            </div>
          )}
          <div style={{ marginTop: 12, fontSize: 11, color: "var(--color-text-tertiary)" }}>
            <Link href="/collect" style={{ color: "var(--color-accent)" }}>Run a scrape →</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────
function StatCard({ label, value, sub, tone }: {
  label: string;
  value: string;
  sub: string;
  tone: "primary" | "ok" | "err";
}) {
  const valColor = tone === "ok" ? "#3B6D11" : tone === "err" ? "#A32D2D" : "var(--color-text-primary)";
  const accentBg = tone === "ok" ? "#EAF3DE" : tone === "err" ? "#FCEBEB" : "#EEEDFE";
  return (
    <div className="card" style={{ padding: "12px 14px", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: accentBg }} />
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-text-tertiary)", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 600, color: valColor, fontFamily: "var(--font-mono)" }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function HealthRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block" }} />
      <span style={{ color: "var(--color-text-secondary)", flex: 1 }}>{label}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 500 }}>{value}</span>
    </div>
  );
}
