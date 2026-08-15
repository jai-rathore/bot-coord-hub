"use client";

import { useEffect, useId, useRef, useState } from "react";

export type CanonicalLocationSuggestion = {
  resolutionToken: string;
  place: {
    schemaVersion: 1;
    canonicalKey: string;
    provider: "iso3166" | "geoapify";
    providerPlaceId: string;
    granularity: "country" | "region" | "city" | "neighborhood";
    label: string;
    countryCode: string;
    country: string;
    regionCode?: string;
    region?: string;
    locality?: string;
    neighborhood?: string;
  };
};

export function LocationAutocomplete({
  granularity,
  selected,
  onChange,
  multiple = false,
  label,
}: {
  granularity: "country" | "region" | "city" | "neighborhood";
  selected: CanonicalLocationSuggestion[];
  onChange: (value: CanonicalLocationSuggestion[]) => void;
  multiple?: boolean;
  label: string;
}) {
  const listboxId = useId();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<
    CanonicalLocationSuggestion[]
  >([]);
  const [attribution, setAttribution] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);

  useEffect(() => {
    const normalized = query.trim();
    if (
      normalized.length < 2 ||
      (!multiple && selected[0]?.place.label === normalized)
    ) {
      return;
    }
    const requestId = requestSequence.current + 1;
    requestSequence.current = requestId;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setBusy(true);
      setError(null);
      try {
        const response = await fetch("/api/discovery", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "resolve_location",
            query: normalized,
            granularity,
            limit: 5,
          }),
          signal: controller.signal,
        });
        const data = (await response.json()) as {
          error?: string;
          attribution?: string;
          suggestions?: CanonicalLocationSuggestion[];
        };
        if (!response.ok) {
          throw new Error(data.error ?? "Location suggestions failed");
        }
        if (requestSequence.current === requestId) {
          setSuggestions(data.suggestions ?? []);
          setAttribution(data.attribution ?? null);
        }
      } catch (requestError) {
        if (controller.signal.aborted) return;
        if (requestSequence.current === requestId) {
          setSuggestions([]);
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Location suggestions failed",
          );
        }
      } finally {
        if (
          !controller.signal.aborted &&
          requestSequence.current === requestId
        ) {
          setBusy(false);
        }
      }
    }, 400);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [granularity, multiple, query, selected]);

  function select(suggestion: CanonicalLocationSuggestion) {
    requestSequence.current += 1;
    setBusy(false);
    if (multiple) {
      if (
        !selected.some(
          (item) => item.place.canonicalKey === suggestion.place.canonicalKey,
        )
      ) {
        onChange([...selected, suggestion]);
      }
      setQuery("");
    } else {
      onChange([suggestion]);
      setQuery(suggestion.place.label);
    }
    setSuggestions([]);
    setError(null);
  }

  return (
    <div>
      {selected.length ? (
        <div className="mb-2 flex flex-wrap gap-2">
          {selected.map((suggestion) => (
            <span
              key={suggestion.place.canonicalKey}
              className="inline-flex items-center gap-2 rounded-full border border-matcha-soft/50 bg-matcha-soft/10 px-3 py-1.5 text-xs font-semibold text-matcha-deep"
            >
              {suggestion.place.label}
              <button
                type="button"
                aria-label={`Remove ${suggestion.place.label}`}
                onClick={() =>
                  onChange(
                    selected.filter(
                      (item) =>
                        item.place.canonicalKey !==
                        suggestion.place.canonicalKey,
                    ),
                  )
                }
                className="text-muted hover:text-danger"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="relative">
        <input
          className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-matcha"
          type="text"
          value={query}
          autoComplete="off"
          role="combobox"
          aria-label={label}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={suggestions.length > 0}
          placeholder={`Start typing a ${granularity}…`}
          onChange={(event) => {
            const nextQuery = event.target.value;
            requestSequence.current += 1;
            setQuery(nextQuery);
            if (nextQuery.trim().length < 2) {
              setSuggestions([]);
              setError(null);
              setBusy(false);
            }
            if (!multiple && selected.length) onChange([]);
          }}
        />
        {busy ? (
          <span className="pointer-events-none absolute right-3 top-3 text-xs text-muted">
            Searching…
          </span>
        ) : null}
        {suggestions.length ? (
          <ul
            id={listboxId}
            role="listbox"
            className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-line bg-white p-1 shadow-lg"
          >
            {suggestions.map((suggestion) => (
              <li key={suggestion.place.canonicalKey}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => select(suggestion)}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-mist"
                >
                  {suggestion.place.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
      {attribution ? (
        <p className="mt-2 text-[0.68rem] text-muted">
          {attribution.startsWith("Powered by Geoapify") ? (
            <>
              Powered by{" "}
              <a
                href="https://www.geoapify.com/"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                Geoapify
              </a>
              ; ©{" "}
              <a
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                OpenStreetMap contributors
              </a>
            </>
          ) : (
            attribution
          )}
        </p>
      ) : null}
    </div>
  );
}
