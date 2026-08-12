import Link from "next/link";
import type { ReactNode } from "react";

type AuthShellProps = {
  children: ReactNode;
};

/** Lightweight HoneyMatcha chrome around Clerk auth so pages feel on-brand. */
export function AuthShell({ children }: AuthShellProps) {
  return (
    <main className="flex min-h-screen flex-col bg-[linear-gradient(165deg,#f8fbf7_0%,#eef4ef_48%,#f0ebe0_100%)]">
      <header className="relative z-10 flex items-center px-4 py-4 sm:px-6">
        <Link
          href="/"
          className="font-[family-name:var(--font-fraunces)] text-lg font-semibold text-matcha-deep no-underline transition hover:text-matcha"
        >
          HoneyMatcha
        </Link>
      </header>
      <div className="flex flex-1 items-center justify-center px-6 pb-16 pt-4">
        {children}
      </div>
    </main>
  );
}
