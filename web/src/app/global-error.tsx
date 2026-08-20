"use client";

/**
 * Last-resort boundary for failures in the root layout itself, where the
 * normal error.tsx cannot render. It has to supply its own html/body.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, 'Segoe UI', sans-serif",
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f7f9f6",
          color: "#17211c",
        }}
      >
        <main style={{ maxWidth: "32rem", padding: "2rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", margin: 0 }}>HoneyMatcha is having a moment</h1>
          <p style={{ marginTop: "0.75rem", lineHeight: 1.7, color: "#5c6a62" }}>
            Something failed before the page could render. The problem has been
            logged.
          </p>
          {error.digest ? (
            <p style={{ marginTop: "1rem", fontSize: "0.75rem", color: "#5c6a62" }}>
              Reference: {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              cursor: "pointer",
              borderRadius: "0.5rem",
              border: "none",
              background: "#173f2e",
              color: "#fbfdf9",
              padding: "0.6rem 1.1rem",
              fontSize: "0.875rem",
              fontWeight: 600,
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
