import Link from "next/link";
import { CopyBlock } from "@/components/copy-block";
import { ASK_AGENT_PROMPT, GROK_BOT_URL } from "@/lib/connect-copy";

export function HomeGetStarted({
  signedIn,
  setupComplete,
}: {
  signedIn: boolean;
  setupComplete: boolean;
}) {
  if (signedIn && setupComplete) return null;

  return (
    <section
      id="how-it-works"
      aria-labelledby="get-started-title"
      className="scroll-mt-24"
    >
      <div className="mb-7 max-w-2xl">
        <p className="section-kicker">
          {signedIn ? "Finish setup" : "Simple by design"}
        </p>
        <h2
          id="get-started-title"
          className="mt-2 font-[family-name:var(--font-fraunces)] text-3xl font-semibold tracking-[-0.035em] text-matcha-deep sm:text-4xl"
        >
          Two steps, then your Grok Bot takes it from here.
        </h2>
      </div>
      <ol className="m-0 grid list-none gap-4 p-0 lg:grid-cols-2">
        <li className="surface-card relative overflow-hidden p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-matcha-deep text-sm font-bold text-white shadow-[0_8px_18px_rgba(23,63,46,0.2)]">
              01
            </span>
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6 text-matcha-soft"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              aria-hidden="true"
            >
              <path d="M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z" />
            </svg>
          </div>
          <h3 className="mt-7 font-[family-name:var(--font-fraunces)] text-xl font-semibold text-matcha-deep">
            Connect your calendar
          </h3>
          <p className="mt-2 text-sm leading-6 text-muted">
            HoneyMatcha checks free/busy availability only. Your event titles
            and details always stay private.
          </p>
        </li>
        <li className="surface-card relative overflow-hidden p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-honey text-sm font-bold text-white shadow-[0_8px_18px_rgba(200,146,45,0.22)]">
              02
            </span>
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6 text-honey"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              aria-hidden="true"
            >
              <path d="M8 12h8m-4-4v8M5 4h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H9l-5 3V6a2 2 0 0 1 2-2Z" />
            </svg>
          </div>
          <h3 className="mt-7 font-[family-name:var(--font-fraunces)] text-xl font-semibold text-matcha-deep">
            Connect your Grok Bot
          </h3>
          <p className="mt-2 text-sm leading-6 text-muted">
            Open <a href={GROK_BOT_URL}>Grok Bot at x.ai/bot</a>, paste this
            prompt into your Bot&apos;s conversation, then approve its secure
            connection.
          </p>
            <div className="mt-3">
              <CopyBlock text={ASK_AGENT_PROMPT} />
            </div>
        </li>
      </ol>
      <p className="mt-5 text-sm text-muted">
        {signedIn ? (
          <>
            Finish these in{" "}
            <Link href="/app">your HoneyMatcha home</Link>.
          </>
        ) : (
          "That’s the whole setup. Ask your Grok Bot to invite someone or find a meeting time whenever you’re ready."
        )}
      </p>
    </section>
  );
}
