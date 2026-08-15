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
      <span className="animate-drift absolute -top-40 -left-28 h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(circle,rgba(117,161,132,0.28),transparent_68%)] blur-3xl" />
      <span className="animate-drift-alt absolute -right-24 -bottom-16 h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,rgba(240,220,168,0.42),transparent_70%)] blur-3xl" />
      <span className="absolute top-24 left-[42%] h-48 w-48 rounded-full border border-matcha-soft/12" />
      <span className="animate-float-soft absolute top-[38%] right-[18%] h-16 w-16 rounded-full border border-honey/20" />
    </div>
  );
}
