import { Show, SignInButton } from "@clerk/nextjs";
import { BrandLink } from "@/components/brand-link";
import { OAuthAuthorizeDecision } from "@/components/oauth-authorize-decision";
import { AgentApiError } from "@/lib/agent-errors";
import {
  AGENT_SCOPE_COPY,
  loadOAuthClient,
  parseAuthorizeRequest,
  scopesFromAuthorizeRequest,
} from "@/lib/mcp-oauth";

export const dynamic = "force-dynamic";

export default async function OAuthAuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(key, value);
  }
  const returnTo = `/oauth/authorize${query.size ? `?${query.toString()}` : ""}`;
  const url = new URL("https://honeymatcha.io/oauth/authorize");
  for (const [key, value] of query.entries()) {
    url.searchParams.set(key, value);
  }

  let errorMessage: string | null = null;
  let authorize = null as ReturnType<typeof parseAuthorizeRequest> | null;
  let clientName = "MCP Agent";
  let scopes: string[] = [];

  try {
    authorize = parseAuthorizeRequest(url);
    const client = await loadOAuthClient(authorize.clientId);
    if (!client) {
      throw new AgentApiError(
        400,
        "Unknown OAuth client. Remove HoneyMatcha from your assistant and connect it again.",
      );
    }
    if (!client.redirectUris.includes(authorize.redirectUri)) {
      throw new AgentApiError(400, "redirect_uri was not registered for this client");
    }
    clientName = client.clientName || authorize.agentName;
    scopes = scopesFromAuthorizeRequest(authorize.scope);
  } catch (error) {
    errorMessage =
      error instanceof AgentApiError
        ? error.message
        : "Invalid authorization request";
  }

  return (
    <main className="min-h-full bg-[linear-gradient(180deg,#f8fbf7_0%,#f4f7f3_42%,#f0ebe0_100%)] px-4 py-8">
      <div className="mx-auto w-full max-w-xl">
        <BrandLink />
        <div className="mt-8 rounded-2xl border border-line bg-white/80 p-6 shadow-[0_24px_70px_rgba(31,74,54,0.08)] sm:p-8">
          {errorMessage || !authorize ? (
            <>
              <h1 className="font-[family-name:var(--font-fraunces)] text-3xl font-semibold text-matcha-deep">
                Cannot authorize
              </h1>
              <p className="mt-3 text-muted">{errorMessage}</p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-matcha">
                Assistant connector
              </p>
              <h1 className="mt-2 font-[family-name:var(--font-fraunces)] text-3xl font-semibold text-matcha-deep">
                Connect {clientName}?
              </h1>
              <p className="mt-3 text-muted">
                This agent will handle coordination for you through HoneyMatcha.
                It cannot approve important actions in your place.
              </p>
              <div className="mt-6 rounded-xl border border-line bg-[rgba(111,154,124,0.06)] p-4">
                <p className="text-sm font-semibold text-ink">
                  It will be able to:
                </p>
                <ul className="mt-3 space-y-2 text-sm text-muted">
                  {scopes.map((scope) => (
                    <li key={scope} className="flex gap-2">
                      <span aria-hidden="true" className="text-matcha">
                        ✓
                      </span>
                      {AGENT_SCOPE_COPY[scope] ?? scope}
                    </li>
                  ))}
                </ul>
              </div>

              <Show when="signed-out">
                <SignInButton mode="redirect" forceRedirectUrl={returnTo}>
                  <button
                    type="button"
                    className="mt-6 rounded-md bg-matcha-deep px-4 py-2.5 text-sm font-semibold text-white"
                  >
                    Sign in to connect
                  </button>
                </SignInButton>
              </Show>
              <Show when="signed-in">
                <OAuthAuthorizeDecision
                  clientId={authorize.clientId}
                  redirectUri={authorize.redirectUri}
                  state={authorize.state}
                  codeChallenge={authorize.codeChallenge}
                  scope={authorize.scope}
                  resource={authorize.resource}
                  agentName={clientName || authorize.agentName}
                />
              </Show>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
