"use client";

import { useEffect } from "react";

/**
 * Global error boundary (root layout crashes) — catches any render/runtime crash in the page
 * tree and shows a recoverable screen instead of Next's dead-end default
 * ("Application error"), which users read as being logged out with no way
 * back (2026-07-18 incident).
 *
 * Shows the real error message + digest so admins can report exactly what
 * broke instead of guessing.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    fetch("/api/client-crash", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error?.message,
        digest: error?.digest,
        stack: error?.stack,
        url: typeof window !== "undefined" ? window.location.href : "",
      }),
    }).catch(() => {});
  }, [error]);

  return (
    <html lang="en"><body style={{ margin: 0 }}>
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#0a0a0f", color: "#e5e7eb", fontFamily: "ui-sans-serif, system-ui, sans-serif", padding: "1rem",
    }}>
      <div style={{ maxWidth: 480, width: "100%", textAlign: "center" }}>
        <p style={{ fontSize: 40, marginBottom: 8 }}>🏀</p>
        <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Something broke on this page</h1>
        <p style={{ fontSize: 13, color: "#9ca3af", marginBottom: 16 }}>
          You are still signed in — this is a page error, not a logout. Try again below;
          if it keeps happening, send the error details to the admin.
        </p>
        <div style={{
          textAlign: "left", fontSize: 11, fontFamily: "ui-monospace, monospace", background: "#111118",
          border: "1px solid #27272f", borderRadius: 8, padding: "10px 12px", marginBottom: 16,
          wordBreak: "break-word", maxHeight: 140, overflow: "auto",
        }}>
          <div>{error?.message || "Unknown error"}</div>
          {error?.digest && <div style={{ color: "#6b7280", marginTop: 4 }}>digest: {error.digest}</div>}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={() => reset()} style={{
            background: "#16a34a", color: "#fff", border: 0, borderRadius: 8,
            padding: "10px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}>
            Try again
          </button>
          <button onClick={() => { window.location.href = "/"; }} style={{
            background: "transparent", color: "#9ca3af", border: "1px solid #27272f", borderRadius: 8,
            padding: "10px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}>
            Reload the app
          </button>
        </div>
      </div>
    </div>
    </body></html>
  );
}
