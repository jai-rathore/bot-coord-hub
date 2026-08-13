import type { ReactNode } from "react";
import { AmbientField } from "@/components/ambient-field";
import { BrandLink } from "@/components/brand-link";

type AuthShellProps = {
  children: ReactNode;
};

/** Lightweight HoneyMatcha chrome around Clerk auth so pages feel on-brand. */
export function AuthShell({ children }: AuthShellProps) {
  return (
    <main className="relative flex min-h-screen flex-col hm-atmosphere">
      <AmbientField />
      <header className="relative z-10 flex items-center px-4 py-4 sm:px-6">
        <BrandLink />
      </header>
      <div className="relative z-10 flex flex-1 items-center justify-center px-6 pb-16 pt-4">
        {children}
      </div>
    </main>
  );
}
