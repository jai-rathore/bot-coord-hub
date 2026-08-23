"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Mode = "rsvp" | "times";

export function EventCreateForm() {
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("times");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [place, setPlace] = useState("");
  const [visibility, setVisibility] = useState("open");
  const [quorum, setQuorum] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Times start empty. Pre-filling them would mean reading the clock during
  // render, which differs between server and client and breaks hydration.
  // A blank deadline means "48 hours", applied server-side.
  const [deadline, setDeadline] = useState("");
  const [fixedStart, setFixedStart] = useState("");
  const [slots, setSlots] = useState<string[]>(["", ""]);

  async function submit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    setBusy(true);
    setError(null);

    const timezone =
      Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

    const payload: Record<string, unknown> = {
      title,
      description: description || null,
      place: place || null,
      timezone,
      visibility,
      deadlineAt: deadline ? new Date(deadline).toISOString() : null,
      quorumMin: quorum ? Number(quorum) : null,
    };
    if (mode === "rsvp") {
      payload.fixedStartsAt = new Date(fixedStart).toISOString();
    } else {
      payload.slots = slots
        .filter(Boolean)
        .map((value) => ({ startsAt: new Date(value).toISOString() }));
    }

    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not create the event.");
        setBusy(false);
        return;
      }
      router.push(`/app/events/${data.event.id}`);
    } catch {
      setError("Could not reach HoneyMatcha. Check your connection.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-7">
      <div className="surface-card space-y-5 p-6 sm:p-7">
        <div>
          <label htmlFor="title" className="text-sm font-semibold text-ink">
            What&apos;s happening?
          </label>
          <input
            id="title"
            required
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Coffee with the design crew"
            className="field mt-2 w-full"
          />
        </div>

        <fieldset>
          <legend className="text-sm font-semibold text-ink">
            What needs deciding?
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setMode("rsvp")}
              aria-pressed={mode === "rsvp"}
              className={
                mode === "rsvp" ? "button-primary" : "button-secondary"
              }
            >
              Just RSVP
            </button>
            <button
              type="button"
              onClick={() => setMode("times")}
              aria-pressed={mode === "times"}
              className={
                mode === "times" ? "button-primary" : "button-secondary"
              }
            >
              Find a time
            </button>
          </div>
          <p className="mt-2 text-xs text-muted">
            {mode === "rsvp"
              ? "You set the time; people say whether they're in."
              : "You offer times; people pick what works and HoneyMatcha tallies it."}
          </p>
        </fieldset>

        {mode === "rsvp" ? (
          <div>
            <label htmlFor="fixed" className="text-sm font-semibold text-ink">
              When
            </label>
            <input
              id="fixed"
              type="datetime-local"
              required
              value={fixedStart}
              onChange={(e) => setFixedStart(e.target.value)}
              className="field mt-2 w-full sm:w-auto"
            />
          </div>
        ) : (
          <div>
            <span className="text-sm font-semibold text-ink">
              Times to choose from
            </span>
            <ul className="mt-2 space-y-2">
              {slots.map((slot, index) => (
                <li key={index} className="flex items-center gap-2">
                  <input
                    type="datetime-local"
                    required
                    value={slot}
                    aria-label={`Option ${index + 1}`}
                    onChange={(e) =>
                      setSlots((prev) =>
                        prev.map((s, i) => (i === index ? e.target.value : s)),
                      )
                    }
                    /* min-w-0 flex-1 so the input yields space instead of
                       crushing the Remove button into a letter column. */
                    className="field min-w-0 flex-1"
                  />
                  {slots.length > 1 && (
                    <button
                      type="button"
                      className="button-secondary shrink-0 whitespace-nowrap"
                      onClick={() =>
                        setSlots((prev) => prev.filter((_, i) => i !== index))
                      }
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {slots.length < 20 && (
              <button
                type="button"
                className="button-secondary mt-3"
                onClick={() =>
                  setSlots((prev) => [...prev, ""])
                }
              >
                Add another time
              </button>
            )}
          </div>
        )}

        <div>
          <label htmlFor="place" className="text-sm font-semibold text-ink">
            Where <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            id="place"
            maxLength={120}
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            placeholder="Blue Bottle on Valencia"
            className="field mt-2 w-full"
          />
        </div>

        <div>
          <label htmlFor="description" className="text-sm font-semibold text-ink">
            Anything else <span className="font-normal text-muted">(optional)</span>
          </label>
          <textarea
            id="description"
            rows={3}
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="field mt-2 w-full"
          />
        </div>
      </div>

      <details className="surface-card p-6 sm:p-7">
        <summary className="cursor-pointer text-sm font-semibold text-matcha-deep">
          Deadline, privacy, and quorum
        </summary>

        <div className="mt-5 space-y-5">
          <div>
            <label htmlFor="deadline" className="text-sm font-semibold text-ink">
              Responses close
            </label>
            <input
              id="deadline"
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="field mt-2 w-full sm:w-auto"
            />
            <p className="mt-1 text-xs text-muted">
              Leave it blank for 48 hours. People who never reply simply
              don&apos;t count: nothing waits on them.
            </p>
          </div>

          <fieldset>
            <legend className="text-sm font-semibold text-ink">
              Who sees what
            </legend>
            <div className="mt-2 space-y-2">
              {[
                {
                  value: "open",
                  label: "Everyone sees who picked what",
                  hint: "Best for friends.",
                },
                {
                  value: "counts_only",
                  label: "Show counts, not names",
                  hint: "Stops everyone copying the first answer.",
                },
                {
                  value: "blind",
                  label: "Only I see the responses",
                  hint: "Best for recruiting or anything sensitive.",
                },
              ].map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer gap-3 rounded-[0.8rem] border border-line bg-white/60 p-3"
                >
                  <input
                    type="radio"
                    name="visibility"
                    value={option.value}
                    checked={visibility === option.value}
                    onChange={(e) => setVisibility(e.target.value)}
                    className="mt-1"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-ink">
                      {option.label}
                    </span>
                    <span className="block text-xs text-muted">
                      {option.hint}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="quorum" className="text-sm font-semibold text-ink">
              Only happens if at least
            </label>
            <div className="mt-2 flex items-center gap-2">
              <input
                id="quorum"
                type="number"
                min={1}
                max={200}
                value={quorum}
                onChange={(e) => setQuorum(e.target.value)}
                placeholder="any"
                className="field w-24"
              />
              <span className="text-sm text-muted">people can make it</span>
            </div>
          </div>
        </div>
      </details>

      {error && (
        <p className="text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        className="button-primary w-full sm:w-auto"
        disabled={busy}
      >
        {busy ? "Creating…" : "Create plan and get the link"}
      </button>
    </form>
  );
}
