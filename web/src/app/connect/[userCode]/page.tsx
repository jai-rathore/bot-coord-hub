import { Show, SignInButton } from "@clerk/nextjs";
import { BrandLink } from "@/components/brand-link";
import { PairingDecision } from "@/components/pairing-decision";
import { getPairingForHuman } from "@/lib/agent-pairing";

const SCOPE_COPY: Record<string, string> = {
  "profile:read": "Know which HoneyMatcha account it represents",
  "people:read": "See people you have connected",
  "people:write": "Invite or remove people for you",
  "tasks:read": "Read your coordination tasks",
  "tasks:write": "Start tasks and handle the back-and-forth",
  "approvals:read": "Tell you when something needs your attention",
  "guest_tasks:read": "Read answers to private guest requests",
  "guest_tasks:write": "Create private requests for people without accounts",
  "intents:read": "See supported task types",
  "intents:request": "Suggest a new task type",
};

export default async function ConnectAgentPage({
  params,
}: {
  params: Promise<{ userCode: string }>;
}) {
  const { userCode } = await params;
  const pairing = await getPairingForHuman(userCode);

  return (
    <main className="min-h-full bg-[linear-gradient(180deg,#f8fbf7_0%,#f4f7f3_42%,#f0ebe0_100%)] px-4 py-8">
      <div className="mx-auto w-full max-w-xl">
        <BrandLink />
        <div className="mt-8 rounded-2xl border border-line bg-white/80 p-6 shadow-[0_24px_70px_rgba(31,74,54,0.08)] sm:p-8">
          {!pairing ? (
            <>
              <h1 className="font-[family-name:var(--font-fraunces)] text-3xl font-semibold text-matcha-deep">
                Connection code not found
              </h1>
              <p className="mt-3 text-muted">
                Ask your Grok Bot to start a new HoneyMatcha connection.
              </p>
            </>
          ) : pairing.status !== "pending" ? (
            <>
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-matcha">
                Agent connection
              </p>
              <h1 className="mt-2 font-[family-name:var(--font-fraunces)] text-3xl font-semibold text-matcha-deep">
                {pairing.status === "approved"
                  ? "Connection approved"
                  : pairing.status === "consumed"
                    ? "Agent connected"
                    : pairing.status === "denied"
                      ? "Connection declined"
                      : "Connection expired"}
              </h1>
              <p className="mt-3 text-muted">
                {pairing.agentName} can return to its original window.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-matcha">
                Agent connection
              </p>
              <h1 className="mt-2 font-[family-name:var(--font-fraunces)] text-3xl font-semibold text-matcha-deep">
                Connect {pairing.agentName}?
              </h1>
              <p className="mt-3 text-muted">
                This agent will handle coordination for you. It cannot approve
                important actions in your place.
              </p>
              <div className="mt-6 rounded-xl border border-line bg-[rgba(111,154,124,0.06)] p-4">
                <p className="text-sm font-semibold text-ink">
                  It will be able to:
                </p>
                <ul className="mt-3 space-y-2 text-sm text-muted">
                  {(pairing.requestedScopes ?? []).map((scope) => (
                    <li key={scope} className="flex gap-2">
                      <span aria-hidden="true" className="text-matcha">
                        ✓
                      </span>
                      {SCOPE_COPY[scope] ?? scope}
                    </li>
                  ))}
                </ul>
              </div>
              <p className="mt-4 text-xs text-muted">
                Code {pairing.userCode} · expires{" "}
                {pairing.expiresAt.toLocaleTimeString()}
              </p>

              <Show when="signed-out">
                <SignInButton mode="redirect">
                  <button
                    type="button"
                    className="mt-6 rounded-md bg-matcha-deep px-4 py-2.5 text-sm font-semibold text-white"
                  >
                    Sign in to connect
                  </button>
                </SignInButton>
              </Show>
              <Show when="signed-in">
                <PairingDecision userCode={pairing.userCode} />
              </Show>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
