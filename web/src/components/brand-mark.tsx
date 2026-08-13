import { useId } from "react";

type BrandMarkProps = {
  className?: string;
  title?: string;
};

/**
 * Compact HoneyMatcha mark for headers and chrome.
 * A full, uncropped cup-and-drop scene reads as a muddy 28px photo,
 * so the nav mark is a matcha disc + hm monogram + honey drop.
 */
export function BrandMark({
  className = "h-8 w-8",
  title = "HoneyMatcha",
}: BrandMarkProps) {
  const uid = useId().replace(/:/g, "");
  const fill = `${uid}-fill`;
  const honey = `${uid}-honey`;

  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label={title}
    >
      <defs>
        <radialGradient id={fill} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#4f8a63" />
          <stop offset="55%" stopColor="#2f6b4a" />
          <stop offset="100%" stopColor="#1a3f2e" />
        </radialGradient>
        <linearGradient id={honey} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f0d27a" />
          <stop offset="100%" stopColor="#c49a3c" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="32" fill={`url(#${fill})`} />
      <circle
        cx="32"
        cy="32"
        r="29.5"
        fill="none"
        stroke={`url(#${honey})`}
        strokeWidth="2.2"
        opacity="0.9"
      />
      <path
        d="M17 47V18c0-8 12-8 12 0 0 6-6 10-12 13 11-9 23-9 24 5 0 6-1 11-2 12m2-12c11-14 20-12 19 2-1 6-3 10-5 11"
        fill="none"
        stroke="#fffaf0"
        strokeWidth="3.15"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M48.2 14.2c2.6-4.6 8.2-4.6 8.2 0 0 4.6-4.1 8.4-4.1 8.4s-4.1-3.8-4.1-8.4z"
        fill={`url(#${honey})`}
      />
    </svg>
  );
}
