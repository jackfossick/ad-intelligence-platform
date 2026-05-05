"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useDb } from "@/lib/db-context";

type Ad = Record<string, unknown>;

// ── Helpers ───────────────────────────────────────────────────
function countBy(ads: Ad[], key: (a: Ad) => string | null): { label: string; count: number }[] {
  const buckets: Record<string, number> = {};
  ads.forEach((a) => {
    const k = key(a);
    if (!k) return;
    buckets[k] = (buckets[k] || 0) + 1;
  });
  return Object.entries(buckets)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

function avgNums(nums: number[]): number | null {
  if (!nums.length) return null;
  return Math.round((nums.reduce((s, n) => s + n, 0) / nums.length) * 10) / 10;
}

function numField(ad: Ad, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = ad[k];
    const n = Number(v);
    if (!isNaN(n) && v !== null && v !== undefined && v !== "") return n;
  }
  return null;
}

function hasLink(ad: Ad): boolean {
  return !!(ad.adLink || ad.referenceUrl || ad.creativeVideoUrl || ad.creative_video_url);
}

// ── Simple bar ────────────────────────────────────────────────
function Bar({ label, count, max }: { label: string; count: number; max: number }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
      <span style={{ width: 180, fontSize: 12, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0 }} title={label}>
        {label}
      </span>
      <div style={{ flex: 1, height: 6, background: "var(--color-background-tertiary, #F3F4F6)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "var(--color-accent)", borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", width: 28, textAlign: "right", flexShrink: 0 }}>{count}</span>
    </div>
  );
}

// ── Score bar ─────────────────────────────────────────────────
function ScoreBar({ label, value }: { label: string; value: number | null }) {
  if (value === null) return null;
  const pct = Math.round((value / 10) * 100);
  const color = value >= 7 ? "#16A34A" : value >= 5 ? "#D97706" : "#DC2626";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
      <span style={{ width: 180, fontSize: 12, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0 }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 6, background: "var(--color-background-tertiary, #F3F4F6)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color, width: 32, textAlign: "right", flexShrink: 0 }}>
        {value.toFixed(1)}
      </span>
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-title">{title}</div>
      {children}
    </div>
  );
}

function Empty() {
  return <p style={{ fontSize: 12, color: "var(--color-text-tertiary)", fontStyle: "italic" }}>Not enough data yet.</p>;
}

