import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";

type BrandLinkProps = {
  className?: string;
  /**
   * Show the serif wordmark next to the mark from `sm` and up (default true).
   * Below `sm`, only the logo mark is shown (wordmark stays available to AT via sr-only).
   */
  showWordmark?: boolean;
};

/** HoneyMatcha mark + optional wordmark for headers / auth chrome. */
export function BrandLink({
  className = "",
  showWordmark = true,
}: BrandLinkProps) {
  return (
    <Link
      href="/"
      className={`inline-flex min-w-0 items-center gap-1.5 text-matcha-deep no-underline transition hover:text-matcha sm:gap-2 ${className}`}
    >
      <BrandMark className="h-8 w-8 shrink-0 sm:h-9 sm:w-9" />
      {showWordmark ? (
        <span className="hidden whitespace-nowrap font-[family-name:var(--font-fraunces)] text-lg font-semibold tracking-[-0.02em] sm:inline">
          HoneyMatcha
        </span>
      ) : null}
      <span className={showWordmark ? "sr-only sm:hidden" : "sr-only"}>
        HoneyMatcha
      </span>
    </Link>
  );
}
