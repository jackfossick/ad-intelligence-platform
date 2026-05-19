"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// ── Design tokens (mirror docs/design.html) ───────────────────
const T = {
  accent: "#5B4FD9", al: "#EEEDFE",
  bg2: "#fff", bg3: "#f1efe8",
  text: "#1a1a18", text2: "#73726c",
  border: "#e8e6df",
} as const;

// Match icon order from docs/design.html: Analytics, Library, Review,
// divider, Validate, Export, divider, Collect-at-bottom.
const NAV: { href: string; label: string; icon: React.ReactElement; group: "top" | "mid" | "bot" }[] = [
  { href: "/insights", label: "Analytics", group: "top", icon: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1"  y="9" width="3" height="6"  rx="1" stroke="currentColor" strokeWidth="1.2"/>
      <rect x="6"  y="5" width="3" height="10" rx="1" stroke="currentColor" strokeWidth="1.2"/>
      <rect x="11" y="2" width="3" height="13" rx="1" stroke="currentColor" strokeWidth="1.2"/>
    </svg>
  ) },
  { href: "/library", label: "Library", group: "top", icon: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
      <rect x="9" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
      <rect x="1" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
      <rect x="9" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
    </svg>
  ) },
  { href: "/review", label: "Review", group: "top", icon: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ) },
  { href: "/validate", label: "Validate", group: "mid", icon: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 1L10 5h4l-3 3 1 4-4-2-4 2 1-4L2 5h4L8 1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
    </svg>
  ) },
  { href: "/export", label: "Export", group: "mid", icon: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 10V2m0 8l-3-3m3 3l3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M2 12h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ) },
  { href: "/collect", label: "Collect", group: "bot", icon: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M8 5v6M5 8h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ) },
];

const SIDEBAR_W = 52;

export default function Sidebar() {
  const pathname = usePathname();

  const top = NAV.filter((n) => n.group === "top");
  const mid = NAV.filter((n) => n.group === "mid");
  const bot = NAV.filter((n) => n.group === "bot");

  return (
    <nav style={{
      position: "fixed", left: 0, top: 0, bottom: 0, width: SIDEBAR_W,
      background: T.bg2,
      borderRight: `1px solid ${T.border}`,
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "14px 0", gap: 4, zIndex: 100,
    }}>
      {/* Logo */}
      <div style={{
        width: 28, height: 28, borderRadius: 8, background: T.accent,
        display: "flex", alignItems: "center", justifyContent: "center",
        marginBottom: 12, flexShrink: 0,
      }}>
        <div style={{ width: 12, height: 12, borderRadius: 3, background: "#fff", opacity: 0.9 }} />
      </div>

      {top.map((n) => <NavItem key={n.href} {...n} active={isActive(pathname, n.href)} />)}
      <Divider />
      {mid.map((n) => <NavItem key={n.href} {...n} active={isActive(pathname, n.href)} />)}
      <Divider />
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
        {bot.map((n) => <NavItem key={n.href} {...n} active={isActive(pathname, n.href)} />)}
      </div>
    </nav>
  );
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/insights") return pathname === "/insights" || pathname.startsWith("/insights/");
  return pathname === href || pathname.startsWith(href + "/");
}

function NavItem({ href, label, icon, active }: { href: string; label: string; icon: React.ReactElement; active: boolean }) {
  const [hover, setHover] = useState(false);
  return (
    <Link
      href={href}
      aria-label={label}
      style={{
        width: 36, height: 36, borderRadius: 10,
        display: "flex", alignItems: "center", justifyContent: "center",
        position: "relative", cursor: "pointer",
        background: active ? T.al : hover ? T.bg3 : "transparent",
        color: active ? T.accent : T.text2,
        textDecoration: "none",
        transition: "background 0.15s",
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {icon}
      {hover && <span style={tipStyle()}>{label}</span>}
    </Link>
  );
}

function Divider() {
  return <div style={{ width: 20, height: 1, background: T.border, margin: "6px 0", flexShrink: 0 }} />;
}

function tipStyle(): React.CSSProperties {
  return {
    position: "absolute", left: 46, top: "50%", transform: "translateY(-50%)",
    background: T.bg2, border: "1px solid #d3d1c7", borderRadius: 6,
    padding: "4px 9px", fontSize: 11, whiteSpace: "nowrap", color: T.text,
    zIndex: 200, pointerEvents: "none",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
  };
}

export const SIDEBAR_WIDTH = SIDEBAR_W;
