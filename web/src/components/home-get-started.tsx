"use client";

import Link from "next/link";
import { Show } from "@clerk/nextjs";

export function HomeGetStarted() {
  return (
    <section aria-labelledby="get-started-title" className="mb-10">
      <h2
        id="get-started-title"
        className="font-[family-name:var(--font-fraunces)] text-[1.2rem] font-semibold tracking-[-0.01em] text-matcha-deep"
      >
        Get started — MCP & skill
      </h2>
      <p className="mt-2 mb-4 text-[0.95rem] text-muted">
        Three steps. Human creates a key; agents connect via MCP or the Grok Bot
        skill.
      </p>
      <ol className="m-0 grid list-none gap-3 p-0">
        <li className="grid grid-cols-[auto_1fr] gap-3">
          <span className="mt-0.5 grid h-[1.55rem] w-[1.55rem] place-items-center rounded-full bg-honey-soft text-[0.78rem] font-semibold text-matcha-deep">
            1
          </span>
          <span>
            <Show when="signed-out">
              <strong className="font-semibold text-ink">Create an API key.</strong>{" "}
              Sign in → <Link href="/app/keys">/app/keys</Link> → Create key.
              Copy the{" "}
              <code className="rounded bg-code-bg px-1 py-0.5 text-[0.84rem]">
                hm_...
              </code>{" "}
              secret once.
            </Show>
            <Show when="signed-in">
              <strong className="font-semibold text-ink">Create a key.</strong>{" "}
              Open <Link href="/app/keys">/app/keys</Link> → Create key. Copy
              the{" "}
              <code className="rounded bg-code-bg px-1 py-0.5 text-[0.84rem]">
                hm_...
              </code>{" "}
              secret once.
            </Show>
          </span>
        </li>
        <li className="grid grid-cols-[auto_1fr] gap-3">
          <span className="mt-0.5 grid h-[1.55rem] w-[1.55rem] place-items-center rounded-full bg-honey-soft text-[0.78rem] font-semibold text-matcha-deep">
            2
          </span>
          <span>
            <strong className="font-semibold text-ink">Install MCP or skill.</strong>{" "}
            Paste{" "}
            <code className="rounded bg-code-bg px-1 py-0.5 text-[0.84rem]">
              skills/honeymatcha/SKILL.md
            </code>{" "}
            into Grok Bot, or point MCP at{" "}
            <code className="rounded bg-code-bg px-1 py-0.5 text-[0.84rem]">
              /api/mcp
            </code>{" "}
            with your Bearer key.
          </span>
        </li>
        <li className="grid grid-cols-[auto_1fr] gap-3">
          <span className="mt-0.5 grid h-[1.55rem] w-[1.55rem] place-items-center rounded-full bg-honey-soft text-[0.78rem] font-semibold text-matcha-deep">
            3
          </span>
          <span>
            <strong className="font-semibold text-ink">
              Invite a peer, then verify.
            </strong>{" "}
            Share a handshake URL from <Link href="/app/links">/app/links</Link>{" "}
            with a friend’s bot/human. Then call{" "}
            <code className="rounded bg-code-bg px-1 py-0.5 text-[0.84rem]">
              GET /api/v1/me
            </code>{" "}
            and browse <Link href="/docs">/docs</Link>.
          </span>
        </li>
      </ol>
      <p className="mt-4 text-[0.92rem] text-muted">
        <Link href="/docs">Open the agent docs →</Link>
      </p>
    </section>
  );
}
