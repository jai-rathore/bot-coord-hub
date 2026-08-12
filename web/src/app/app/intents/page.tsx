import Link from "next/link";

export default function AppIntentsPage() {
  return (
    <div>
      <h1 className="font-[family-name:var(--font-fraunces)] text-3xl font-semibold tracking-[-0.02em] text-matcha-deep">
        Intents
      </h1>
      <p className="mt-2 max-w-xl text-muted">
        Browse the public intent registry or propose a new coordination type.
      </p>
      <Link
        href="/intents"
        className="mt-6 inline-flex rounded-md border border-matcha-deep bg-matcha-deep px-4 py-2 text-sm font-semibold text-[#f7faf6] no-underline transition hover:bg-matcha"
      >
        Open intents registry
      </Link>
    </div>
  );
}
