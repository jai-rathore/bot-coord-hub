import Image from "next/image";
import Link from "next/link";

type BrandLinkProps = {
  className?: string;
  href?: string;
  /**
   * Show the serif wordmark next to the mark from `sm` and up (default true).
   * Below `sm`, only the logo mark is shown (wordmark stays available to AT via sr-only).
   */
  showWordmark?: boolean;
};

/** HoneyMatcha mark + optional wordmark for headers / auth chrome. */
export function BrandLink({
  className = "",
  href = "/",
  showWordmark = true,
}: BrandLinkProps) {
  return (
    <Link
      href={href}
      className={`inline-flex min-w-0 items-center gap-1.5 text-matcha-deep no-underline transition hover:text-matcha sm:gap-2 ${className}`}
    >
      <Image
        src="/logo-mark.png"
        alt=""
        width={32}
        height={32}
        className="h-7 w-7 shrink-0 rounded-full sm:h-8 sm:w-8"
        priority
      />
      {showWordmark ? (
        <span className="hidden whitespace-nowrap font-[family-name:var(--font-fraunces)] text-lg font-semibold sm:inline">
          HoneyMatcha
        </span>
      ) : null}
      <span className={showWordmark ? "sr-only sm:hidden" : "sr-only"}>
        HoneyMatcha
      </span>
    </Link>
  );
}
