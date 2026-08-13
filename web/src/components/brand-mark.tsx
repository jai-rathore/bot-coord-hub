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
        cy="590"
        rx="168"
        ry="22"
        fill="#1f4a36"
        opacity="0.12"
        filter={`url(#${soft})`}
      />

      <g className="hm-bob origin-center">
        <ellipse cx="320" cy="560" rx="178" ry="30" fill={`url(#${saucer})`} />
        <ellipse
          cx="320"
          cy="552"
          rx="132"
          ry="16"
          fill="#d9c9a6"
          opacity="0.4"
        />

        <path
          d="M198 332c6 128 36 198 122 214 86-16 116-86 122-214"
          fill={`url(#${cup})`}
        />
        <path
          d="M214 344c6 108 32 170 106 184 74-14 100-76 106-184"
          fill="#fffdf8"
          opacity="0.28"
        />
        <path
          d="M454 368c42-8 58 42 18 78"
          fill="none"
          stroke={`url(#${cup})`}
          strokeWidth="18"
          strokeLinecap="round"
        />
        <path
          d="M454 368c42-8 58 42 18 78"
          fill="none"
          stroke="#fffdf8"
          strokeWidth="6"
          strokeLinecap="round"
          opacity="0.45"
        />

        <ellipse cx="320" cy="328" rx="138" ry="50" fill="#efe4cc" />
        <ellipse cx="320" cy="324" rx="118" ry="40" fill="#1f4a36" />
        <ellipse cx="320" cy="322" rx="110" ry="34" fill={`url(#${matcha})`} />

        <g className="hm-swirl origin-[320px_322px]" opacity="0.28">
          <ellipse
            cx="320"
            cy="322"
            rx="74"
            ry="15"
            fill="none"
            stroke="#dcefdc"
            strokeWidth="6"
          />
          <ellipse
            cx="320"
            cy="322"
            rx="44"
            ry="8"
            fill="none"
            stroke="#f7faf6"
            strokeWidth="4"
          />
        </g>

        <path
          className="hm-art"
          d="M248 338V292c0-14 22-14 22 0 0 10-10 18-22 23 20-16 42-16 44 8 0 10-2 20-4 22m4-22c20-24 36-22 34 4-2 10-5 18-9 20"
          fill="none"
          stroke="#fffaf0"
          strokeWidth="6.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <g className="hm-ripple origin-[328px_318px]">
          <ellipse
            cx="328"
            cy="318"
            rx="16"
            ry="5"
            fill="none"
            stroke="#f7de8a"
            strokeWidth="2.4"
          />
        </g>
      </g>

      <g className="hm-steam" opacity="0.5">
        <path
          d="M276 268c8-22 0-36 8-54"
          fill="none"
          stroke="#6f9a7c"
          strokeWidth="6"
          strokeLinecap="round"
        />
        <path
          d="M322 254c10-24 2-40 10-62"
          fill="none"
          stroke="#9ec79a"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path
          d="M366 266c8-20 0-34 8-52"
          fill="none"
          stroke="#6f9a7c"
          strokeWidth="5"
          strokeLinecap="round"
        />
      </g>

      <g className="hm-dipper origin-[470px_90px]">
        <path
          d="M548 56c-18 34-58 92-96 148"
          fill="none"
          stroke={`url(#${wood})`}
          strokeWidth="14"
          strokeLinecap="round"
        />
        <g transform="rotate(-38 430 230)">
          <ellipse cx="430" cy="230" rx="34" ry="22" fill={`url(#${wood})`} />
          <path
            d="M408 218h44M404 230h52M410 242h40"
            stroke="#7a4a22"
            strokeWidth="3"
            strokeLinecap="round"
            opacity="0.45"
          />
          <ellipse
            cx="430"
            cy="246"
            rx="18"
            ry="8"
            fill={`url(#${honey})`}
            opacity="0.95"
          />
        </g>
      </g>

      <g className="hm-drip">
        <path
          d="M412 258c7-13 20-13 20 0 0 13-10 22-10 22s-10-9-10-22z"
          fill={`url(#${honey})`}
        />
      </g>
    </svg>
  );
}