// ── Stat card ─────────────────────────────────────────────────
function StatCard({ label, value, sub, color }: { label: string; value: number | string; sub?: string; color?: string }) {
  return (
    <div style={{
      padding: "14px 16px", background: "var(--color-background-primary)",
      border: "1px solid var(--color-border-tertiary)",
      borderRadius: "var(--border-radius-lg)",
    }}>
      <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", color: color || "var(--color-text-primary)" }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────
export default function InsightsPage() {
  const { activeDb } = useDb();
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeDb) return;
    setLoading(true);
    fetch(`/api/ads?databaseId=${activeDb.id}`)
      .then((r) => r.json())
      .then((d) => setAds(d.ads ?? []))
      .finally(() => setLoading(false));
  }, [activeDb]);

  const total       = ads.length;
  const tagged      = useMemo(() => ads.filter((a) => a.taggingStatus === "ai_tagged" || a.taggingStatus === "manual_tagged"), [ads]);
  const untagged    = useMemo(() => ads.filter((a) => !a.taggingStatus || a.taggingStatus === "untagged"), [ads]);
  const useful      = useMemo(() => ads.filter((a) => a.usefulnessStatus === "useful"), [ads]);
  const notUseful   = useMemo(() => ads.filter((a) => a.usefulnessStatus === "not_useful"), [ads]);
  const uncertain   = useMemo(() => ads.filter((a) => a.usefulnessStatus === "uncertain"), [ads]);
  const deleteCandidates = useMemo(() => ads.filter((a) => a.recommendedAction === "delete_candidate"), [ads]);
  const markedUseful = useMemo(() => ads.filter((a) => (a.reviewStatus as string) === "useful"), [ads]);
  const noLink      = useMemo(() => ads.filter((a) => !hasLink(a)), [ads]);

  // Avg scores (from tagged ads only)
  const avgOverall   = useMemo(() => avgNums(tagged.map((a) => numField(a, "overallUsefulnessScore", "overallScore")).filter((n): n is number => n !== null)), [tagged]);
  const avgHook      = useMemo(() => avgNums(tagged.map((a) => numField(a, "hookStrengthScore")).filter((n): n is number => n !== null)), [tagged]);
  const avgRetention = useMemo(() => avgNums(tagged.map((a) => numField(a, "retentionQualityScore", "retentionScore")).filter((n): n is number => n !== null)), [tagged]);
  const avgProof     = useMemo(() => avgNums(tagged.map((a) => numField(a, "proofStrengthScore")).filter((n): n is number => n !== null)), [tagged]);
  const avgAI        = useMemo(() => avgNums(tagged.map((a) => numField(a, "aiReplicationValue")).filter((n): n is number => n !== null)), [tagged]);

  // Pattern breakdowns (all ads for counts, tagged for quality breakdowns)
  const byHook     = useMemo(() => countBy(ads, (a) => (a.hookType as string) || null), [ads]);
  const byFormat   = useMemo(() => countBy(tagged, (a) => ((a.formatType || a.avatarOrCreativeType) as string) || null), [tagged]);
  const byPlatform = useMemo(() => countBy(ads, (a) => (a.platform as string) || null), [ads]);
  const byAngle    = useMemo(() => countBy(tagged, (a) => ((a.creativeAngle) as string) || null), [tagged]);
  const byBucket   = useMemo(() => countBy(tagged, (a) => (a.creativeBucket as string) || null), [tagged]);
  const byUsefulness = useMemo(() => countBy(tagged, (a) => (a.usefulnessStatus as string) || null), [tagged]);

  // Top ads by score
  const topByScore = useMemo(() =>
    [...tagged]
      .sort((a, b) => (numField(b, "overallUsefulnessScore", "overallScore") ?? 0) - (numField(a, "overallUsefulnessScore", "overallScore") ?? 0))
      .slice(0, 8),
    [tagged]
  );

  // Natural language summary
  const topHook     = byHook[0]?.label;
  const topPlatform = byPlatform[0]?.label;
  let summary = "";
  if (total < 3) {
    summary = "Collect at least 3 ads to generate insights.";
  } else {
    const parts: string[] = [];
    if (tagged.length > 0) parts.push(`${tagged.length} of ${total} ads have been AI-tagged`);
    if (topHook)     parts.push(`the dominant hook type is "${topHook}"`);
    if (topPlatform) parts.push(`most content is from ${topPlatform}`);
    if (useful.length > 0) parts.push(`${useful.length} ads classified as useful by AI`);
    if (deleteCandidates.length > 0) parts.push(`${deleteCandidates.length} flagged for deletion`);
    summary = parts.join(", ") + ".";
    if (summary) summary = summary.charAt(0).toUpperCase() + summary.slice(1);
  }

  return (
    <div>
      {/* ── Header ────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 500 }}>Insights</h2>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 4 }}>
          {activeDb?.name ?? "…"} · {total} ads · {tagged.length} AI-tagged
        </p>
      </div>

      {loading ? (
        <div className="empty-state"><p>Loading…</p></div>
      ) : (
        <>
          {/* ── Summary ───────────────────────────────────────── */}
          {total > 0 && (
            <div style={{
              marginBottom: 20, padding: "14px 18px",
              background: "var(--color-background-secondary)",
              border: "1px solid var(--color-border-tertiary)",
              borderRadius: "var(--border-radius-lg)",
              fontSize: 14, lineHeight: 1.6, color: "var(--color-text-primary)",
            }}>
              {summary}
            </div>
          )}

          {/* ── Stats row ─────────────────────────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
            <StatCard label="Total ads"     value={total} />
            <StatCard label="AI tagged"     value={tagged.length}    sub={untagged.length > 0 ? `${untagged.length} untagged` : "All tagged!"} />
            <StatCard label="AI: useful"    value={useful.length}    color="#166534" />
            <StatCard label="To delete"     value={deleteCandidates.length} color={deleteCandidates.length > 0 ? "#991B1B" : undefined} />
          </div>

          {/* ── Usefulness breakdown ──────────────────────────── */}
          {tagged.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <Section title="Usefulness breakdown (AI classification)">
                {byUsefulness.length === 0 ? <Empty /> : (
                  <>
                    {byUsefulness.map((r) => (
                      <Bar key={r.label} label={r.label} count={r.count} max={tagged.length} />
                    ))}
                    <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 8 }}>
                      {tagged.length} tagged ads · {untagged.length} not yet tagged
                      {untagged.length > 0 && <> · <Link href="/library" style={{ color: "var(--color-accent)" }}>Tag them in Library →</Link></>}
                    </p>
                  </>
                )}
              </Section>
            </div>
          )}

          {/* ── Avg scores ────────────────────────────────────── */}
          {tagged.length > 0 && (
            <Section title="Average scores (tagged ads only)">
              <ScoreBar label="Overall usefulness" value={avgOverall} />
              <ScoreBar label="Hook strength"      value={avgHook} />
              <ScoreBar label="AI replication value" value={avgAI} />
              <ScoreBar label="Retention quality"  value={avgRetention} />
              <ScoreBar label="Proof strength"     value={avgProof} />
              {tagged.length < 5 && (
                <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 8 }}>
                  Based on {tagged.length} tagged ad{tagged.length !== 1 ? "s" : ""}. Tag more for reliable averages.
                </p>
              )}
            </Section>
          )}

          {/* ── Charts grid ───────────────────────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>

            <Section title="Top hook types">
              {byHook.length < 2 ? <Empty /> : byHook.slice(0, 6).map((r) => (
                <Bar key={r.label} label={r.label} count={r.count} max={byHook[0].count} />
              ))}
            </Section>

            <Section title="Top formats (tagged)">
              {byFormat.length < 2 ? <Empty /> : byFormat.slice(0, 6).map((r) => (
                <Bar key={r.label} label={r.label} count={r.count} max={byFormat[0].count} />
              ))}
            </Section>

            <Section title="By platform">
              {byPlatform.length === 0 ? <Empty /> : byPlatform.slice(0, 6).map((r) => (
                <Bar key={r.label} label={r.label} count={r.count} max={byPlatform[0].count} />
              ))}
            </Section>

            <Section title="Top creative angles (tagged)">
              {byAngle.length < 2 ? <Empty /> : byAngle.slice(0, 6).map((r) => (
                <Bar key={r.label} label={r.label} count={r.count} max={byAngle[0].count} />
              ))}
            </Section>

            {byBucket.length > 0 && (
              <Section title="Creative buckets (AI classification)">
                {byBucket.map((r) => (
                  <Bar key={r.label} label={r.label} count={r.count} max={byBucket[0].count} />
                ))}
              </Section>
            )}
          </div>

          {/* ── Top scored ads ────────────────────────────────── */}
          {topByScore.length > 0 && (
            <Section title={`Highest scored ads (${topByScore.length})`}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {topByScore.map((ad) => {
                  const url = (ad.adLink || ad.referenceUrl || ad.creativeVideoUrl || ad.creative_video_url || "") as string;
                  const platform = (ad.platform || "") as string;
                  const hook = (ad.hookType || ad.hookExample || "") as string;
                  const copy = String(ad.adCopy || ad.hookExample || "").slice(0, 100);
                  const score = numField(ad, "overallUsefulnessScore", "overallScore");
                  return (
                    <div key={ad.id as string} style={{
                      display: "flex", alignItems: "flex-start", gap: 10,
                      padding: "8px 10px", borderRadius: "var(--border-radius-md)",
                      background: "var(--color-background-secondary)",
                    }}>
                      {score !== null && (
                        <span style={{
                          fontSize: 14, fontWeight: 700, padding: "2px 8px", borderRadius: 8, flexShrink: 0,
                          background: score >= 7 ? "#DCFCE7" : score >= 5 ? "#FEF3C7" : "#FEE2E2",
                          color: score >= 7 ? "#166534" : score >= 5 ? "#92400E" : "#991B1B",
                        }}>
                          {score.toFixed(1)}
                        </span>
                      )}
                      {platform && (
                        <span style={{
                          fontSize: 10, padding: "2px 7px", borderRadius: 10,
                          background: "#DBEAFE", color: "#1E40AF", flexShrink: 0, fontWeight: 500,
                        }}>{platform}</span>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {hook && <span className="chip" style={{ fontSize: 10 }}>{hook}</span>}
                        {copy && <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2, lineHeight: 1.4 }}>{copy}</p>}
                      </div>
                      {url && (
                        <a href={url} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 11, color: "var(--color-accent)", fontWeight: 500, flexShrink: 0, textDecoration: "none" }}>
                          Open ↗
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* ── Manually marked useful ────────────────────────── */}
          {markedUseful.length > 0 && (
            <Section title={`Manually marked useful (${markedUseful.length})`}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {markedUseful.slice(0, 8).map((ad) => {
                  const url = (ad.adLink || ad.referenceUrl || ad.creativeVideoUrl || ad.creative_video_url || "") as string;
                  const platform = (ad.platform || "") as string;
                  const hook = (ad.hookType || ad.hookExample || "") as string;
                  const copy = String(ad.adCopy || ad.hookExample || "").slice(0, 100);
                  return (
                    <div key={ad.id as string} style={{
                      display: "flex", alignItems: "flex-start", gap: 10,
                      padding: "8px 10px", borderRadius: "var(--border-radius-md)",
                      background: "var(--color-background-secondary)",
                    }}>
                      {platform && (
                        <span style={{
                          fontSize: 10, padding: "2px 7px", borderRadius: 10,
                          background: "#DBEAFE", color: "#1E40AF", flexShrink: 0, fontWeight: 500,
                        }}>{platform}</span>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {hook && <span className="chip" style={{ fontSize: 10 }}>{hook}</span>}
                        {copy && <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2, lineHeight: 1.4 }}>{copy}</p>}
                      </div>
                      {url && (
                        <a href={url} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 11, color: "var(--color-accent)", fontWeight: 500, flexShrink: 0, textDecoration: "none" }}>
                          Open ↗
                        </a>
                      )}
                    </div>
                  );
                })}
                {markedUseful.length > 8 && (
                  <Link href="/library" style={{ fontSize: 12, color: "var(--color-accent)" }}>
                    +{markedUseful.length - 8} more — view in Library →
                  </Link>
                )}
              </div>
            </Section>
          )}

          {/* ── Missing data warnings ─────────────────────────── */}
          {(noLink.length > 0 || untagged.length > 0) && (
            <Section title="Gaps">
              {noLink.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 12 }}>
                  <span style={{ padding: "2px 8px", background: "#FEE2E2", color: "#991B1B", borderRadius: 10, fontSize: 11, fontWeight: 500 }}>
                    {noLink.length}
                  </span>
                  <span style={{ color: "var(--color-text-secondary)" }}>
                    ads have no link
                  </span>
                </div>
              )}
              {untagged.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                  <span style={{ padding: "2px 8px", background: "#FEF3C7", color: "#92400E", borderRadius: 10, fontSize: 11, fontWeight: 500 }}>
                    {untagged.length}
                  </span>
                  <span style={{ color: "var(--color-text-secondary)" }}>
                    ads not AI-tagged — <Link href="/library" style={{ color: "var(--color-accent)" }}>tag them in Library →</Link>
                  </span>
                </div>
              )}
            </Section>
          )}

          {total === 0 && (
            <div className="empty-state">
              <p style={{ marginBottom: 12 }}>No ads collected yet.</p>
              <Link href="/collect" className="btn btn-primary btn-sm">Start collecting</Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
