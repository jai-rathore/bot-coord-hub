"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { MEET_INTENTS, type MeetChoice } from "@/lib/meet-shapes";

type MeetResponse = {
  metName?: string;
  connection?: { status: string; message: string };
  event?: {
    url: string;
    title: string;
    slots: number;
    reused: boolean;
  } | null;
};

const CHIP_CLASS =
  "flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-line bg-white/80 px-3 py-4 text-center text-sm font-semibold text-matcha-deep transition hover:border-matcha-soft disabled:opacity-60";

const CHIPS: Array<{ intent: MeetChoice; emoji: string; label: string }> = [
  { intent: "coffee", emoji: "☕️", label: MEET_INTENTS.coffee.label },
  { intent: "drinks", emoji: "🍸", label: MEET_INTENTS.drinks.label },
  { intent: "lunch", emoji: "🍽️", label: MEET_INTENTS.lunch.label },
  { intent: "call", emoji: "📞", label: MEET_INTENTS.call.label },
];

/**
 * What someone sees a second after scanning a code.
 *
 * The ordering here is the whole point. Choosing comes first and signing in
 * second: the tap happens while two people are still standing together, and a
 * sign-in wall at that moment is where the introduction dies. A signed-out tap
 * carries the choice through Clerk in the redirect URL and replays it on the
 * way back, so the person never has to remember what they were doing.
 */
export function MeetCard({
  handle,
  displayName,
  signedIn,
  initialIntent,
}: {
  handle: string;
  displayName: string;
  signedIn: boolean;
  initialIntent: MeetChoice | null;
}) {
  const [pending, setPending] = useState<MeetChoice | null>(null);
  const [result, setResult] = useState<MeetResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const replayed = useRef(false);

  function signInUrlFor(intent: MeetChoice) {
    const back = `/${handle}?meet=1&intent=${intent}`;
    return `/sign-in?redirect_url=${encodeURIComponent(back)}`;
  }

  const submit = useCallback(
    async (intent: MeetChoice) => {
      setPending(intent);
      setError(null);
      try {
        const response = await fetch(
          `/api/meet/${encodeURIComponent(handle)}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              intent,
              // The browser is the only thing here that knows what "9am" means.
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            }),
          },
        );
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setError(data.error ?? "Could not set that up.");
          return;
        }
        setResult(data as MeetResponse);
      } catch {
        setError("Could not reach HoneyMatcha. Try again.");
      } finally {
        setPending(null);
      }
    },
    [handle],
  );

  // Replay the choice made before signing in, exactly once.
  useEffect(() => {
    if (!signedIn || !initialIntent || replayed.current) return;
    replayed.current = true;
    void submit(initialIntent);
  }, [signedIn, initialIntent, submit]);

  if (result) {
    return (
      <div className="surface-card p-6 sm:p-7">
        <p className="text-xs font-semibold tracking-[0.14em] text-matcha uppercase">
          {result.event ? "Nearly there" : "Request sent"}
        </p>
        {result.event ? (
          <>
            <h2 className="mt-2 font-[family-name:var(--font-fraunces)] text-2xl font-semibold text-matcha-deep">
              {result.event.reused
                ? "You already started this one"
                : `${result.event.slots} times are on the table`}
            </h2>
            <p className="mt-3 text-muted">
              Mark the ones that work for you. {result.metName ?? displayName}{" "}
              does the same, and HoneyMatcha settles it — neither of you has to
              chase the other.
            </p>
            <Link
              href={result.event.url}
              className="button-primary mt-5 inline-block"
            >
              Pick your times
            </Link>
          </>
        ) : (
          <>
            <h2 className="mt-2 font-[family-name:var(--font-fraunces)] text-2xl font-semibold text-matcha-deep">
              {displayName} will see your request
            </h2>
            <p className="mt-3 text-muted">{result.connection?.message}</p>
          </>
        )}
        {result.event && result.connection?.status !== "already_connected" ? (
          <p className="mt-4 text-xs text-muted">
            You also asked to connect your agents. {displayName} approves that
            separately — the plan above works either way.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="surface-card p-6 sm:p-7">
      <p className="text-xs font-semibold tracking-[0.14em] text-matcha uppercase">
        You just met
      </p>
      <h2 className="mt-2 font-[family-name:var(--font-fraunces)] text-2xl font-semibold text-matcha-deep">
        Put something in the diary before this fades
      </h2>
      <p className="mt-3 text-muted">
        Pick a shape. You&apos;ll get a few times to choose from, {displayName}{" "}
        gets the same, and whichever one you both mark is the one that happens.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {CHIPS.map((chip) =>
          signedIn ? (
            <button
              key={chip.intent}
              type="button"
              onClick={() => void submit(chip.intent)}
              disabled={pending !== null}
              className={CHIP_CLASS}
            >
              <span aria-hidden className="text-2xl">
                {chip.emoji}
              </span>
              {pending === chip.intent ? "Setting up…" : chip.label}
            </button>
          ) : (
            <Link
              key={chip.intent}
              href={signInUrlFor(chip.intent)}
              className={CHIP_CLASS}
            >
              <span aria-hidden className="text-2xl">
                {chip.emoji}
              </span>
              {chip.label}
            </Link>
          ),
        )}
      </div>

      {signedIn ? (
        <button
          type="button"
          onClick={() => void submit("connect")}
          disabled={pending !== null}
          className="mt-4 cursor-pointer text-sm font-semibold text-matcha-deep underline disabled:opacity-60"
        >
          {pending === "connect"
            ? "Sending…"
            : "Just connect our agents for now"}
        </button>
      ) : (
        <Link
          href={signInUrlFor("connect")}
          className="mt-4 inline-block text-sm font-semibold text-matcha-deep underline"
        >
          Just connect our agents for now
        </Link>
      )}

      {!signedIn ? (
        <p className="mt-4 text-xs text-muted">
          Pick one first — you&apos;ll sign in straight after and land right back
          here.
        </p>
      ) : null}

      {error ? (
        <p className="mt-4 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
