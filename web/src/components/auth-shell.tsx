import type { ReactNode } from "react";
import { BrandLink } from "@/components/brand-link";

type AuthShellProps = {
  children: ReactNode;
};

/** Lightweight HoneyMatcha chrome around Clerk auth so pages feel on-brand. */
export function AuthShell({ children }: AuthShellProps) {
  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-[linear-gradient(145deg,#fafcf9_0%,#edf4ee_52%,#f8f1df_100%)]">
      <div
        className="pointer-events-none absolute -top-48 -left-40 h-[32rem] w-[32rem] rounded-full bg-matcha-soft/15 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -right-40 -bottom-48 h-[32rem] w-[32rem] rounded-full bg-honey-soft/30 blur-3xl"
        aria-hidden="true"
      />
      <header className="relative z-10 px-4 py-5 sm:px-6">
        <div className="mx-auto w-full max-w-[72rem]">
          <BrandLink />
        </div>
      </header>
      <div className="relative z-10 flex flex-1 items-center justify-center px-6 pt-4 pb-16">
        {children}
      </div>
    </main>
  );
}
