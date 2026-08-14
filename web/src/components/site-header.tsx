"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import { BrandLink } from "@/components/brand-link";

const SECONDARY_LINKS = [
  { href: "/#how-it-works", label: "How to start" },
  { href: "/agents", label: "For agents" },
] as const;

export function SiteHeader({
  showHowToStart = true,
}: {
  showHowToStart?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const secondaryLinks = showHowToStart
    ? SECONDARY_LINKS
    : SECONDARY_LINKS.filter((link) => link.href !== "/#how-it-works");

  useEffect(() => {
    if (!menuOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
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

  useEffect(() => {
    // Close the mobile menu when crossing to desktop so items never “leak”
    // into the hero after a viewport change.
    const mq = window.matchMedia("(min-width: 640px)");
    const onChange = () => {
      if (mq.matches) setMenuOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <header className="relative z-30 px-4 py-4 sm:px-6 sm:py-5">
      <div className="mx-auto flex w-full max-w-[72rem] min-w-0 items-center justify-between gap-3 rounded-2xl border border-white/75 bg-white/62 px-3 py-2.5 shadow-[0_8px_30px_rgba(23,63,46,0.07)] backdrop-blur-xl sm:px-4">
        <div className="min-w-0">
          <BrandLink />
        </div>
        <nav className="flex shrink-0 items-center gap-1.5 text-sm font-medium sm:gap-2">
        <div className="hidden items-center gap-3 sm:flex">
          {secondaryLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-2.5 py-2 text-muted no-underline transition hover:bg-matcha-soft/10 hover:text-matcha-deep"
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
            className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-line bg-white/70 text-matcha-deep transition hover:border-matcha-soft hover:bg-white"
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
              className="absolute right-0 z-40 mt-2 min-w-[11rem] rounded-xl border border-line bg-[rgba(255,255,252,0.98)] p-1.5 shadow-[0_18px_48px_rgba(23,63,46,0.18)] backdrop-blur-xl"
            >
              {secondaryLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-muted no-underline hover:bg-matcha-soft/10 hover:text-matcha-deep"
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
              className="button-secondary min-h-10 cursor-pointer whitespace-nowrap px-2.5 py-1.5 sm:px-3.5"
            >
              Sign in
            </button>
          </SignInButton>
          <SignUpButton mode="redirect">
            <button
              type="button"
              className="button-primary min-h-10 cursor-pointer whitespace-nowrap px-2.5 py-1.5 sm:px-3.5"
            >
              Get started
            </button>
          </SignUpButton>
        </Show>
        <Show when="signed-in">
          <Link
            href="/app"
            className="button-primary min-h-10 whitespace-nowrap px-2.5 py-1.5 sm:px-3.5"
          >
            Dashboard
          </Link>
          <UserButton />
        </Show>
      </nav>
      </div>
    </header>
  );
}
