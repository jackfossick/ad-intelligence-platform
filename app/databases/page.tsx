"use client";

import { useState } from "react";
import { useDb, type DbSummary } from "@/lib/db-context";

// ── Inline rename form ────────────────────────────────────────
function RenameForm({ db, onDone }: { db: DbSummary; onDone: () => void }) {
  const { refreshDatabases } = useDb();
  const [name, setName]     = useState(db.name);
  const [desc, setDesc]     = useState(db.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) { setError("Name cannot be empty."); return; }
    setSaving(true);
    setError(null);
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
    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
      <div>
        <label style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-tertiary)", display: "block", marginBottom: 3 }}>Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ width: "100%", padding: "6px 10px", fontSize: 13, borderRadius: "var(--border-radius-md)", border: "1px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") onDone(); }}
          autoFocus
        />
      </div>
      <div>
        <label style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-tertiary)", display: "block", marginBottom: 3 }}>Description (optional)</label>
        <input
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Short description…"
          style={{ width: "100%", padding: "6px 10px", fontSize: 13, borderRadius: "var(--border-radius-md)", border: "1px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") onDone(); }}
        />
      </div>
      {error && <p style={{ fontSize: 12, color: "#DC2626", margin: 0 }}>{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button className="btn btn-sm" onClick={onDone} disabled={saving}>Cancel</button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function DatabasesPage() {
  const { databases, activeDb, setActiveDbId, refreshDatabases, loading } = useDb();

  const [renamingId,  setRenamingId]  = useState<string | null>(null);
  const [deletingId,  setDeletingId]  = useState<string | null>(null);
  const [createOpen,  setCreateOpen]  = useState(false);
  const [newName,     setNewName]     = useState("");
  const [newDesc,     setNewDesc]     = useState("");
  const [creating,    setCreating]    = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // ── Create ──────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!newName.trim()) { setCreateError("Name is required."); return; }
    setCreating(true);
    setCreateError(null);
    const res = await fetch("/api/databases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() || null }),
    });
    const data = await res.json() as { id?: string; error?: string };
    setCreating(false);
    if (!res.ok) { setCreateError(data.error || "Failed to create."); return; }
    await refreshDatabases();
    if (data.id) setActiveDbId(data.id);
    setNewName(""); setNewDesc(""); setCreateOpen(false);
  };

  // ── Delete ──────────────────────────────────────────────────
  const handleDelete = async (db: DbSummary) => {
    if (databases.length <= 1) {
      setDeleteError("Cannot delete the last database.");
      return;
    }
    const confirmed = window.confirm(
      `Delete "${db.name}" and all ${db.adCount} ads?\n\nThis cannot be undone.`
    );
    if (!confirmed) return;

    setDeletingId(db.id);
    setDeleteError(null);
    const res = await fetch("/api/databases", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: db.id }),
    });
    const data = await res.json() as { error?: string };
    setDeletingId(null);
    if (!res.ok) { setDeleteError(data.error || "Failed to delete."); return; }

    // If we deleted the active database, switch to another
    if (activeDb?.id === db.id) {
      const next = databases.find((d) => d.id !== db.id);
      if (next) setActiveDbId(next.id);
    }
    await refreshDatabases();
  };

  return (
    <div>
      {/* ── Header ──────────────────────────────────────────── */}
      <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 500 }}>Databases</h2>
          <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 4 }}>
            {databases.length} database{databases.length !== 1 ? "s" : ""} · active:{" "}
            <strong>{activeDb?.name ?? "—"}</strong>
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => { setCreateOpen(true); setCreateError(null); }}>
          + New Database
        </button>
      </div>

      {/* ── Create form ─────────────────────────────────────── */}
      {createOpen && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">New Database</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-tertiary)", display: "block", marginBottom: 3 }}>Name *</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Weight Loss Campaign Q3"
                style={{ width: "100%", padding: "6px 10px", fontSize: 13, borderRadius: "var(--border-radius-md)", border: "1px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setCreateOpen(false); }}
                autoFocus
              />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-tertiary)", display: "block", marginBottom: 3 }}>Description (optional)</label>
              <input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Short description…"
                style={{ width: "100%", padding: "6px 10px", fontSize: 13, borderRadius: "var(--border-radius-md)", border: "1px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setCreateOpen(false); }}
              />
            </div>
            {createError && <p style={{ fontSize: 12, color: "#DC2626", margin: 0 }}>{createError}</p>}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={handleCreate} disabled={creating}>
                {creating ? "Creating…" : "Create Database"}
              </button>
              <button className="btn btn-sm" onClick={() => { setCreateOpen(false); setCreateError(null); setNewName(""); setNewDesc(""); }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete error ─────────────────────────────────────── */}
      {deleteError && (
        <div style={{ marginBottom: 12, padding: "8px 12px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "var(--border-radius-md)", fontSize: 12, color: "#DC2626" }}>
          {deleteError}
        </div>
      )}

      {/* ── Database list ────────────────────────────────────── */}
      {loading ? (
        <div className="empty-state"><p>Loading…</p></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {databases.map((db) => {
            const isActive   = db.id === activeDb?.id;
            const isRenaming = renamingId === db.id;
            const isDeleting = deletingId === db.id;
            const isOnly     = databases.length <= 1;

            return (
              <div
                key={db.id}
                className="card"
                style={{
                  borderColor: isActive ? "var(--color-accent)" : undefined,
                  boxShadow:   isActive ? "0 0 0 1px var(--color-accent)" : undefined,
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>

                  {/* Active dot */}
                  <div style={{ paddingTop: 3, flexShrink: 0 }}>
                    <span style={{
                      display: "inline-block", width: 8, height: 8, borderRadius: "50%",
                      background: isActive ? "#16A34A" : "var(--color-border-tertiary)",
                    }} title={isActive ? "Active" : "Inactive"} />
                  </div>

                  {/* Info + rename form */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" }}>
                        {db.name}
                      </span>
                      {isActive && (
                        <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 10, background: "var(--color-accent-light, #EEF4FF)", color: "var(--color-accent-dark, #1D64D8)" }}>
                          Active
                        </span>
                      )}
                      <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
                        {db.adCount} ad{db.adCount !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {db.description && (
                      <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2, lineHeight: 1.4 }}>
                        {db.description}
                      </p>
                    )}
                    {isRenaming && (
                      <RenameForm db={db} onDone={() => setRenamingId(null)} />
                    )}
                  </div>

                  {/* Action buttons */}
                  {!isRenaming && (
                    <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {!isActive && (
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => setActiveDbId(db.id)}
                        >
                          Set Active
                        </button>
                      )}
                      <button className="btn btn-sm" onClick={() => setRenamingId(db.id)}>
                        Rename
                      </button>
                      <button
                        className="btn btn-sm"
                        onClick={() => handleDelete(db)}
                        disabled={isDeleting || isOnly}
                        style={{
                          borderColor: isOnly ? undefined : "#FECACA",
                          color:       isOnly ? undefined : "#DC2626",
                          opacity:     isOnly ? 0.4 : 1,
                          cursor:      isOnly ? "not-allowed" : undefined,
                        }}
                        title={isOnly ? "Cannot delete the last database" : undefined}
                      >
                        {isDeleting ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Note ─────────────────────────────────────────────── */}
      <div style={{ marginTop: 24, padding: "12px 16px", background: "var(--color-background-secondary)", border: "1px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
        The <strong>active database</strong> is used across Collect, Library, Insights, and Export.
        You can also switch it from the selector in the sidebar. Deleting a database permanently removes all its ads.
      </div>
    </div>
  );
}
