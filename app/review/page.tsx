"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  Suspense,
} from "react";
import { useDb } from "@/lib/db-context";
import { HOOK_TYPES, CREATIVE_FORMATS, HOOK_TYPE_DESCRIPTIONS, FORMAT_DESCRIPTIONS } from "@/lib/enums";
import { EXPORT_SCHEMA, validateRow } from "@/lib/schema-contract";
import type { RowValidationResult } from "@/lib/schema-contract";

type Ad = Record<string, unknown> & { id: string };

type Counter = { kept: number; skipped: number; flagged: number; deleted: number };

const ZERO_COUNTER: Counter = { kept: 0, skipped: 0, flagged: 0, deleted: 0 };

function isReviewed(ad: Ad): boolean {
  return String(ad.reviewStatus ?? "") === "reviewed";
}

// Mirrors the schema-contract export-key → ad-source mapping for the small
// set of fields fixable inside Review mode. `?missing=<exportKey>` from
// Validate's "Fix all" button lands here.
const MISSING_SOURCES: Record<string, string[]> = {
  hook:                ["hookType"],
  format:              ["formatType"],
  creative_video_url:  ["creativeVideoUrl"],
  ad_copy:             ["adCopy", "hookExample", "description"],
  platform:            ["platform"],
  ad_url:              ["referenceUrl", "adLibraryUrl", "adLink"],
};

function fieldIsMissing(ad: Ad, exportKey: string): boolean {
  const sources = MISSING_SOURCES[exportKey];
  if (!sources) return false;
  for (const src of sources) {
    const v = ad[src];
    if (v !== null && v !== undefined && v !== "") return false;
  }
  return true;
}

function platformLabel(p: unknown): string {
  return typeof p === "string" && p.trim() ? p : "—";
}

function statusPill(ad: Ad): { label: string; bg: string; color: string } {
  const status = String(ad.reviewStatus ?? "new");
  switch (status) {
    case "reviewed": {
      const useful = String(ad.usefulnessStatus ?? "");
      if (useful === "useful")    return { label: "Useful",    bg: "#E1F5EE", color: "#085041" };
      if (useful === "uncertain") return { label: "Skipped",   bg: "#F1EFE8", color: "#1A1A18" };
      if (useful === "not_useful")return { label: "Not useful",bg: "#FEECEC", color: "#7A1F1F" };
      return { label: "Reviewed", bg: "#E6F1FB", color: "#0C447C" };
    }
    case "useful":     return { label: "Useful",   bg: "#E1F5EE", color: "#085041" };
    case "rejected":   return { label: "Rejected", bg: "#FEECEC", color: "#7A1F1F" };
    case "unreviewed":
    case "new":
    default:           return { label: "New",      bg: "#E6F1FB", color: "#0C447C" };
  }
}

export default function ReviewPageWrapper() {
  return (
    <Suspense fallback={<div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>Loading…</div>}>
      <ReviewPage />
    </Suspense>
  );
}

function ReviewPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { activeDb, setActiveDbId, databases } = useDb();

  // Honour ?dbId= from URL
  const urlDbId  = params.get("dbId") ?? "";
  const focusId  = params.get("focusId") ?? "";
  const missing  = params.get("missing") ?? "";
  const dbId     = urlDbId || activeDb?.id || "";

  useEffect(() => {
    if (urlDbId && urlDbId !== activeDb?.id && databases.some((d) => d.id === urlDbId)) {
      setActiveDbId(urlDbId);
    }
  }, [urlDbId, activeDb?.id, databases, setActiveDbId]);

  const [allAds, setAllAds]     = useState<Ad[]>([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [counter, setCounter]   = useState<Counter>(ZERO_COUNTER);
  const [savingField, setSavingField] = useState<null | "hookType" | "formatType">(null);

  const load = useCallback(async () => {
    if (!dbId) { setAllAds([]); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ads?databaseId=${dbId}`);
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { ads: Ad[] };
      setAllAds(data.ads ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load ads");
    } finally {
      setLoading(false);
    }
  }, [dbId]);

  useEffect(() => { load(); }, [load]);

  // Build queue: unreviewed first; if focusId given, include it even if reviewed.
  // If ?missing=<exportKey> is set, restrict the queue to ads where that field
  // is empty (so "Fix all in Review" from Validate lands users on the gap list).
  const queue = useMemo(() => {
    const focused = focusId ? allAds.filter((a) => a.id === focusId) : [];

    let pool = allAds.filter((a) => !isReviewed(a) && a.id !== focusId);
    if (missing) {
      pool = pool.filter((a) => fieldIsMissing(a, missing));
    }
    return [...focused, ...pool];
  }, [allAds, focusId, missing]);

  const [cursor, setCursor] = useState(0);
  // Reset cursor when the queue identity meaningfully changes
  const queueKeyRef = useRef("");
  useEffect(() => {
    const key = queue.map((a) => a.id).join("|");
    if (key !== queueKeyRef.current) {
      queueKeyRef.current = key;
      setCursor(0);
    }
  }, [queue]);

  const current = queue[cursor];

  // Counts for the progress strip
  const total      = allAds.length;
  const reviewed   = allAds.filter(isReviewed).length;
  const remaining  = queue.length - cursor;

  // ── Validation result for current ad ───────────────────────────
  const validation: RowValidationResult | null = useMemo(() => {
    if (!current) return null;
    return validateRow(current as Record<string, unknown>);
  }, [current]);

  const completeness = useMemo(() => {
    if (!validation) return { pct: 0, requiredOk: 0, requiredTotal: 0, optionalOk: 0, optionalTotal: 0 };
    let requiredOk = 0, requiredTotal = 0, optionalOk = 0, optionalTotal = 0;
    for (const spec of EXPORT_SCHEMA) {
      const filled = !!validation.row[spec.exportKey];
      const issue  = validation.issues.find((i) => i.field === spec.exportKey);
      const ok     = filled && (!issue || issue.severity === "info");
      if (spec.required === "hard" || spec.required === "soft") {
        requiredTotal++;
        if (ok) requiredOk++;
      } else {
        optionalTotal++;
        if (ok) optionalOk++;
      }
    }
    const totalSpec = requiredTotal + optionalTotal;
    const okSpec   = requiredOk + optionalOk;
    return {
      pct: totalSpec === 0 ? 0 : Math.round((okSpec / totalSpec) * 100),
      requiredOk, requiredTotal, optionalOk, optionalTotal,
    };
  }, [validation]);

  // ── Mutations ──────────────────────────────────────────────────
  const patchCurrent = useCallback(async (patch: Record<string, unknown>): Promise<boolean> => {
    if (!current) return false;
    const res = await fetch(`/api/ads/${current.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      setError(`Save failed: ${await res.text()}`);
      return false;
    }
    const updated = (await res.json()) as Ad;
    setAllAds((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    return true;
  }, [current]);

  const advance = useCallback(() => {
    setCursor((c) => Math.min(c + 1, queue.length));
  }, [queue.length]);

  const goBack = useCallback(() => {
    setCursor((c) => Math.max(c - 1, 0));
  }, []);

  const onKeep = useCallback(async () => {
    const ok = await patchCurrent({ reviewStatus: "reviewed", usefulnessStatus: "useful" });
    if (ok) {
      setCounter((c) => ({ ...c, kept: c.kept + 1 }));
      advance();
    }
  }, [patchCurrent, advance]);

  const onSkip = useCallback(async () => {
    const ok = await patchCurrent({ reviewStatus: "reviewed", usefulnessStatus: "uncertain" });
    if (ok) {
      setCounter((c) => ({ ...c, skipped: c.skipped + 1 }));
      advance();
    }
  }, [patchCurrent, advance]);

  const onFlag = useCallback(async () => {
    const ok = await patchCurrent({ recommendedAction: "review" });
    if (ok) {
      setCounter((c) => ({ ...c, flagged: c.flagged + 1 }));
      advance();
    }
  }, [patchCurrent, advance]);

  const onDelete = useCallback(async () => {
    if (!current) return;
    if (!confirm(`Delete ad ${String(current.id).slice(0, 8)}…? This cannot be undone.`)) return;
    const res = await fetch(`/api/ads/${current.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError(`Delete failed: ${await res.text()}`);
      return;
    }
    setAllAds((prev) => prev.filter((a) => a.id !== current.id));
    setCounter((c) => ({ ...c, deleted: c.deleted + 1 }));
    // Cursor stays put — the deleted item disappears from queue, next item slides in.
  }, [current]);

  // Inline edits for Hook + Format
  const onChangeHook = useCallback(async (val: string) => {
    if (!current) return;
    setSavingField("hookType");
    const ok = await patchCurrent({ hookType: val || null });
    setSavingField(null);
    if (!ok) return;
  }, [current, patchCurrent]);

  const onChangeFormat = useCallback(async (val: string) => {
    if (!current) return;
    setSavingField("formatType");
    const ok = await patchCurrent({ formatType: val || null });
    setSavingField(null);
    if (!ok) return;
  }, [current, patchCurrent]);

  // ── Keyboard shortcuts ─────────────────────────────────────────
  useEffect(() => {
    function isEditableTarget(t: EventTarget | null): boolean {
      const el = t as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    }
    function handler(e: KeyboardEvent) {
      if (!current) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Don't intercept K/S/F/D when typing in a field — but arrows/enter still work outside text fields
      if (isEditableTarget(e.target)) {
        // Tab cycling is the browser's job; we only block the action keys here.
        return;
      }
      const k = e.key;
      if (k === "k" || k === "K") { e.preventDefault(); onKeep();   return; }
      if (k === "s" || k === "S") { e.preventDefault(); onSkip();   return; }
      if (k === "f" || k === "F") { e.preventDefault(); onFlag();   return; }
      if (k === "d" || k === "D") { e.preventDefault(); onDelete(); return; }
      if (k === "ArrowRight")     { e.preventDefault(); advance();  return; }
      if (k === "ArrowLeft")      { e.preventDefault(); goBack();   return; }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [current, onKeep, onSkip, onFlag, onDelete, advance, goBack]);

  // ── No DB / empty states ───────────────────────────────────────
  if (!dbId) {
    return (
      <div className="card" style={{ padding: 20, fontSize: 13, color: "var(--color-text-secondary)" }}>
        Select a database from the sidebar to start reviewing.
      </div>
    );
  }

  if (loading && allAds.length === 0) {
    return (
      <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>Loading ads…</div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ padding: 12, marginBottom: 12, background: "#FEECEC", color: "#7A1F1F", fontSize: 13 }}>
        {error}
      </div>
    );
  }

  if (!current) {
    return (
      <EmptyAllReviewed
        kept={counter.kept}
        skipped={counter.skipped}
        flagged={counter.flagged}
        deleted={counter.deleted}
        total={total}
        reviewed={reviewed}
        onExit={() => router.push(`/library${dbId ? `?dbId=${dbId}` : ""}`)}
      />
    );
  }

  const pill = statusPill(current);
  const adId   = String(current.id);
  const adCopy = String(current.adCopy ?? current.hookExample ?? current.description ?? "").trim();
  const adUrl  = String(current.referenceUrl ?? current.adLibraryUrl ?? current.adLink ?? "").trim();
  const tags   = parseTags(current);

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1fr 320px",
      gap: 16,
      alignItems: "start",
    }}>
      {/* ── MAIN COLUMN ───────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Progress strip */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
            {reviewed} / {total} reviewed
          </span>
          <div style={{
            flex: 1, height: 3, background: "var(--color-background-tertiary)",
            borderRadius: 2, overflow: "hidden",
          }}>
            <div style={{
              height: "100%",
              width: `${total === 0 ? 0 : Math.round((reviewed / total) * 100)}%`,
              background: "#5B4FD9", borderRadius: 2,
            }} />
          </div>
          <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
            {remaining} remaining
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => router.push(`/library${dbId ? `?dbId=${dbId}` : ""}`)}
            style={{
              padding: "5px 12px", borderRadius: "var(--border-radius-md)", fontSize: 12,
              border: "0.5px solid var(--color-border-secondary)",
              color: "var(--color-text-primary)", cursor: "pointer",
              background: "var(--color-background-primary)", fontWeight: 500,
            }}
          >
            Exit
          </button>
        </div>

        {/* Ad card */}
        <div style={{
          border: "0.5px solid var(--color-border-tertiary)",
          borderRadius: "var(--border-radius-lg)",
          overflow: "hidden", display: "flex", flexDirection: "column",
        }}>
          <div style={{
            padding: "12px 14px",
            background: "var(--color-background-secondary)",
            borderBottom: "0.5px solid var(--color-border-tertiary)",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{
              padding: "2px 7px", borderRadius: 4, fontSize: 10, fontWeight: 500,
              background: "var(--color-background-tertiary)",
              color: "var(--color-text-secondary)",
            }}>
              {platformLabel(current.platform)}
            </span>
            <span style={{
              padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 500,
              background: pill.bg, color: pill.color,
            }}>
              {pill.label}
            </span>
            <span style={{
              fontSize: 11, color: "var(--color-text-secondary)",
              marginLeft: "auto", fontFamily: "var(--font-mono)",
            }}>
              ID: {adId.slice(0, 8)}…
            </span>
          </div>

          <div style={{ padding: 14 }}>
            {/* Ad copy / transcript */}
            <FieldBlock label="Ad copy / transcript">
              {adCopy ? (
                <div style={{ fontSize: 13, color: "var(--color-text-primary)", lineHeight: 1.5 }}>
                  &ldquo;{adCopy.length > 600 ? `${adCopy.slice(0, 600)}…` : adCopy}&rdquo;
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "#7A1F1F", fontStyle: "italic" }}>
                  No ad copy / transcript captured.
                </div>
              )}
            </FieldBlock>

            {/* Hook + Format selects */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <FieldBlock label="Hook type (required)">
                <InlineSelect
                  value={String(current.hookType ?? "")}
                  required
                  errored={!current.hookType}
                  onChange={onChangeHook}
                  saving={savingField === "hookType"}
                  options={HOOK_TYPES.map((h) => ({ value: h, label: h, hint: HOOK_TYPE_DESCRIPTIONS[h] }))}
                  placeholder="— select hook type —"
                />
              </FieldBlock>
              <FieldBlock label="Format">
                <InlineSelect
                  value={String(current.formatType ?? "")}
                  onChange={onChangeFormat}
                  saving={savingField === "formatType"}
                  options={CREATIVE_FORMATS.map((f) => ({ value: f, label: f, hint: FORMAT_DESCRIPTIONS[f] }))}
                  placeholder="— select format —"
                />
              </FieldBlock>
            </div>

            {/* Tags */}
            <FieldBlock label="Tags">
              {tags.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>—</div>
              ) : (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {tags.map((t) => (
                    <span key={t} style={{
                      padding: "3px 8px", borderRadius: 4, fontSize: 11,
                      background: "var(--color-background-secondary)",
                      color: "var(--color-text-secondary)",
                      border: "0.5px solid var(--color-border-tertiary)",
                    }}>{t}</span>
                  ))}
                </div>
              )}
            </FieldBlock>

            {/* Ad URL */}
            <FieldBlock label="Ad URL">
              {adUrl ? (
                <a
                  href={adUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 11, color: "var(--color-accent-dark)", textDecoration: "none" }}
                >
                  {adUrl} ↗
                </a>
              ) : (
                <span style={{ fontSize: 12, color: "#7A1F1F", fontStyle: "italic" }}>missing</span>
              )}
            </FieldBlock>
          </div>
        </div>

        {/* Action row */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <ActionButton accent="#27A06A" hover="#E1F5EE" textColor="#085041" kbd="K" onClick={onKeep}>Keep</ActionButton>
          <ActionButton accent="#73726C" hover="#F1EFE8" textColor="#1A1A18" kbd="S" onClick={onSkip}>Skip</ActionButton>
          <ActionButton accent="#D4870A" hover="#FEF3DA" textColor="#633806" kbd="F" onClick={onFlag}>Flag</ActionButton>
          <ActionButton accent="#D14040" hover="#FEECEC" textColor="#7A1F1F" kbd="D" onClick={onDelete}>Delete</ActionButton>
        </div>

        {/* Footer hints */}
        <div style={{
          fontSize: 11, color: "var(--color-text-secondary)",
          display: "flex", gap: 16, marginTop: 4,
        }}>
          <span>← → to navigate</span>
          <span>Tab to cycle fields</span>
          <span>Enter to confirm select</span>
        </div>
      </div>

      {/* ── SIDEBAR ───────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16, position: "sticky", top: 24 }}>
        <div className="card" style={{ padding: 14 }}>
          <SectionTitle>Validation</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
            {validation && EXPORT_SCHEMA.map((spec) => {
              const issue = validation.issues.find((i) => i.field === spec.exportKey);
              const filled = !!validation.row[spec.exportKey];
              const severity: "ok" | "warn" | "err" =
                issue && issue.severity === "error" ? "err"
                : issue && issue.severity === "warning" ? "warn"
                : filled ? "ok" : "warn";
              return (
                <ValItem key={spec.exportKey} severity={severity}>
                  {spec.label}
                  {issue && severity !== "ok" && (
                    <span style={{ color: severity === "err" ? "#7A1F1F" : "#633806", marginLeft: 4 }}>
                      — {issue.severity === "error" ? "required" : "missing"}
                    </span>
                  )}
                </ValItem>
              );
            })}
          </div>
        </div>

        <div className="card" style={{ padding: 14 }}>
          <SectionTitle>Completeness</SectionTitle>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
            <CompletenessRing pct={completeness.pct} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
              <CompletenessRow
                label="Required"
                ok={completeness.requiredOk}
                total={completeness.requiredTotal}
                color="#5B4FD9"
              />
              <CompletenessRow
                label="Optional"
                ok={completeness.optionalOk}
                total={completeness.optionalTotal}
                color="#9CA3AF"
              />
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 14 }}>
          <SectionTitle>This session</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8, fontSize: 12 }}>
            <CounterRow label="Kept"    n={counter.kept}    color="#085041" />
            <CounterRow label="Skipped" n={counter.skipped} color="#1A1A18" />
            <CounterRow label="Flagged" n={counter.flagged} color="#633806" />
            <CounterRow label="Deleted" n={counter.deleted} color="#7A1F1F" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────

function FieldBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        fontSize: 10, fontWeight: 500, color: "var(--color-text-secondary)",
        textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4,
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function InlineSelect({
  value, onChange, options, placeholder, required, errored, saving,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; hint?: string }[];
  placeholder: string;
  required?: boolean;
  errored?: boolean;
  saving?: boolean;
}) {
  return (
    <div style={{ position: "relative" }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%", padding: "6px 8px", fontSize: 12,
          borderRadius: "var(--border-radius-md)",
          border: `0.5px solid ${errored ? "#D14040" : "var(--color-border-secondary)"}`,
          background: errored ? "#FEECEC" : "var(--color-background-primary)",
          color: "var(--color-text-primary)",
        }}
      >
        <option value="">{required ? "— required —" : placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value} title={o.hint}>{o.label}</option>
        ))}
      </select>
      {saving && (
        <span style={{
          position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
          fontSize: 10, color: "var(--color-text-tertiary)",
        }}>
          saving…
        </span>
      )}
    </div>
  );
}

function ActionButton({
  children, kbd, accent, hover, textColor, onClick,
}: {
  children: React.ReactNode;
  kbd: string;
  accent: string;
  hover: string;
  textColor: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = hover; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--color-background-primary)"; }}
      style={{
        flex: 1, padding: "10px 6px", borderRadius: "var(--border-radius-md)",
        border: `0.5px solid ${accent}`, fontSize: 12, fontWeight: 500,
        cursor: "pointer", background: "var(--color-background-primary)",
        color: textColor, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
      }}
    >
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 16, height: 16, borderRadius: 3,
        background: "var(--color-background-tertiary)",
        border: "0.5px solid var(--color-border-secondary)",
        fontSize: 9, color: "var(--color-text-secondary)",
      }}>
        {kbd}
      </span>
      {children}
    </button>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)",
      textTransform: "uppercase", letterSpacing: "0.05em",
    }}>
      {children}
    </div>
  );
}

function ValItem({ severity, children }: {
  severity: "ok" | "warn" | "err";
  children: React.ReactNode;
}) {
  const config = severity === "ok"
    ? { bg: "#E1F5EE", color: "#085041", icon: "✓" }
    : severity === "warn"
    ? { bg: "#FEF3DA", color: "#633806", icon: "~" }
    : { bg: "#FEECEC", color: "#7A1F1F", icon: "!" };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
      <span style={{
        width: 14, height: 14, borderRadius: "50%",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontSize: 8, background: config.bg, color: config.color, flexShrink: 0,
      }}>
        {config.icon}
      </span>
      <span>{children}</span>
    </div>
  );
}

function CompletenessRing({ pct }: { pct: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <div style={{ position: "relative", width: 56, height: 56 }}>
      <svg width={56} height={56} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={28} cy={28} r={r} stroke="var(--color-background-tertiary)" strokeWidth={4} fill="none" />
        <circle
          cx={28} cy={28} r={r}
          stroke="#5B4FD9" strokeWidth={4} fill="none"
          strokeDasharray={`${dash} ${c - dash}`}
          strokeLinecap="round"
        />
      </svg>
      <div style={{
        position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)",
      }}>
        {pct}%
      </div>
    </div>
  );
}

function CompletenessRow({ label, ok, total, color }: { label: string; ok: number; total: number; color: string }) {
  const pct = total === 0 ? 0 : Math.round((ok / total) * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--color-text-secondary)" }}>
      <span style={{ width: 60 }}>{label}</span>
      <span style={{
        flex: 1, height: 3, background: "var(--color-background-tertiary)", borderRadius: 2, overflow: "hidden",
      }}>
        <span style={{ display: "block", height: "100%", width: `${pct}%`, background: color, borderRadius: 2 }} />
      </span>
      <span>{ok}/{total}</span>
    </div>
  );
}

function CounterRow({ label, n, color }: { label: string; n: number; color: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ color: "var(--color-text-secondary)" }}>{label}</span>
      <span style={{ color, fontWeight: 500 }}>{n}</span>
    </div>
  );
}

function EmptyAllReviewed({
  kept, skipped, flagged, deleted, total, reviewed, onExit,
}: {
  kept: number; skipped: number; flagged: number; deleted: number;
  total: number; reviewed: number; onExit: () => void;
}) {
  return (
    <div className="card" style={{ padding: 32, maxWidth: 560, textAlign: "center", margin: "0 auto" }}>
      <div style={{
        width: 56, height: 56, borderRadius: "50%",
        background: "#E1F5EE", color: "#085041",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 24, margin: "0 auto 16px",
      }}>✓</div>
      <h2 style={{ fontSize: 18, fontWeight: 500, marginBottom: 6 }}>All caught up</h2>
      <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 16 }}>
        {reviewed} of {total} ads reviewed. Nothing left in the queue.
      </p>
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8,
        marginBottom: 20, fontSize: 12,
      }}>
        <SessionStat label="Kept"    n={kept}    color="#085041" />
        <SessionStat label="Skipped" n={skipped} color="#1A1A18" />
        <SessionStat label="Flagged" n={flagged} color="#633806" />
        <SessionStat label="Deleted" n={deleted} color="#7A1F1F" />
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        <Link
          href="/library"
          style={{
            padding: "6px 14px", borderRadius: "var(--border-radius-md)",
            border: "0.5px solid var(--color-border-secondary)",
            color: "var(--color-text-primary)", textDecoration: "none", fontSize: 12, fontWeight: 500,
            background: "var(--color-background-primary)",
          }}
        >
          Go to Library
        </Link>
        <Link
          href="/validate"
          style={{
            padding: "6px 14px", borderRadius: "var(--border-radius-md)",
            border: "0.5px solid #5B4FD9", background: "#5B4FD9", color: "#EEEDFE",
            textDecoration: "none", fontSize: 12, fontWeight: 500,
          }}
        >
          Validate dataset →
        </Link>
        <button
          type="button"
          onClick={onExit}
          style={{
            padding: "6px 14px", borderRadius: "var(--border-radius-md)",
            border: "0.5px solid var(--color-border-secondary)",
            background: "var(--color-background-primary)",
            color: "var(--color-text-primary)", fontSize: 12, fontWeight: 500, cursor: "pointer",
          }}
        >
          Exit
        </button>
      </div>
    </div>
  );
}

function SessionStat({ label, n, color }: { label: string; n: number; color: string }) {
  return (
    <div style={{
      padding: "10px 8px",
      border: "0.5px solid var(--color-border-tertiary)",
      borderRadius: "var(--border-radius-md)",
    }}>
      <div style={{ fontSize: 18, fontWeight: 500, color }}>{n}</div>
      <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function parseTags(ad: Ad): string[] {
  const raw = ad.strategicTag ?? ad.creativeBucket ?? "";
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  return String(raw).split(",").map((s) => s.trim()).filter(Boolean);
}
