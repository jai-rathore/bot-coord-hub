"use client";

import { useState } from "react";

type Props = {
  clientId: string;
  redirectUri: string;
  state: string | null;
  codeChallenge: string;
  scope: string | null;
  agentName: string;
};

export function OAuthAuthorizeDecision(props: Props) {
  const [pending, setPending] = useState<"approved" | "denied" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "approved" | "denied") {
    setPending(decision);
    setError(null);
    const response = await fetch("/oauth/authorize/decision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision,
        client_id: props.clientId,
        redirect_uri: props.redirectUri,
        state: props.state,
        code_challenge: props.codeChallenge,
        scope: props.scope,
        agent_name: props.agentName,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      redirectTo?: string;
    };
    if (!response.ok || !data.redirectTo) {
      setError(data.error ?? "Could not complete authorization");
      setPending(null);
      return;
    }
    window.location.assign(data.redirectTo);
  }

  return (
    <div className="mt-6">
      {error ? (
        <p className="mb-3 text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={pending !== null}
          onClick={() => decide("approved")}
          className="button-primary cursor-pointer disabled:opacity-60"
        >
          {pending === "approved" ? "Connecting…" : "Connect this agent"}
        </button>
        <button
          type="button"
          disabled={pending !== null}
          onClick={() => decide("denied")}
          className="rounded-md border border-line px-4 py-2.5 text-sm font-medium text-muted disabled:opacity-60"
        >
          {pending === "denied" ? "Declining…" : "Not mine"}
        </button>
      </div>
    </div>
  );
}
