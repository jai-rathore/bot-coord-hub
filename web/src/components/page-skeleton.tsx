/**
 * Placeholder shown while a route segment's data loads.
 *
 * The app had no loading UI at all: every /app page is rendered per request,
 * so navigation showed the previous screen, unchanged, until the server
 * answered. Mirroring the real PageHeading + card layout keeps the swap from
 * shifting the page around when the content arrives.
 */
export function PageSkeleton({
  rows = 3,
  showHeading = true,
}: {
  /** Roughly how many content blocks the real page shows. */
  rows?: number;
  showHeading?: boolean;
}) {
  return (
    <div className="animate-pulse" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      {showHeading ? (
        <div className="flex flex-col gap-5 border-b border-line/80 pb-7">
          <div>
            <div className="h-3 w-28 rounded bg-line/70" />
            <div className="mt-3 h-9 w-64 max-w-full rounded bg-line/60" />
            <div className="mt-4 h-4 w-full max-w-xl rounded bg-line/50" />
          </div>
        </div>
      ) : null}
      <div className="mt-8 space-y-4">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="surface-card h-24 w-full" />
        ))}
      </div>
    </div>
  );
}
