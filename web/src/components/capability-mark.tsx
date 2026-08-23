import type { Glyph } from "@/lib/capabilities";

const PATHS: Record<Glyph, React.ReactNode> = {
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
    </>
  ),
  handshake: (
    <>
      <circle cx="7" cy="10" r="3" />
      <circle cx="17" cy="10" r="3" />
      <path d="M10 10h4M9 20c0-3 1.5-4.5 3-4.5S15 17 15 20" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="m16 16 4 4" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  briefcase: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12h18" />
    </>
  ),
};

/** One icon set for every place a capability is explained or opened. */
export function CapabilityMark({
  glyph,
  className = "h-6 w-6",
}: {
  glyph: Glyph;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[glyph]}
    </svg>
  );
}
