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

type BrandHeroProps = {
  className?: string;
};

/**
 * Living brand scene for the marketing hero: complete cup, hm latte art,
 * honey dipper, looping drip, steam, and sparkles. Never cropped.
 */
export function BrandHero({ className = "" }: BrandHeroProps) {
  const uid = useId().replace(/:/g, "");
  const glow = `${uid}-glow`;
  const cup = `${uid}-cup`;
  const saucer = `${uid}-saucer`;
  const matcha = `${uid}-matcha`;
  const honey = `${uid}-honey`;
  const wood = `${uid}-wood`;
  const soft = `${uid}-soft`;

  return (
    <svg
      viewBox="0 0 640 680"
      className={className}
      role="img"
      aria-label="Honey dripping into a cup of matcha, with an hm mark on the foam"
    >
      <defs>
        <radialGradient id={glow} cx="50%" cy="46%" r="48%">
          <stop offset="0%" stopColor="#f4e7b0" stopOpacity="0.55" />
          <stop offset="42%" stopColor="#6f9a7c" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#6f9a7c" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={cup} x1="0.15" y1="0.1" x2="0.9" y2="1">
          <stop offset="0%" stopColor="#fffdf8" />
          <stop offset="48%" stopColor="#f3ead8" />
          <stop offset="100%" stopColor="#e2d3b4" />
        </linearGradient>
        <linearGradient id={saucer} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fffaf0" />
          <stop offset="100%" stopColor="#e8dcc3" />
        </linearGradient>
        <radialGradient id={matcha} cx="42%" cy="38%" r="68%">
          <stop offset="0%" stopColor="#9ec79a" />
          <stop offset="38%" stopColor="#4f8a63" />
          <stop offset="100%" stopColor="#234e38" />
        </radialGradient>
        <linearGradient id={honey} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f7de8a" />
          <stop offset="45%" stopColor="#e0b04a" />
          <stop offset="100%" stopColor="#b8862a" />
        </linearGradient>
        <linearGradient id={wood} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e6c48a" />
          <stop offset="50%" stopColor="#b07a3a" />
          <stop offset="100%" stopColor="#7a4a22" />
        </linearGradient>
        <filter id={soft} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      <circle cx="320" cy="340" r="250" fill={`url(#${glow})`} />

      <g className="hm-sparkle origin-center" opacity="0.85">
        <circle cx="96" cy="168" r="3.2" fill="#c49a3c" />
        <circle cx="538" cy="214" r="2.4" fill="#6f9a7c" />
        <circle cx="122" cy="470" r="2.6" fill="#e8d29a" />
        <circle cx="534" cy="486" r="3" fill="#c49a3c" />
        <circle cx="86" cy="320" r="2" fill="#fffaf0" />
        <circle cx="560" cy="340" r="2.1" fill="#fffaf0" />
      </g>

      <ellipse
        cx="320"
        cy="548"
        rx="168"
        ry="22"
        fill="#1f4a36"
        opacity="0.12"
        filter={`url(#${soft})`}
      />

      <g className="hm-bob origin-center">
        <ellipse cx="320" cy="528" rx="156" ry="28" fill={`url(#${saucer})`} />
        <ellipse
          cx="320"
          cy="522"
          rx="118"
          ry="16"
          fill="#d9c9a6"
          opacity="0.45"
        />

        <path
          d="M186 318c8 118 38 196 134 210 96-14 126-92 134-210"
          fill={`url(#${cup})`}
        />
        <path
          d="M198 328c8 102 34 172 122 184 88-12 114-82 122-184"
          fill="#fffdf8"
          opacity="0.35"
        />
        <path
          d="M214 300c18 8 70 14 106 14 36 0 88-6 106-14"
          fill="none"
          stroke="#fffdf8"
          strokeWidth="10"
          strokeLinecap="round"
          opacity="0.55"
        />

        <ellipse cx="320" cy="304" rx="142" ry="48" fill="#efe4cc" />
        <ellipse cx="320" cy="300" rx="124" ry="40" fill="#1f4a36" />
        <ellipse cx="320" cy="298" rx="116" ry="34" fill={`url(#${matcha})`} />

        <g className="hm-swirl origin-[320px_298px]" opacity="0.28">
          <ellipse
            cx="320"
            cy="298"
            rx="78"
            ry="16"
            fill="none"
            stroke="#dcefdc"
            strokeWidth="6"
          />
          <ellipse
            cx="320"
            cy="298"
            rx="46"
            ry="9"
            fill="none"
            stroke="#f7faf6"
            strokeWidth="4"
          />
        </g>

        <path
          className="hm-art"
          d="M240 318V268c0-16 24-16 24 0 0 12-12 20-24 26 22-18 46-18 48 10 0 12-2 22-4 24m4-24c22-28 40-24 38 4-2 12-6 20-10 22"
          fill="none"
          stroke="#fffaf0"
          strokeWidth="6.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <g className="hm-ripple origin-[320px_298px]">
          <ellipse
            cx="304"
            cy="292"
            rx="18"
            ry="6"
            fill="none"
            stroke="#f7de8a"
            strokeWidth="2.4"
          />
        </g>
      </g>

      <g className="hm-steam" opacity="0.55">
        <path
          d="M268 250c8-22 0-36 8-54"
          fill="none"
          stroke="#6f9a7c"
          strokeWidth="6"
          strokeLinecap="round"
        />
        <path
          d="M318 236c10-24 2-40 10-62"
          fill="none"
          stroke="#9ec79a"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path
          d="M364 248c8-20 0-34 8-52"
          fill="none"
          stroke="#6f9a7c"
          strokeWidth="5"
          strokeLinecap="round"
        />
      </g>

      <g className="hm-dipper origin-[430px_120px]">
        <path
          d="M486 48c28 18 62 86 78 132"
          fill="none"
          stroke={`url(#${wood})`}
          strokeWidth="16"
          strokeLinecap="round"
        />
        <ellipse
          cx="430"
          cy="214"
          rx="38"
          ry="26"
          fill={`url(#${wood})`}
          transform="rotate(-28 430 214)"
        />
        <path
          d="M404 200h52M400 214h60M408 226h46"
          stroke="#7a4a22"
          strokeWidth="3.2"
          strokeLinecap="round"
          opacity="0.45"
          transform="rotate(-28 430 214)"
        />
        <ellipse
          cx="418"
          cy="228"
          rx="22"
          ry="10"
          fill={`url(#${honey})`}
          opacity="0.92"
          transform="rotate(-28 430 214)"
        />
      </g>

      <g className="hm-drip">
        <path
          d="M392 236c8-14 22-14 22 0 0 14-11 24-11 24s-11-10-11-24z"
          fill={`url(#${honey})`}
        />
      </g>
    </svg>
  );
}
