"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { NavPending } from "@/components/nav-pending";
import { NavIcon, type NavGlyph } from "@/components/nav-icon";

/**
 * The phone's navigation.
 *
 * A human using HoneyMatcha is on a phone, and the top rail this replaces put
 * every destination in the one place a thumb cannot reach, then scrolled half
 * of them off the right edge, where nobody knew to look. This is five fixed
 * slots at the bottom of the screen.
 *
 * Fixed is the point. A tab bar earns its speed from muscle memory, so the
 * slots never reorder and never disappear: the things that come and go with
 * account state (discovery, approvals, the agent layer) live behind More, and
 * More carries a dot when something back there wants attention. The desktop
 * rail is unchanged and still shows everything at once.
 */

type Destination = {
  href: string;
  label: string;
  glyph: NavGlyph;
  exact?: boolean;
  badge?: number;
};

function isActive(pathname: string, item: { href: string; exact?: boolean }) {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

export function MobileTabBar({
  attentionCount,
  eventsUnreadCount,
  agentConnected,
  handle,
}: {
  attentionCount: number;
  eventsUnreadCount: number;
  agentConnected: boolean;
  handle: string | null;
}) {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);

  const tabs: Destination[] = [
    { href: "/", label: "Home", glyph: "home", exact: true },
    {
      href: "/app/events",
      label: "Plans",
      glyph: "events",
      badge: eventsUnreadCount,
    },
    { href: "/app/people", label: "People", glyph: "people" },
    { href: handle ? "/app/code" : "/setup", label: "Share", glyph: "code" },
  ];

  const overflow: Destination[] = [];
  overflow.push({
    href: "/app/recruiting",
    label: "Recruiting",
    glyph: "briefcase",
  });
  if (attentionCount > 0 || agentConnected) {
    overflow.push({
      href: "/app/attention",
      label: "Approvals",
      glyph: "approvals",
      badge: attentionCount,
    });
  }
  overflow.push({
    href: "/app/agent",
    label: "Agents",
    glyph: "agent",
  });
  overflow.push({ href: "/app/settings", label: "Settings", glyph: "settings" });

  // A page behind More is still the page you are on, so the tab has to look
  // selected. Otherwise the bar claims you are nowhere.
  const moreActive =
    overflow.some((item) => isActive(pathname, item)) &&
    !tabs.some((item) => isActive(pathname, item));

  useEffect(() => {
    if (!sheetOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSheetOpen(false);
        moreButtonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);

    const { overflow: bodyOverflow } = document.body.style;
    document.body.style.overflow = "hidden";
    sheetRef.current?.focus();

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = bodyOverflow;
    };
  }, [sheetOpen]);

  return (
    <>
      {sheetOpen ? (
        <div
          className="fixed inset-0 z-50 bg-[rgba(23,33,28,0.35)] backdrop-blur-[2px] sm:hidden"
          onClick={() => setSheetOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      <nav
        aria-label="Sections"
        className="tab-bar fixed inset-x-0 bottom-0 z-50 border-t border-line/80 bg-[rgba(247,249,246,0.94)] backdrop-blur-xl sm:hidden"
      >
        {sheetOpen ? (
          <div
            id={sheetId}
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="More sections"
            tabIndex={-1}
            className="tab-sheet absolute right-2 bottom-full left-2 mb-2 rounded-2xl border border-line bg-[rgba(255,255,252,0.99)] p-1.5 shadow-[0_-18px_48px_rgba(23,63,46,0.2)] outline-none"
          >
            {overflow.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(pathname, item) ? "page" : undefined}
                onClick={() => setSheetOpen(false)}
                className={`flex min-h-12 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium no-underline ${
                  isActive(pathname, item)
                    ? "bg-matcha-deep text-white"
                    : "text-ink"
                }`}
              >
                <NavIcon kind={item.glyph} className="h-5 w-5 shrink-0" />
                <span className="flex-1">{item.label}</span>
                {item.badge ? (
                  <span className="rounded-full bg-honey px-1.5 py-0.5 text-[0.65rem] font-bold text-matcha-deep">
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            ))}
          </div>
        ) : null}

        <ul className="flex items-stretch">
          {tabs.map((item) => {
            const active = isActive(pathname, item);
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setSheetOpen(false)}
                  className={`relative flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-[0.68rem] font-semibold no-underline ${
                    active ? "text-matcha-deep" : "text-muted"
                  }`}
                >
                  <span className="relative">
                    <NavIcon kind={item.glyph} className="h-[1.35rem] w-[1.35rem]" />
                    {item.badge ? (
                      <span className="absolute -top-1.5 -right-2 min-w-4 rounded-full bg-honey px-1 text-[0.6rem] font-bold text-matcha-deep">
                        {item.badge}
                      </span>
                    ) : null}
                  </span>
                  {item.label}
                  {active ? (
                    <span
                      className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-matcha-deep"
                      aria-hidden="true"
                    />
                  ) : null}
                  <NavPending className="absolute inset-x-0 -bottom-0 mx-auto" />
                </Link>
              </li>
            );
          })}
          <li className="flex-1">
            <button
              type="button"
              ref={moreButtonRef}
              aria-expanded={sheetOpen}
              aria-controls={sheetOpen ? sheetId : undefined}
              onClick={() => setSheetOpen((open) => !open)}
              className={`relative flex min-h-14 w-full cursor-pointer flex-col items-center justify-center gap-1 px-1 py-2 text-[0.68rem] font-semibold ${
                moreActive || sheetOpen ? "text-matcha-deep" : "text-muted"
              }`}
            >
              <span className="relative">
                <NavIcon kind="more" className="h-[1.35rem] w-[1.35rem]" />
                {attentionCount > 0 ? (
                  <span
                    className="absolute -top-0.5 -right-1.5 h-2 w-2 rounded-full bg-honey"
                    aria-hidden="true"
                  />
                ) : null}
              </span>
              More
              {attentionCount > 0 ? (
                <span className="sr-only">
                  {attentionCount} waiting for you
                </span>
              ) : null}
              {moreActive ? (
                <span
                  className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-matcha-deep"
                  aria-hidden="true"
                />
              ) : null}
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
