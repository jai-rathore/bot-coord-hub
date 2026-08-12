/**
 * Normalize DATABASE_URL for Render Postgres (external URLs require SSL).
 * Localhost stays unchanged so local/dev Postgres keeps working.
 */
export function postgresConnectionOptions(url: string): {
  url: string;
  ssl: false | { rejectUnauthorized: boolean };
} {
  const isLocal =
    /@(localhost|127\.0\.0\.1)(:|\/)/i.test(url) ||
    url.includes("@localhost") ||
    url.startsWith("postgres://localhost") ||
    url.startsWith("postgresql://localhost");

  if (isLocal) {
    return { url, ssl: false };
  }

  // Ensure sslmode=require is present for drivers that read it from the URL
  // (drizzle-kit migrate) while also enabling SSL on the postgres.js client.
  let normalized = url;
  if (!/[?&]sslmode=/i.test(normalized)) {
    normalized += normalized.includes("?") ? "&sslmode=require" : "?sslmode=require";
  }

  return {
    url: normalized,
    // Render uses certificates that may not validate with default Node CAs.
    ssl: { rejectUnauthorized: false },
  };
}
