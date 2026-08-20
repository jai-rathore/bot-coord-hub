"use client";

import { useLinkStatus } from "next/link";

/**
 * Shows that a tapped nav destination is loading.
 *
 * Both navs style their selected state from usePathname(), which only updates
 * once navigation has committed — so tapping a tab produced no visual change
 * at all until the server answered. useLinkStatus reports the pending state of
 * the enclosing Link, so this must be rendered inside one.
 */
export function NavPending({ className = "" }: { className?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-current ${className}`}
    />
  );
}
