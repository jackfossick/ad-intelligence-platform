"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useDb, type DbSummary } from "@/lib/db-context";
import type { ValidationSummary } from "@/lib/schema-contract";

// ── Design tokens (mirror board's design HTML) ─────────────────
const T = {
  accent: "#5B4FD9", al: "#EEEDFE", ad: "#26215C",
  green:  "#27A06A", gl: "#E1F5EE", gd: "#085041",
  amber:  "#D4870A", ambl: "#FEF3DA",
  red:    "#D14040", rl: "#FEECEC", rd: "#7A1F1F",
  bg:     "#f8f8f6", bg2: "#fff",   bg3: "#f1efe8",
  text:   "#1a1a18", text2: "#73726c", text3: "#9c9a92",
  border: "#e8e6df", border2: "#d3d1c7",
} as const;

const HOOK_TYPES = ["Problem-first", "Curiosity gap", "Social proof", "Direct offer", "Story open"] as const;
const PLATFORM_COLORS: Record<string, string> = {
  tiktok:    "#1a1a2e",
  meta:      "#1877F2",
  facebook:  "#1877F2",
  instagram: "#1877F2",
  youtube:   "#cc0000",
};

// ── Types ──────────────────────────────────────────────────────
type Ad = Record<string, unknown> & { id: string };
type DbBreakdown = {
  summary: ValidationSummary | null;
  ads: Ad[];
  loaded: boolean;
  loading: boolean;
};

// ── Helpers ────────────────────────────────────────────────────
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
function normaliseHook(s: string): string {
  for (const h of HOOK_TYPES) if (s.toLowerCase() === h.toLowerCase()) return h;
  return s;
}
function platformKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}
function isSandbox(db: DbSummary): boolean {
  const n = db.name.toLowerCase();
  return n === "test" || n.includes("sandbox") || n.includes("dev");
}
function healthTone(pct: number) {
  if (pct >= 80) return { color: T.gd,    bar: T.green };
  if (pct >= 50) return { color: "#854F0B", bar: T.amber };
  return { color: T.rd, bar: T.red };
}
function formatRelative(d?: Date | null): string {
  if (!d) return "—";
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return "Today";
  const day = 86400 * 1000;
  if (diffMs < day)        return "Today";
  if (diffMs < 2 * day)    return "1d ago";
  const days = Math.floor(diffMs / day);
  if (days < 30)           return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12)         return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

