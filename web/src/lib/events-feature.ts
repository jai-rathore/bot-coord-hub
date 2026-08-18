/**
 * Events feature flag. Mirrors discovery-feature.ts: explicit env wins, and
 * non-production defaults to on so local development needs no extra setup.
 */
export function eventsFeatureEnabled(): boolean {
  const configured = process.env.ENABLE_EVENTS?.trim().toLowerCase();
  if (configured === "true" || configured === "1") return true;
  if (configured === "false" || configured === "0") return false;
  return process.env.NODE_ENV !== "production";
}
