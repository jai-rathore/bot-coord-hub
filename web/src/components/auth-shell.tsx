import type { ReactNode } from "react";
import { BrandAtmosphere } from "@/components/brand-atmosphere";
import { BrandLink } from "@/components/brand-link";

type AuthShellProps = {
  children: ReactNode;
};

/** Lightweight HoneyMatcha chrome around Clerk auth so pages feel on-brand. */
export function AuthShell({ children }: AuthShellProps) {
  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-[linear-gradient(145deg,#fafcf9_0%,#edf4ee_52%,#f8f1df_100%)]">
      <BrandAtmosphere />
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
