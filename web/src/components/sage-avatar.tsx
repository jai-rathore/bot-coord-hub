import Image from "next/image";

/**
 * Sage, with a face.
 *
 * It was a ✦ in a green circle, which is what an agent looks like when nobody
 * has decided what it is. Giving it a portrait is the cheapest way to say the
 * thing the copy now says out loud: this is somebody working for you, not a
 * feature of the page.
 *
 * Small on purpose. The illustration is warm and the rest of the product is
 * severe typography, and at avatar size the two do not have to compete.
 */
export function SageAvatar({
  size = 36,
  className = "",
  alt = "",
}: {
  size?: number;
  className?: string;
  /** Empty by default: next to Sage's own name the picture is decoration. */
  alt?: string;
}) {
  return (
    <span
      className={`relative inline-block shrink-0 overflow-hidden rounded-full bg-matcha-soft/20 ring-1 ring-matcha-soft/40 ${className}`}
      style={{ width: size, height: size }}
    >
      <Image
        src="/sage-avatar.webp"
        alt={alt}
        width={size * 2}
        height={size * 2}
        className="h-full w-full object-cover"
        aria-hidden={alt === "" ? true : undefined}
      />
    </span>
  );
}

/**
 * The whole seated figure, for the few places with room for it — an empty
 * list, or the page that explains what an agent is for.
 */
export function SagePortrait({
  className = "",
  width = 180,
}: {
  className?: string;
  width?: number;
}) {
  return (
    <Image
      src="/sage-portrait.webp"
      alt=""
      aria-hidden
      width={width}
      height={Math.round((width * 622) / 520)}
      className={className}
    />
  );
}
