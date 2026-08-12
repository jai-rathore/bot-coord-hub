"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";

const SECONDARY_LINKS = [
  { href: "/docs", label: "Docs" },
  { href: "/intents", label: "Intents" },
] as const;

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [menuOpen]);

  return (
    <header className="relative z-10 flex items-center justify-between gap-3 px-4 py-4 sm:gap-4 sm:px-6">
      <Link
        href="/"
        className="font-[family-name:var(--font-fraunces)] text-lg font-semibold text-matcha-deep no-underline"
      >
        HoneyMatcha
      </Link>
      <nav className="flex items-center gap-2 text-sm font-medium sm:gap-3">
        <div className="hidden items-center gap-3 sm:flex">
          {SECONDARY_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-muted no-underline hover:text-matcha-deep"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="relative sm:hidden" ref={menuRef}>
          <button
            type="button"
            aria-expanded={menuOpen}
            aria-controls={menuId}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((open) => !open)}
            className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-line bg-transparent text-matcha-deep transition hover:border-matcha-soft hover:bg-[rgba(255,252,246,0.55)]"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              {menuOpen ? (
                <path
                  d="M4 4l8 8M12 4l-8 8"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                />
              ) : (
                <path
                  d="M3 4.5h10M3 8h10M3 11.5h10"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                />
              )}
            </svg>
          </button>
          {menuOpen ? (
            <div
              id={menuId}
              role="menu"
              className="absolute right-0 z-20 mt-2 min-w-[9.5rem] rounded-md border border-line bg-[rgba(255,252,246,0.96)] p-1 shadow-[0_8px_24px_rgba(31,74,54,0.12)] backdrop-blur-sm"
            >
              {SECONDARY_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="block rounded-md px-3 py-2 text-muted no-underline hover:bg-[rgba(111,154,124,0.12)] hover:text-matcha-deep"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>

        <Show when="signed-out">
          <SignInButton mode="redirect">
            <button
              type="button"
              className="cursor-pointer rounded-md border border-line bg-transparent px-2.5 py-1.5 text-matcha-deep transition hover:border-matcha-soft hover:bg-[rgba(255,252,246,0.55)] sm:px-3"
            >
              Sign in
            </button>
          </SignInButton>
          <SignUpButton mode="redirect">
            <button
              type="button"
              className="cursor-pointer rounded-md border border-matcha-deep bg-matcha-deep px-2.5 py-1.5 text-[#f7faf6] transition hover:border-matcha hover:bg-matcha sm:px-3"
            >
              Get started
            </button>
          </SignUpButton>
        </Show>
        <Show when="signed-in">
          <Link
            href="/app"
            className="rounded-md border border-matcha-deep bg-matcha-deep px-2.5 py-1.5 text-[#f7faf6] no-underline transition hover:border-matcha hover:bg-matcha sm:px-3"
          >
            Dashboard
          </Link>
          <UserButton />
        </Show>
      </nav>
    </header>
  );
}
