import Link from "next/link";

const LINKS = [
  { href: "/how-to-connect-agents", label: "How to connect agents" },
  { href: "/faq", label: "FAQ" },
  { href: "/agents", label: "Connect an assistant" },
  { href: "/docs", label: "Docs" },
  { href: "/support", label: "Support" },
  { href: "/privacy", label: "Privacy" },
] as const;

export function PublicFooter({
  className = "",
}: {
  className?: string;
}) {
  return (
    <footer
      className={`mt-10 border-t border-line pt-5 text-sm text-muted ${className}`}
    >
      <nav
        aria-label="Public pages"
        className="flex flex-wrap gap-x-5 gap-y-2"
      >
        {LINKS.map((link) => (
          <Link key={link.href} href={link.href}>
            {link.label}
          </Link>
        ))}
      </nav>
    </footer>
  );
}
