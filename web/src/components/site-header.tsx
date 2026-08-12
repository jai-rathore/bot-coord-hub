import Link from "next/link";
import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";

export function SiteHeader() {
  return (
    <header className="relative z-10 flex items-center justify-between gap-4 px-4 py-4 sm:px-6">
      <Link
        href="/"
        className="font-[family-name:var(--font-fraunces)] text-lg font-semibold text-matcha-deep no-underline"
      >
        HoneyMatcha
      </Link>
      <nav className="flex items-center gap-3 text-sm font-medium">
        <Link href="/docs" className="text-muted no-underline hover:text-matcha-deep">
          Docs
        </Link>
        <Link href="/intents" className="text-muted no-underline hover:text-matcha-deep">
          Intents
        </Link>
        <Show when="signed-out">
          <SignInButton mode="redirect">
            <button
              type="button"
              className="cursor-pointer rounded-md border border-line bg-transparent px-3 py-1.5 text-matcha-deep transition hover:border-matcha-soft hover:bg-[rgba(255,252,246,0.55)]"
            >
              Sign in
            </button>
          </SignInButton>
          <SignUpButton mode="redirect">
            <button
              type="button"
              className="cursor-pointer rounded-md border border-matcha-deep bg-matcha-deep px-3 py-1.5 text-[#f7faf6] transition hover:border-matcha hover:bg-matcha"
            >
              Get started
            </button>
          </SignUpButton>
        </Show>
        <Show when="signed-in">
          <Link
            href="/app"
            className="rounded-md border border-matcha-deep bg-matcha-deep px-3 py-1.5 text-[#f7faf6] no-underline transition hover:border-matcha hover:bg-matcha"
          >
            Dashboard
          </Link>
          <UserButton />
        </Show>
      </nav>
    </header>
  );
}
