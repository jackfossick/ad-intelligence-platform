"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDb } from "@/lib/db-context";

const NAV = [
  { href: "/collect",  icon: "⊕", label: "Collect",       group: "main"   },
  { href: "/library",  icon: "⊞", label: "Library",        group: "main"   },
  { href: "/insights", icon: "◈", label: "Key Insights",   group: "main"   },
  { href: "/export",   icon: "↓", label: "Export",         group: "main"   },
  { href: "/settings", icon: "⚙", label: "Settings",       group: "system" },
  { href: "/databases",icon: "◫", label: "Databases",      group: "system" },
];

const GROUPS = [
  { key: "main",   label: "" },
  { key: "system", label: "System" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { databases, activeDb, setActiveDbId, loading } = useDb();

  return (
    <nav style={{
      position: "fixed", left: 0, top: 0, bottom: 0, width: 220,
      background: "var(--color-background-primary)",
      borderRight: "1px solid var(--color-border-tertiary)",
      display: "flex", flexDirection: "column", zIndex: 100,
      boxShadow: "1px 0 0 var(--color-border-tertiary)",
    }}>

      {/* ── Logo ───────────────────────────────────────────────── */}
      <div style={{ padding: "18px 18px 16px", borderBottom: "1px solid var(--color-border-tertiary)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7,
            background: "linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, color: "white", fontWeight: 700, flexShrink: 0,
            boxShadow: "0 2px 6px rgba(59,130,246,0.30)",
          }}>A</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", letterSpacing: "0.01em" }}>
              Ad Intelligence
            </div>
            <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginTop: 1 }}>
              Collection system
            </div>
          </div>
        </div>
      </div>

      {/* ── Nav ────────────────────────────────────────────────── */}
      <div style={{ padding: "12px 0", flex: 1, overflowY: "auto" }}>
        {GROUPS.map(({ key, label }) => {
          const items = NAV.filter((n) => n.group === key);
          return (
            <div key={key} style={{ marginBottom: 4 }}>
              {label && (
                <div style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: "0.10em",
                  textTransform: "uppercase", color: "var(--color-text-tertiary)",
                  padding: "6px 18px 4px",
                }}>
                  {label}
                </div>
              )}
              {items.map(({ href, icon, label: itemLabel }) => {
                const active = pathname === href || (href !== "/" && pathname.startsWith(href));
                return (
                  <Link
                    key={href}
                    href={href}
                    style={{
                      display: "flex", alignItems: "center", gap: 9,
                      padding: "7px 14px 7px 16px", margin: "1px 8px",
                      borderRadius: "var(--border-radius-md)", fontSize: 13,
                      color: active ? "var(--color-accent-dark)" : "var(--color-text-secondary)",
                      background: active ? "var(--color-accent-light)" : "transparent",
                      fontWeight: active ? 500 : 400,
                      textDecoration: "none", transition: "background 0.1s, color 0.1s",
                    }}
                    onMouseEnter={(e) => {
                      if (!active) (e.currentTarget as HTMLElement).style.background = "var(--color-background-secondary)";
                    }}
                    onMouseLeave={(e) => {
                      if (!active) (e.currentTarget as HTMLElement).style.background = "transparent";
                    }}
                  >
                    <span style={{
                      fontSize: 13, width: 18, textAlign: "center", flexShrink: 0,
                      color: active ? "var(--color-accent)" : "var(--color-text-tertiary)",
                    }}>
                      {icon}
                    </span>
                    {itemLabel}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* ── Database switcher ───────────────────────────────────── */}
      <div style={{ padding: "12px 14px", borderTop: "1px solid var(--color-border-tertiary)", background: "var(--color-background-secondary)" }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--color-text-tertiary)", marginBottom: 6 }}>
          Active Database
        </div>
        {loading ? (
          <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>Loading…</div>
        ) : (
          <select
            value={activeDb?.id ?? ""}
            onChange={(e) => setActiveDbId(e.target.value)}
            style={{
              width: "100%", fontSize: 12, padding: "6px 8px",
              borderRadius: "var(--border-radius-md)",
              background: "var(--color-background-primary)",
              border: "1px solid var(--color-border-secondary)",
              color: "var(--color-text-primary)", fontWeight: 500,
              boxShadow: "var(--shadow-xs)",
            }}
          >
            {databases.map((db) => (
              <option key={db.id} value={db.id}>{db.name}</option>
            ))}
          </select>
        )}
        {activeDb && (
          <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginTop: 5, display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#16A34A", display: "inline-block" }} />
            {activeDb.adCount} ads collected
          </div>
        )}
      </div>
    </nav>
  );
}
