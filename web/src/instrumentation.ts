import type { Instrumentation } from "next";

/**
 * Next.js instrumentation hook.
 *
 * `onRequestError` is the piece that matters here: server-component and route
 * handler failures previously vanished, because the two most-trafficked routes
 * (`app/page.tsx`, `app/app/layout.tsx`) wrap their data loading in catches
 * that deliberately swallow DB errors so the UI still renders. Anything that
 * does reach Next now gets logged with the route that produced it.
 */

export function register(): void {
  if (process.env.PERF_LOG === "1") {
    console.log("[perf] query and external-call logging enabled");
  }
}

export const onRequestError: Instrumentation.onRequestError = (
  error,
  request,
  context,
) => {
  const message = error instanceof Error ? error.message : String(error);
  // React may replace the thrown instance during RSC rendering; the digest is
  // what identifies the original error when that happens.
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String((error as { digest?: unknown }).digest)
      : undefined;

  console.error(
    `[request-error] ${request.method} ${context.routePath || request.path}` +
      ` (${context.routeType})${digest ? ` digest=${digest}` : ""}: ${message}`,
    error,
  );
};
