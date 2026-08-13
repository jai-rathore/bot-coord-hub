import Link from "next/link";
import { CopyBlock } from "@/components/copy-block";
import { ASK_AGENT_PROMPT } from "@/lib/connect-copy";

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
      className="mb-10 scroll-mt-6"
    >
      <h2
        id="get-started-title"
        className="font-[family-name:var(--font-fraunces)] text-[1.2rem] font-semibold tracking-[-0.01em] text-matcha-deep"
      >
        {signedIn ? "Finish setup" : "How to start"}
      </h2>
      <p className="mt-2 mb-4 text-[0.95rem] text-muted">
        {signedIn
          ? "Two steps left. After that, you talk to your agent."
          : "Three steps. After that, you talk to your agent."}
      </p>
      <ol className="m-0 grid list-none gap-3 p-0">
        {signedIn ? null : (
          <li className="grid grid-cols-[auto_1fr] gap-3">
            <span className="mt-0.5 grid h-[1.55rem] w-[1.55rem] place-items-center rounded-full bg-honey-soft text-[0.78rem] font-semibold text-matcha-deep">
              1
            </span>
            <span>
              <strong className="font-semibold text-ink">Create an account.</strong>{" "}
              That is for you, not your agent.
            </span>
          </li>
        )}
        <li className="grid grid-cols-[auto_1fr] gap-3">
          <span className="mt-0.5 grid h-[1.55rem] w-[1.55rem] place-items-center rounded-full bg-honey-soft text-[0.78rem] font-semibold text-matcha-deep">
            {signedIn ? "1" : "2"}
          </span>
          <span>
            <strong className="font-semibold text-ink">
              Connect Google Calendar.
            </strong>{" "}
            HoneyMatcha will ask you to do this after you sign in. Only free/busy
            is used.
          </span>
        </li>
        <li className="grid grid-cols-[auto_1fr] gap-3">
          <span className="mt-0.5 grid h-[1.55rem] w-[1.55rem] place-items-center rounded-full bg-honey-soft text-[0.78rem] font-semibold text-matcha-deep">
            {signedIn ? "2" : "3"}
          </span>
          <span>
            <strong className="font-semibold text-ink">
              Tell your agent to connect.
            </strong>{" "}
            Paste this, then approve the link it shows you.
            <div className="mt-3">
              <CopyBlock text={ASK_AGENT_PROMPT} />
            </div>
          </span>
        </li>
      </ol>
      <p className="mt-4 text-[0.92rem] text-muted">
        {signedIn ? (
          <>
            Finish these in{" "}
            <Link href="/app">your HoneyMatcha home</Link>.
          </>
        ) : (
          "That is the whole setup. Then ask your agent to invite someone or find a meeting time."
        )}
      </p>
    </section>
  );
}
