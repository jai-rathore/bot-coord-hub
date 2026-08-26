export type NavGlyph =
  | "home"
  | "events"
  | "people"
  | "discovery"
  | "briefcase"
  | "code"
  | "approvals"
  | "agent"
  | "settings"
  | "more";

const PATHS: Record<NavGlyph, React.ReactNode> = {
  home: <path d="M4 11.5 12 5l8 6.5V20h-5v-5H9v5H4v-8.5Z" />,
  events: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16M9 14h2M9 17h6" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="9" r="3" />
      <circle cx="17" cy="10" r="2" />
      <path d="M3.5 20c.4-4 2.2-6 5.5-6s5.1 2 5.5 6M15 15c3.1 0 4.8 1.7 5 5" />
    </>
  ),
  discovery: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="m16 16 4 4M11 8v6M8 11h6" />
    </>
  ),
  briefcase: (
    <>
      <rect x="3.5" y="7" width="17" height="12" rx="2" />
      <path d="M9 7V5h6v2M3.5 12.5c4.8 2.1 12.2 2.1 17 0M10.5 13.5h3" />
    </>
  ),
  code: (
    <>
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <path d="M14 14h3v3M20 20h-3M20 14v3" />
    </>
  ),
  approvals: (
    <>
      <path d="M12 3 2.8 19h18.4L12 3Z" />
      <path d="M12 9v4m0 3h.01" />
    </>
  ),
  agent: (
    <>
      <rect x="4" y="8" width="16" height="11" rx="3" />
      <path d="M12 4v4M8.5 13h.01M15.5 13h.01M9 16.5h6" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 4.5v-1M12 20.5v-1M19 12h1M4 12H3M17 7l.7-.7M6.3 17.7l-.7.7M17 17l.7.7M6.3 6.3l-.7-.7" />
    </>
  ),
  more: (
    <>
      <circle cx="5.5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="18.5" cy="12" r="1.4" />
    </>
  ),
};

/** One icon set for both navs, so a destination looks the same whether it is
 *  reached from the desktop rail or the phone's tab bar. */
export function NavIcon({
  kind,
  className = "h-4 w-4 shrink-0",
}: {
  kind: NavGlyph;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[kind]}
    </svg>
  );
}
