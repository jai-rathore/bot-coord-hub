export function discoveryFeatureEnabled(): boolean {
  const configured = process.env.ENABLE_DISCOVERY?.trim().toLowerCase();
  if (configured === "true" || configured === "1") return true;
  if (configured === "false" || configured === "0") return false;
  return process.env.NODE_ENV !== "production";
}