// ── Page ───────────────────────────────────────────────────────
export default function DatabasesPage() {
  const { databases, activeDb, setActiveDbId, refreshDatabases, loading } = useDb();
  const [breakdowns, setBreakdowns] = useState<Record<string, DbBreakdown>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Auto-expand active DB on mount
  useEffect(() => {
    if (activeDb && !expanded.has(activeDb.id)) {
      setExpanded(new Set([activeDb.id]));
    }
  }, [activeDb?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lazy-load per-DB breakdown when expanded
  const loadBreakdown = useCallback(async (dbId: string) => {
    setBreakdowns((prev) => ({
      ...prev,
      [dbId]: { ...(prev[dbId] ?? { summary: null, ads: [], loaded: false }), loading: true },
    }));
    try {
      const [adsRes, valRes] = await Promise.all([
        fetch(`/api/ads?databaseId=${dbId}`),
        fetch(`/api/export?databaseId=${dbId}&validate=1`),
      ]);
      const adsData = (await adsRes.json()) as { ads: Ad[] };
      const valData = (await valRes.json()) as { summary: ValidationSummary };
      setBreakdowns((prev) => ({
        ...prev,
        [dbId]: {
          summary: valData.summary ?? null,
          ads: adsData.ads ?? [],
          loaded: true,
          loading: false,
        },
      }));
    } catch {
      setBreakdowns((prev) => ({
        ...prev,
        [dbId]: { ...(prev[dbId] ?? { summary: null, ads: [], loaded: false }), loading: false },
      }));
    }
  }, []);

  useEffect(() => {
    for (const id of expanded) {
      if (!breakdowns[id]?.loaded && !breakdowns[id]?.loading) {
        loadBreakdown(id);
      }
    }
  }, [expanded, breakdowns, loadBreakdown]);

  // Also load active DB's breakdown so the top summary cards reflect real data
  useEffect(() => {
    if (activeDb && !breakdowns[activeDb.id]?.loaded && !breakdowns[activeDb.id]?.loading) {
      loadBreakdown(activeDb.id);
    }
  }, [activeDb?.id, breakdowns, loadBreakdown]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ── Top summary card data ────────────────────────────────────
  const totalAds = useMemo(() => databases.reduce((s, d) => s + d.adCount, 0), [databases]);
  const activeBreakdown = activeDb ? breakdowns[activeDb.id] : null;
  const activeHealth = useMemo(() => {
    const s = activeBreakdown?.summary;
    if (!s || !s.total) return null;
    return Math.round((s.clean / s.total) * 100);
  }, [activeBreakdown]);

  const handleSetActive = (id: string) => {
    setActiveDbId(id);
  };

  const handleDelete = async (db: DbSummary) => {
    if (databases.length <= 1) { setDeleteError("Cannot delete the last database."); return; }
    if (!window.confirm(`Delete "${db.name}" and all ${db.adCount} ads?\n\nThis cannot be undone.`)) return;
    setDeletingId(db.id); setDeleteError(null);
    const res = await fetch("/api/databases", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: db.id }),
    });
    const data = await res.json() as { error?: string };
    setDeletingId(null);
    if (!res.ok) { setDeleteError(data.error || "Failed to delete."); return; }
    if (activeDb?.id === db.id) {
      const next = databases.find((d) => d.id !== db.id);
      if (next) setActiveDbId(next.id);
    }
    await refreshDatabases();
  };

  return (
    <div>
      {/* ── Top bar ───────────────────────────────────────────── */}
      <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 18, fontWeight: 500, color: T.text }}>Databases</h2>
          <p style={{ fontSize: 12, color: T.text2, marginTop: 3 }}>
            {databases.length} database{databases.length === 1 ? "" : "s"}
            {activeDb && (<> · active: <strong style={{ color: T.text }}>{activeDb.name}</strong></>)}
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          style={btnStyle({ primary: true })}
        >
          + New database
        </button>
      </div>

      {deleteError && (
        <div style={{ marginBottom: 12, padding: "8px 12px", background: T.rl, border: `1px solid ${T.red}40`, borderRadius: 8, fontSize: 12, color: T.rd }}>
          {deleteError}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: T.text2 }}>Loading…</div>
      ) : databases.length === 0 ? (
        <EmptyState onCreate={() => setModalOpen(true)} />
      ) : (
        <>
          {/* ── Summary stats ────────────────────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10, marginBottom: 16 }}>
            <SummaryStat label="Total databases" value={String(databases.length)} sub="across all projects" />
            <SummaryStat label="Total ads"       value={totalAds.toLocaleString()} sub="across all databases" />
            <SummaryStat
              label="Active database"
              value={activeDb ? truncate(activeDb.name, 18) : "—"}
              valueSize={14}
              sub={activeDb ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.green, display: "inline-block" }} />
                  {activeDb.adCount} ads
                  {activeHealth !== null && <> · {activeHealth}% health</>}
                </span>
              ) : "—"}
            />
            <SummaryStat
              label="Export-ready (active)"
              value={activeBreakdown?.summary ? activeBreakdown.summary.clean.toLocaleString() : "—"}
              valueColor={T.green}
              sub={activeBreakdown?.summary && activeBreakdown.summary.total > 0
                ? `of ${activeBreakdown.summary.total} ads · ${activeHealth ?? 0}%`
                : "—"}
            />
          </div>

          {/* ── DB cards ─────────────────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {databases.map((db) => {
              const isActive = db.id === activeDb?.id;
              const isOpen   = expanded.has(db.id);
              const bd       = breakdowns[db.id];
              const isOnly   = databases.length <= 1;
              const isRenaming = renamingId === db.id;
              return (
                <DbCard
                  key={db.id}
                  db={db}
                  isActive={isActive}
                  isOpen={isOpen}
                  bd={bd}
                  isOnly={isOnly}
                  isDeleting={deletingId === db.id}
                  isRenaming={isRenaming}
                  onToggle={() => toggle(db.id)}
                  onSetActive={() => handleSetActive(db.id)}
                  onRename={() => setRenamingId(db.id)}
                  onRenameDone={() => setRenamingId(null)}
                  onDelete={() => handleDelete(db)}
                />
              );
            })}
          </div>
        </>
      )}

      {modalOpen && <NewDbModal onClose={() => setModalOpen(false)} />}

      <p style={{ marginTop: 20, fontSize: 11, color: T.text2, lineHeight: 1.6 }}>
        The <strong style={{ color: T.text }}>active database</strong> is used across Collect, Library, Validate, and Export.
        You can switch it at any time from this page or the sidebar selector. Deleting a database permanently removes all its ads.
      </p>
    </div>
  );
}

// ── DB card ────────────────────────────────────────────────────
function DbCard({
  db, isActive, isOpen, bd, isOnly, isDeleting, isRenaming,
  onToggle, onSetActive, onRename, onRenameDone, onDelete,
}: {
  db: DbSummary;
  isActive: boolean;
  isOpen: boolean;
  bd: DbBreakdown | undefined;
  isOnly: boolean;
  isDeleting: boolean;
  isRenaming: boolean;
  onToggle: () => void;
  onSetActive: () => void;
  onRename: () => void;
  onRenameDone: () => void;
  onDelete: () => void;
}) {
  const sandbox = isSandbox(db);
  const summary = bd?.summary;
  const total   = summary?.total ?? db.adCount;
  const ready   = summary?.clean ?? 0;
  const healthPct = summary && summary.total > 0 ? Math.round((summary.clean / summary.total) * 100) : null;
  const tone = healthTone(healthPct ?? 0);

  // Hook coverage from ads
  const hookCoverage = useMemo(() => {
    const have = new Set<string>();
    for (const a of bd?.ads ?? []) {
      const h = normaliseHook(strField(a, "hookType"));
      if (h && (HOOK_TYPES as readonly string[]).includes(h)) have.add(h);
    }
    return have;
  }, [bd?.ads]);

  return (
    <div style={{
      background: T.bg2,
      border: `1px solid ${isActive ? T.accent : T.border}`,
      borderRadius: 12,
      overflow: "hidden",
      boxShadow: isActive ? `0 0 0 3px ${T.accent}12` : "none",
      transition: "border-color 0.15s",
    }}>
      <div
        onClick={onToggle}
        style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", cursor: "pointer", userSelect: "none" }}
      >
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: isActive ? T.green : T.border2, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: T.text }}>{db.name}</span>
            {isActive && (
              <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 500, background: T.gl, color: T.gd }}>
                Active
              </span>
            )}
            {sandbox && (
              <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 500, background: T.bg3, color: T.text2 }}>
                Sandbox
              </span>
            )}
          </div>
          {db.description && (
            <div style={{ fontSize: 12, color: T.text2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 480 }}>
              {db.description}
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          <div style={statColStyle()}>
            <span style={{ fontSize: 13, fontWeight: 500, color: T.text }}>{total}</span>
            <span style={{ fontSize: 10, color: T.text2 }}>ads</span>
          </div>
          <div style={statColStyle()}>
            <span style={{ fontSize: 13, fontWeight: 500, color: T.text }}>{hookCoverage.size}/5</span>
            <span style={{ fontSize: 10, color: T.text2 }}>hooks</span>
          </div>
          <div style={statColStyle()}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 56, height: 5, background: T.bg3, borderRadius: 3, overflow: "hidden" }}>
                {healthPct !== null && (
                  <div style={{ height: "100%", width: `${healthPct}%`, background: tone.bar, borderRadius: 3 }} />
                )}
              </div>
              <span style={{ fontSize: 12, fontWeight: 500, color: tone.color }}>
                {healthPct !== null ? `${healthPct}%` : (bd?.loading ? "…" : "—")}
              </span>
            </div>
            <span style={{ fontSize: 10, color: T.text2 }}>health</span>
          </div>
          <div style={{ width: 1, height: 32, background: T.border, flexShrink: 0 }} />
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
            {!isActive && (
              <button onClick={onSetActive} style={btnStyle({ primary: true, small: true })}>Set active</button>
            )}
            <button onClick={onRename} style={btnStyle({ small: true })}>Rename</button>
            <button
              onClick={onDelete}
              disabled={isOnly || isDeleting}
              style={btnStyle({ danger: true, small: true, disabled: isOnly || isDeleting })}
              title={isOnly ? "Cannot delete the last database" : undefined}
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      </div>

      {isRenaming && (
        <div style={{ borderTop: `1px solid ${T.border}`, padding: "12px 16px", background: T.bg3 }}>
          <RenameForm db={db} onDone={onRenameDone} />
        </div>
      )}

      {isOpen && (
        <div style={{
          borderTop: `1px solid ${T.border}`,
          padding: "14px 16px",
          background: T.bg3,
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 14,
        }}>
          <ExpandedStats db={db} bd={bd} />
          <ExpandedPlatformAndHook db={db} bd={bd} hookCoverage={hookCoverage} />
          <ExpandedQuickActions db={db} bd={bd} onSetActive={onSetActive} />
        </div>
      )}
    </div>
  );
}

function ExpandedStats({ db, bd }: { db: DbSummary; bd?: DbBreakdown }) {
  const summary = bd?.summary;
  const total = summary?.total ?? db.adCount;
  const ready = summary?.clean ?? 0;
  const incomplete = summary?.withWarnings ?? 0;
  const invalid = summary?.blocked ?? 0;
  const scores = (bd?.ads ?? []).map((a) => numField(a, "overallUsefulnessScore", "overallScore")).filter((n): n is number => n !== null);
  const avgScore = scores.length ? (scores.reduce((s, n) => s + n, 0) / scores.length).toFixed(1) : "—";

  // Last updated: max createdAt from ads
  let lastUpdated: Date | null = null;
  for (const a of bd?.ads ?? []) {
    const v = a.updatedAt || a.createdAt;
    if (!v) continue;
    const d = new Date(v as string);
    if (!Number.isNaN(d.getTime()) && (!lastUpdated || d > lastUpdated)) lastUpdated = d;
  }

  return (
    <div>
      <div style={expTitleStyle()}>Dataset stats</div>
      <ExpRow k="Total ads"     v={String(total)} />
      <ExpRow k="Export-ready"  v={String(ready)}     vColor={T.green} />
      <ExpRow k="Incomplete"    v={String(incomplete)} vColor="#854F0B" />
      <ExpRow k="Invalid"       v={String(invalid)}   vColor={T.red} />
      <ExpRow k="Avg score"     v={avgScore} />
      <ExpRow k="Last updated"  v={formatRelative(lastUpdated)} />
    </div>
  );
}

function ExpandedPlatformAndHook({ db, bd, hookCoverage }: { db: DbSummary; bd?: DbBreakdown; hookCoverage: Set<string> }) {
  // Platform split from ads
  const platformCounts: Record<string, number> = {};
  let totalPlatforms = 0;
  for (const a of bd?.ads ?? []) {
    const p = platformKey(strField(a, "platform"));
    if (!p) continue;
    platformCounts[p] = (platformCounts[p] ?? 0) + 1;
    totalPlatforms += 1;
  }
  const platformRows = Object.entries(platformCounts)
    .map(([k, c]) => ({ key: k, count: c, pct: Math.round((c / totalPlatforms) * 100) }))
    .sort((a, b) => b.count - a.count);

  return (
    <div>
      <div style={expTitleStyle()}>Platform split</div>
      {platformRows.length === 0 ? (
        <div style={{ fontSize: 11, color: T.text3 }}>—</div>
      ) : (
        platformRows.map((p) => (
          <div key={p.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, marginBottom: 6 }}>
            <span style={{ width: 50, color: T.text2, flexShrink: 0, textTransform: "capitalize" }}>{p.key}</span>
            <div style={{ flex: 1, height: 5, borderRadius: 3, background: T.bg2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${p.pct}%`, background: PLATFORM_COLORS[p.key] ?? T.accent, borderRadius: 3 }} />
            </div>
            <span style={{ fontSize: 10, color: T.text2, minWidth: 28, textAlign: "right" }}>{p.pct}%</span>
          </div>
        ))
      )}
      <div style={{ ...expTitleStyle(), marginTop: 12 }}>Hook coverage</div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
        {HOOK_TYPES.map((h) =>
          hookCoverage.has(h) ? (
            <span key={h} style={pillStyle("ok")}>{h}</span>
          ) : (
            <span key={h} style={pillStyle("miss")}>{h} · missing</span>
          )
        )}
      </div>
    </div>
  );
}

function ExpandedQuickActions({ db, bd, onSetActive }: { db: DbSummary; bd?: DbBreakdown; onSetActive: () => void }) {
  const issueCount = (bd?.summary?.blocked ?? 0) + (bd?.summary?.withWarnings ?? 0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={expTitleStyle()}>Quick actions</div>
      <button onClick={onSetActive} style={{ ...btnStyle({ primary: true }), width: "100%", textAlign: "center" }}>
        Set as active DB
      </button>
      <Link href={`/library?dbId=${db.id}`} style={{ ...btnStyle({}), width: "100%", textAlign: "center", textDecoration: "none", display: "inline-block" }}>
        Open in Library ↗
      </Link>
      <Link href={`/export?dbId=${db.id}`} style={{ ...btnStyle({}), width: "100%", textAlign: "center", textDecoration: "none", display: "inline-block" }}>
        Go to Export ↗
      </Link>
      {issueCount > 0 && (
        <Link href={`/validate?dbId=${db.id}`} style={{ ...btnStyle({ danger: true }), width: "100%", textAlign: "center", textDecoration: "none", display: "inline-block" }}>
          Fix {issueCount} issue{issueCount === 1 ? "" : "s"} in Validate ↗
        </Link>
      )}
    </div>
  );
}

function ExpRow({ k, v, vColor }: { k: string; v: string; vColor?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0", borderBottom: `1px solid ${T.border}` }}>
      <span style={{ color: T.text2 }}>{k}</span>
      <span style={{ fontWeight: 500, color: vColor ?? T.text }}>{v}</span>
    </div>
  );
}

// ── Rename form ────────────────────────────────────────────────
function RenameForm({ db, onDone }: { db: DbSummary; onDone: () => void }) {
  const { refreshDatabases } = useDb();
  const [name, setName] = useState(db.name);
  const [desc, setDesc] = useState(db.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) { setError("Name cannot be empty."); return; }
    setSaving(true); setError(null);
    const res = await fetch(`/api/databases/${db.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), description: desc.trim() || null }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError((data as { error?: string }).error || "Failed to rename."); return; }
    await refreshDatabases();
    onDone();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div>
        <div style={mflStyle()}>Name</div>
        <input
          value={name} onChange={(e) => setName(e.target.value)} autoFocus
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") onDone(); }}
          style={inputStyle()}
        />
      </div>
      <div>
        <div style={mflStyle()}>Description</div>
        <input
          value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Short description…"
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") onDone(); }}
          style={inputStyle()}
        />
      </div>
      {error && <p style={{ fontSize: 11, color: T.rd, margin: 0 }}>{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={save} disabled={saving} style={btnStyle({ primary: true, small: true })}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button onClick={onDone} disabled={saving} style={btnStyle({ small: true })}>Cancel</button>
      </div>
    </div>
  );
}

// ── New database modal ────────────────────────────────────────
function NewDbModal({ onClose }: { onClose: () => void }) {
  const { refreshDatabases, setActiveDbId } = useDb();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [setAfter, setSetAfter] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!name.trim()) { setError("Name is required."); return; }
    setCreating(true); setError(null);
    const res = await fetch("/api/databases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), description: desc.trim() || null }),
    });
    const data = await res.json() as { id?: string; error?: string };
    setCreating(false);
    if (!res.ok) { setError(data.error || "Failed to create."); return; }
    await refreshDatabases();
    if (setAfter && data.id) setActiveDbId(data.id);
    onClose();
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.28)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <div style={{ background: T.bg2, borderRadius: 14, padding: 22, width: 400, boxShadow: "0 8px 40px rgba(0,0,0,0.14)" }}>
        <div style={{ fontSize: 15, fontWeight: 500, color: T.text, marginBottom: 16 }}>New database</div>

        <div style={{ marginBottom: 12 }}>
          <div style={mflStyle()}>Name</div>
          <input
            value={name} onChange={(e) => setName(e.target.value)} autoFocus
            placeholder="e.g. Skincare Q3 2026"
            onKeyDown={(e) => { if (e.key === "Enter") create(); if (e.key === "Escape") onClose(); }}
            style={inputStyle()}
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={mflStyle()}>Description <span style={{ fontSize: 10, fontWeight: 400, color: T.text2 }}>optional</span></div>
          <input
            value={desc} onChange={(e) => setDesc(e.target.value)}
            placeholder="What is this dataset for?"
            onKeyDown={(e) => { if (e.key === "Enter") create(); if (e.key === "Escape") onClose(); }}
            style={inputStyle()}
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={mflStyle()}>Set as active database after creating</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setSetAfter(true)}  style={optStyle(setAfter)}>Yes — switch now</button>
            <button onClick={() => setSetAfter(false)} style={optStyle(!setAfter)}>No — keep current</button>
          </div>
        </div>
        {error && <p style={{ fontSize: 11, color: T.rd, margin: "6px 0" }}>{error}</p>}
        <div style={{ fontSize: 11, color: T.text2, padding: "10px 12px", background: T.bg3, borderRadius: 8, lineHeight: 1.6 }}>
          The <strong>active database</strong> is used across Collect, Library, Validate, and Export. You can switch it at any time from this page or the sidebar selector.
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
          <button onClick={onClose} disabled={creating} style={btnStyle({})}>Cancel</button>
          <button onClick={create} disabled={creating} style={btnStyle({ primary: true })}>
            {creating ? "Creating…" : "Create database"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Summary stat card ─────────────────────────────────────────
function SummaryStat({ label, value, sub, valueColor, valueSize }: {
  label: string;
  value: string;
  sub: React.ReactNode;
  valueColor?: string;
  valueSize?: number;
}) {
  return (
    <div style={{
      background: T.bg2,
      border: `1px solid ${T.border}`,
      borderRadius: 12,
      padding: "14px 16px",
    }}>
      <div style={{ fontSize: 11, color: T.text2, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: valueSize ?? 22, fontWeight: 500, color: valueColor ?? T.text, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: T.text2, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>{sub}</div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────
function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: 60, textAlign: "center", gap: 12,
      background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 12,
    }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: T.al, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <rect x="2"  y="2"  width="6" height="6" rx="1.5" stroke={T.accent} strokeWidth="1.4"/>
          <rect x="10" y="2"  width="6" height="6" rx="1.5" stroke={T.accent} strokeWidth="1.4"/>
          <rect x="2"  y="10" width="6" height="6" rx="1.5" stroke={T.accent} strokeWidth="1.4"/>
          <rect x="10" y="10" width="6" height="6" rx="1.5" stroke={T.accent} strokeWidth="1.4"/>
        </svg>
      </div>
      <div style={{ fontSize: 14, fontWeight: 500, color: T.text }}>No databases yet</div>
      <div style={{ fontSize: 12, color: T.text2, maxWidth: 280, lineHeight: 1.5 }}>
        Create your first database to start collecting and organising ads. Each database is an independent dataset.
      </div>
      <button onClick={onCreate} style={btnStyle({ primary: true })}>+ Create first database</button>
    </div>
  );
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
function statColStyle(): React.CSSProperties {
  return { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 };
}
function expTitleStyle(): React.CSSProperties {
  return { fontSize: 10, fontWeight: 500, color: T.text2, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 };
}
function pillStyle(kind: "ok" | "miss"): React.CSSProperties {
  return kind === "ok"
    ? { fontSize: 10, padding: "2px 7px", borderRadius: 4, background: T.al, color: T.ad }
    : { fontSize: 10, padding: "2px 7px", borderRadius: 4, background: T.rl, color: T.rd };
}
function mflStyle(): React.CSSProperties {
  return { fontSize: 11, fontWeight: 500, color: T.text2, marginBottom: 5 };
}
function inputStyle(): React.CSSProperties {
  return {
    width: "100%", padding: "8px 10px", borderRadius: 8,
    border: `1px solid ${T.border2}`, fontSize: 13,
    background: T.bg2, color: T.text, fontFamily: "inherit",
  };
}
function optStyle(selected: boolean): React.CSSProperties {
  return {
    flex: 1, padding: 8, borderRadius: 8,
    border: `1px solid ${selected ? T.accent : T.border}`,
    background: selected ? T.al : T.bg2,
    color: selected ? T.ad : T.text2,
    fontWeight: selected ? 500 : 400,
    fontSize: 12, textAlign: "center", cursor: "pointer",
    fontFamily: "inherit",
  };
}
function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
