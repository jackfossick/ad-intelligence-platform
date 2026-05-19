"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDb } from "@/lib/db-context";
import type { ValidationSummary } from "@/lib/schema-contract";

// ── Design tokens (mirror docs/design.html) ───────────────────
const T = {
  accent: "#5B4FD9", al: "#EEEDFE", ad: "#26215C",
  green:  "#27A06A", gd: "#085041",
  amber:  "#D4870A",
  red:    "#D14040", rd: "#7A1F1F",
  bg2: "#fff", bg3: "#f1efe8",
  text: "#1a1a18", text2: "#73726c", text3: "#9c9a92",
  border: "#e8e6df", border2: "#d3d1c7",
} as const;

// Map pathname to topbar title
function pageTitle(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  const first = segments[0] ?? "";
  const map: Record<string, string> = {
    insights:  "Analytics",
    library:   "Library",
    review:    "Review",
    validate:  "Validate",
    export:    "Export",
    collect:   "Collect",
    jobs:      "Job log",
    databases: "Databases",
    settings:  "Settings",
    discover:  "Discover",
    ads:       "Ads",
    factory:   "Factory",
    "scrape-runs": "Scrape runs",
    "import-export": "Import / Export",
    import:    "Import",
  };
  return map[first] ?? (first ? first[0].toUpperCase() + first.slice(1) : "Home");
}

export default function TopBar() {
  const pathname = usePathname();
  const title = pageTitle(pathname);

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "11px 18px",
      background: T.bg2,
      borderBottom: `1px solid ${T.border}`,
      height: 48,
      flexShrink: 0,
    }}>
      <span style={{ fontSize: 14, fontWeight: 500, color: T.text }}>{title}</span>
      <DbChip />
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
        <HealthPill />
        <Link href="/export" style={btnStyle({ primary: true })}>Export ↗</Link>
      </div>
    </div>
  );
}

// ── Active DB chip with menu ──────────────────────────────────
function DbChip() {
  const { databases, activeDb, setActiveDbId, loading } = useDb();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (loading || !activeDb) {
    return (
      <span style={{ ...chipStyle, color: T.text3 }}>
        <span style={dotStyle(T.border2)} />
        Loading…
      </span>
    );
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ ...chipStyle, background: open ? T.bg3 : T.bg2, border: `1px solid ${T.border2}`, cursor: "pointer", font: "inherit" }}
      >
        <span style={dotStyle(T.green)} />
        {activeDb.name}
        <span style={{ marginLeft: 2, color: T.text3, fontSize: 9 }}>▼</span>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0,
          minWidth: 240, maxWidth: 320,
          background: T.bg2, border: `1px solid ${T.border2}`, borderRadius: 10,
          boxShadow: "0 6px 20px rgba(0,0,0,0.10)", zIndex: 300,
          padding: 6,
        }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: T.text3, padding: "6px 10px 4px" }}>
            Switch database
          </div>
          {databases.map((db) => (
            <button
              key={db.id}
              type="button"
              onClick={() => { setActiveDbId(db.id); setOpen(false); }}
              style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%",
                padding: "7px 10px", borderRadius: 6,
                background: db.id === activeDb.id ? T.al : "transparent",
                border: "none", color: T.text, fontSize: 12, fontFamily: "inherit",
                textAlign: "left", cursor: "pointer",
              }}
            >
              <span style={dotStyle(db.id === activeDb.id ? T.green : T.border2)} />
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{db.name}</span>
              <span style={{ fontSize: 10, color: T.text3 }}>{db.adCount} ads</span>
            </button>
          ))}
          <div style={{ height: 1, background: T.border, margin: "6px 4px" }} />
          <Link href="/databases" onClick={() => setOpen(false)} style={{
            display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 6,
            color: T.accent, fontSize: 12, textDecoration: "none",
          }}>
            Manage databases →
          </Link>
        </div>
      )}
    </div>
  );
}

// ── Health pill ───────────────────────────────────────────────
function HealthPill() {
  const { activeDb } = useDb();
  const [summary, setSummary] = useState<ValidationSummary | null>(null);

  const load = useCallback(async () => {
    if (!activeDb) { setSummary(null); return; }
    try {
      const res = await fetch(`/api/export?databaseId=${activeDb.id}&validate=1`);
      if (!res.ok) return;
      const data = await res.json() as { summary: ValidationSummary };
      setSummary(data.summary ?? null);
    } catch {
      // silent: pill just doesn't render
    }
  }, [activeDb?.id]);

  useEffect(() => { load(); }, [load]);

  const pct = useMemo(() => {
    if (!summary || !summary.total) return null;
    return Math.round((summary.clean / summary.total) * 100);
  }, [summary]);

  if (pct === null) return null;

  const bar = pct >= 80 ? T.green : pct >= 50 ? T.amber : T.red;
  const txt = pct >= 80 ? T.gd : pct >= 50 ? "#854F0B" : T.rd;

  return (
    <span title="Dataset readiness — % of ads in this database that are export-ready" style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "4px 10px", borderRadius: 20, background: T.bg3,
      fontSize: 11, color: T.text2,
    }}>
      <span style={{ width: 48, height: 4, borderRadius: 2, background: T.border2, overflow: "hidden" }}>
        <span style={{ display: "block", height: "100%", width: `${pct}%`, background: bar, borderRadius: 2 }} />
      </span>
      <span style={{ fontWeight: 500, color: txt }}>{pct}%</span>
      <span>health</span>
    </span>
  );
}

// ── Styles ────────────────────────────────────────────────────
const chipStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 5,
  padding: "4px 10px", borderRadius: 20,
  fontSize: 11, color: T.text2,
};

function dotStyle(color: string): React.CSSProperties {
  return { width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0, display: "inline-block" };
}

function btnStyle({ primary }: { primary?: boolean }): React.CSSProperties {
  return {
    padding: "5px 12px", borderRadius: 8, fontSize: 12, fontWeight: 500,
    border: `1px solid ${primary ? T.accent : T.border2}`,
    color: primary ? "#fff" : T.text,
    background: primary ? T.accent : T.bg2,
    textDecoration: "none", display: "inline-block",
    fontFamily: "inherit",
  };
}
