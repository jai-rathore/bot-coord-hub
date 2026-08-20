/**
 * The light behind the page.
 *
 * This used to also draw two hairline rings — a 12rem one at `left-[42%]` and
 * a floating 4rem one at `right-[18%]`. They outlined nothing, referred to
 * nothing, and because both were positioned in percentages they landed
 * somewhere different at every width; on a phone the large one sat squarely
 * behind the headline and read as a printing fault rather than a decision.
 *
 * What is left is light: two soft washes anchored off opposite corners, in the
 * two brand colours, under a grain. Atmosphere should be something you notice
 * only if you go looking for it, and never something the text has to survive.
 */
export function BrandAtmosphere({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      aria-hidden="true"
    >
      <span className="brand-grain" />
      <span className="animate-drift [will-change:transform] absolute -top-40 -left-28 h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(circle,rgba(117,161,132,0.28),transparent_68%)] blur-3xl" />
      <span className="animate-drift-alt [will-change:transform] absolute -right-24 -bottom-16 h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,rgba(240,220,168,0.42),transparent_70%)] blur-3xl" />
    </div>
  );
}
