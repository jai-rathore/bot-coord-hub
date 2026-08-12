import Image from "next/image";
import Link from "next/link";

type BrandLinkProps = {
  className?: string;
  /** Show the serif wordmark next to the mark (default true). */
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
      className={`inline-flex items-center gap-2 text-matcha-deep no-underline transition hover:text-matcha ${className}`}
    >
      <Image
        src="/logo-mark.png"
        alt=""
        width={32}
        height={32}
        className="h-8 w-8 rounded-full"
        priority
      />
      {showWordmark ? (
        <span className="font-[family-name:var(--font-fraunces)] text-lg font-semibold">
          HoneyMatcha
        </span>
      ) : (
        <span className="sr-only">HoneyMatcha</span>
      )}
    </Link>
  );
}
