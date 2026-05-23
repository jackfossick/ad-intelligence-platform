"use client";

import { useEffect } from "react";

export interface ConfirmModalProps {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !loading) onCancel();
      if (e.key === "Enter" && !loading) onConfirm();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, loading, onCancel, onConfirm]);

  if (!open) return null;

  return (
    <div
      onClick={() => { if (!loading) onCancel(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-background-primary)",
          borderRadius: 12,
          padding: 24,
          maxWidth: 440,
          width: "90%",
          border: "1px solid var(--color-border-secondary)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
        }}
      >
        <h3 id="confirm-modal-title" style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
          {title}
        </h3>
        <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 16, lineHeight: 1.5 }}>
          {description}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            className="btn btn-sm"
            onClick={onCancel}
            disabled={loading}
            autoFocus
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            style={
              destructive
                ? { background: "#D14040", color: "white", border: "none" }
                : { background: "var(--color-accent)", color: "white", border: "none" }
            }
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
