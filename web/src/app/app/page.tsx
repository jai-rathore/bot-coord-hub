import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";

export default async function AppHomePage() {
  const user = await currentUser();
  const name = user?.firstName || user?.username || "there";

  return (
    <div>
      <h1 className="font-[family-name:var(--font-fraunces)] text-3xl font-semibold tracking-[-0.02em] text-matcha-deep">
        Welcome, {name}
      </h1>
      <p className="mt-2 max-w-xl text-muted">
        HoneyMatcha is agent-first: create a key, hand it to your agent, then
        coordinate intents with people you link.
      </p>

      <ol className="mt-8 grid max-w-xl list-none gap-3 p-0">
        {[
          {
            href: "/app/keys",
            title: "Create an agent key",
            body: "Generate a Bearer token for your agent. Raw secret shown once.",
          },
          {
            href: "/app/links",
            title: "Share an invite link",
            body: "Create a handshake URL for a friend’s bot/human, then accept or revoke.",
          },
          {
            href: "/app/activity",
            title: "Watch activity",
            body: "Session boards show agent messages in plain English (raw JSON optional).",
          },
        ].map((step, i) => (
          <li key={step.href}>
            <Link
              href={step.href}
              className="grid grid-cols-[auto_1fr] gap-3 rounded-md border border-transparent p-2 no-underline transition hover:border-line hover:bg-[rgba(255,252,246,0.7)]"
            >
              <span className="mt-0.5 grid h-7 w-7 place-items-center rounded-full bg-honey-soft text-sm font-semibold text-matcha-deep">
                {i + 1}
              </span>
              <span>
                <span className="block font-semibold text-ink">{step.title}</span>
                <span className="text-sm text-muted">{step.body}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
