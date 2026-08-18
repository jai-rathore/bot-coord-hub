"use client";

import { useEffect, useState } from "react";

const SCENES = [
  {
    status: "Working",
    tone: "live" as const,
    kicker: "Scheduling task",
    title: "Coffee with Sam and Anu",
    detail: "Your Grok Bot is comparing free/busy time.",
    note: "Calendars checked. Event titles stay private.",
    approval: "Finding a slot that works for everyone.",
  },
  {
    status: "Working",
    tone: "live" as const,
    kicker: "Scheduling task",
    title: "Thursday 3:30–4:00",
    detail: "Three calendars overlap. One clean window.",
    note: "Sam’s Bot and Anu’s Bot already agreed.",
    approval: "Preparing a booking for your review.",
  },
  {
    status: "Needs you",
    tone: "wait" as const,
    kicker: "Your approval",
    title: "Book Thursday 3:30?",
    detail: "Nothing is booked until you say so.",
    note: "Agent credentials cannot approve this.",
    approval: "Waiting for your OK in HoneyMatcha.",
  },
] as const;

export function HomeLivePreview() {
  const [scene, setScene] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const displayedScene = reduceMotion ? SCENES.length - 1 : scene;
  const current = SCENES[displayedScene];

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    const id = window.setInterval(() => {
      setScene((value) => (value + 1) % SCENES.length);
    }, 3200);
    return () => window.clearInterval(id);
  }, [reduceMotion]);

  return (
    <div className="relative mx-auto w-full max-w-[31rem]">
      <div
        className="pointer-events-none absolute -inset-4 rounded-full bg-[radial-gradient(circle,rgba(117,161,132,0.26),transparent_68%)] blur-2xl sm:-inset-10"
        aria-hidden="true"
      />
      <div className="surface-card relative overflow-hidden p-3 shadow-[0_32px_80px_rgba(23,63,46,0.18)] sm:p-4">
        <div className="flex items-center justify-between border-b border-line/70 px-1 pb-3">
          <div className="flex items-center gap-2">
            <span className="live-dot animate-pulse-live" />
            <span className="text-xs font-semibold text-matcha-deep">
              Coordination in progress
            </span>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-[0.65rem] font-semibold ${
              current.tone === "wait"
                ? "bg-honey-soft/70 text-[#7a5610]"
                : "bg-matcha-soft/12 text-matcha"
            }`}
            aria-live="polite"
          >
            {current.status}
          </span>
        </div>

        <div
          key={current.title}
          className="animate-scene-in mt-4 rounded-2xl bg-[linear-gradient(145deg,#173f2e,#2f694a)] p-4 text-white sm:p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[0.67rem] font-semibold tracking-[0.14em] text-white/60 uppercase">
                {current.kicker}
              </p>
              <p className="mt-1.5 font-[family-name:var(--font-fraunces)] text-xl font-semibold tracking-[-0.02em]">
                {current.title}
              </p>
              <p className="mt-1 text-xs text-white/65">{current.detail}</p>
            </div>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/10">
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                <path d="M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z" />
              </svg>
            </span>
          </div>
          <div className="mt-5 flex items-center gap-3">
            <div className="flex -space-x-2">
              {["HM", "S", "A"].map((label, index) => (
                <span
                  key={label}
                  className={`grid h-8 w-8 place-items-center rounded-full border-2 border-matcha-deep text-[0.58rem] font-bold ${
                    index === 0
                      ? "bg-honey-soft text-matcha-deep"
                      : "bg-white text-matcha"
                  }`}
                >
                  {label}
                </span>
              ))}
            </div>
            <span className="text-xs text-white/70">3 participants</span>
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-line/80 bg-white/70 p-3.5">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-matcha-soft/15 text-matcha">
                <svg
                  viewBox="0 0 24 24"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="m5 12 4 4L19 6" />
                </svg>
              </span>
              <p className="text-xs font-semibold text-ink">Calendars checked</p>
            </div>
            <p className="mt-2 text-[0.68rem] leading-5 text-muted">
              {current.note}
            </p>
          </div>
          <div
            className={`rounded-2xl border p-3.5 ${
              current.tone === "wait"
                ? "border-honey/50 bg-honey-soft/35"
                : "border-honey/35 bg-honey-soft/20"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-honey/15 text-[#946814]">
                <svg
                  viewBox="0 0 24 24"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden="true"
                >
                  <path d="M12 8v4l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              </span>
              <p className="text-xs font-semibold text-ink">Your approval</p>
            </div>
            <p className="mt-2 text-[0.68rem] leading-5 text-muted">
              {current.approval}
            </p>
          </div>
        </div>

        <div className="mt-3 flex justify-center gap-1.5" aria-hidden="true">
          {SCENES.map((item, index) => (
            <span
              key={item.title}
              className={`h-1 rounded-full transition-all duration-300 ${
                index === displayedScene ? "w-5 bg-matcha" : "w-1.5 bg-line"
              }`}
            />
          ))}
        </div>
      </div>
      <div className="animate-float-soft absolute -right-2 -bottom-4 hidden items-center gap-2 rounded-xl border border-white bg-white px-3 py-2 shadow-[0_14px_32px_rgba(23,63,46,0.15)] sm:flex">
        <span className="live-dot animate-pulse-live" />
        <span className="text-[0.68rem] font-semibold text-ink">
          Agent connected
        </span>
      </div>
    </div>
  );
}
