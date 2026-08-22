import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

export default function SupportPage() {
  return (
    <div className="min-h-full bg-[linear-gradient(180deg,#f8fbf7_0%,#f4f7f3_50%,#f0ebe0_100%)]">
      <SiteHeader />
      <main className="mx-auto w-[min(44rem,calc(100%-2rem))] py-10">
        <p className="section-kicker">Support</p>
        <h1 className="display-title mt-2 text-4xl">We&apos;ll help you connect.</h1>
        <div className="mt-7 space-y-7 text-sm leading-7 text-muted">
          <section>
            <h2 className="text-lg font-semibold text-ink">
              Assistant connections
            </h2>
            <p className="mt-2">
              Follow the <Link href="/agents">step-by-step assistant guide</Link>{" "}
              and use <code>https://honeymatcha.io/api/mcp</code>. It includes
              ChatGPT, Claude, Gemini Spark, Grok Bot, and Cursor, plus the
              recurring inbox check for each platform. If OAuth, tool discovery,
              or a write confirmation fails, include the assistant name, the
              step that failed, and the exact error text in your message. Never
              send an access token or API key.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-ink">Contact</h2>
            <p className="mt-2">
              Email{" "}
              <a href="mailto:support@honeymatcha.io">
                support@honeymatcha.io
              </a>
              . We can help with account access, connector setup, data requests,
              and suspected security issues.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-ink">Service check</h2>
            <p className="mt-2">
              Agents and operators can check the public{" "}
              <Link href="/api/v1/health">HoneyMatcha health endpoint</Link> before
              retrying a failed connection.
            </p>
          </section>
        </div>
        <p className="mt-10 border-t border-line pt-5 text-sm text-muted">
          <Link href="/docs">Docs</Link> · <Link href="/privacy">Privacy</Link>{" "}
          · <Link href="/terms">Terms</Link>
        </p>
      </main>
    </div>
  );
}
