"use client";

import Link from "next/link";

/**
 * Route-level error boundary.
 *
 * Without this, an unhandled throw in any server component fell through to
 * Next's raw error page: no branding, no way back, and no retry.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-20">
      <p className="section-kicker">Something went wrong</p>
      <h1 className="display-title mt-2 text-3xl">
        That page didn&apos;t load
      </h1>
      <p className="mt-3 text-sm leading-7 text-muted">
        The problem has been logged. Trying again often clears it: nothing you
        submitted was lost.
      </p>
      {error.digest ? (
        <p className="mt-4 text-xs text-muted">Reference: {error.digest}</p>
      ) : null}
      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={reset}
          className="button-primary cursor-pointer px-4 py-2 text-sm"
        >
          Try again
        </button>
        <Link
          href="/app"
          className="cursor-pointer rounded-md border border-line px-4 py-2 text-sm font-medium text-ink no-underline"
        >
          Back to your workspace
        </Link>
      </div>
    </main>
  );
}
