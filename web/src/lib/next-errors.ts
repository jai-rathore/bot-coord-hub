/**
 * Next.js signals control flow by throwing. `redirect()`, `notFound()`, and the
 * static-generation bailout for `headers()`/`cookies()` are all errors carrying
 * a known `digest`, and every one of them must reach the framework.
 *
 * Route code that wraps data loading in a defensive catch has to let these
 * through, otherwise a redirect silently does nothing and a page that should be
 * marked dynamic is mis-detected during the build.
 */
const CONTROL_FLOW_DIGESTS = [
  "NEXT_REDIRECT",
  // notFound(), forbidden(), unauthorized()
  "NEXT_HTTP_ERROR_FALLBACK",
  // thrown by headers()/cookies()/searchParams during static generation
  "DYNAMIC_SERVER_USAGE",
];

export function isNextControlFlowError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("digest" in error)) return false;
  const digest = (error as { digest?: unknown }).digest;
  if (typeof digest !== "string") return false;
  return CONTROL_FLOW_DIGESTS.some((known) => digest.startsWith(known));
}
