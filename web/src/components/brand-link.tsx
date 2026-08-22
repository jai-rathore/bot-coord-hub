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
      className={`group inline-flex min-h-11 min-w-0 items-center gap-2.5 text-matcha-deep no-underline ${className}`}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-matcha-soft/25 bg-white/75 shadow-[0_5px_16px_rgba(23,63,46,0.09)] transition duration-200 group-hover:-rotate-2 group-hover:scale-[1.04] group-hover:border-matcha-soft/60">
        <Image
          src="/logo-mark.png"
          alt=""
          width={32}
          height={32}
          className="h-7 w-7 rounded-full"
          priority
        />
      </span>
      {showWordmark ? (
        <span className="hidden whitespace-nowrap font-[family-name:var(--font-fraunces)] text-xl font-semibold tracking-[-0.03em] sm:inline">
          Honey<span className="text-honey">Matcha</span>
        </span>
      ) : null}
      <span className={showWordmark ? "sr-only sm:hidden" : "sr-only"}>
        HoneyMatcha
      </span>
    </Link>
  );
}
