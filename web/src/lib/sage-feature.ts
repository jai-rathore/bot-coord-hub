/** Explicit production gate for the shared Sage job control plane. */
export function sageJobsFeatureEnabled(): boolean {
  const configured = process.env.ENABLE_SAGE_JOBS?.trim().toLowerCase();
  if (configured === "true" || configured === "1") return true;
  if (configured === "false" || configured === "0") return false;
  return process.env.NODE_ENV !== "production";
}
