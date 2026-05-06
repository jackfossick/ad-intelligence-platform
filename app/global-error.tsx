"use client";

export const dynamic = "force-dynamic";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{
        margin: 0,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        background: "#FAFAF7",
        color: "#1A1A1A",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
      }}>
        <div style={{ maxWidth: 520 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 14, color: "#555", marginBottom: 16 }}>
            The app hit an unexpected error. You can try again, or reload the page.
          </p>
          {error?.digest && (
            <p style={{ fontSize: 11, fontFamily: "ui-monospace, monospace", color: "#999", marginBottom: 16 }}>
              ref: {error.digest}
            </p>
          )}
          <button
            onClick={() => reset()}
            style={{
              padding: "8px 14px",
              fontSize: 13,
              border: "1px solid #DDD",
              borderRadius: 6,
              background: "white",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
