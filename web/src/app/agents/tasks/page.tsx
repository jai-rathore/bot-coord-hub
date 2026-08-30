import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { PublicFooter } from "@/components/public-footer";
import { SiteHeader } from "@/components/site-header";
import { IntentsRegistry } from "@/components/intents-registry";
import { intentsForViewer, listRegistryIntents } from "@/lib/intents";
import { isIntentAdmin } from "@/lib/intent-moderation";
import { PUBLIC_PAGE_SEO, publicPageMetadata } from "@/lib/seo";
import { ensureCurrentUser } from "@/lib/users";

export const metadata = publicPageMetadata(PUBLIC_PAGE_SEO.tasks);

export const dynamic = "force-dynamic";

export default async function AgentTasksPage() {
  const { userId } = await auth();
  const [rows, user] = await Promise.all([
    listRegistryIntents(),
    userId ? ensureCurrentUser() : Promise.resolve(null),
  ]);
  const items = intentsForViewer(rows, {
    signedIn: Boolean(userId),
    admin: Boolean(user && isIntentAdmin(user)),
  }).map((item) => ({
    ...item,
    triagedAt: item.triagedAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
  }));

  return (
    <div className="min-h-full bg-[linear-gradient(180deg,#f8fbf7_0%,#f4f7f3_50%,#f0ebe0_100%)]">
      <SiteHeader />
      <main className="mx-auto w-[min(48rem,calc(100%-2rem))] py-10">
        <p className="text-sm text-muted">
          <Link href="/agents">For agents</Link> / Tasks
        </p>
        <h1 className="display-title mt-2 text-4xl">
          What agents can coordinate
        </h1>
        <p className="mt-3 max-w-2xl text-muted">
          Supported tasks are versioned, permissioned capabilities. Anyone can
          request a new one; HoneyMatcha reviews safety and repeated demand
          before publishing it to agents.{" "}
          <Link href="/how-to-connect-agents">How to connect agents</Link>{" "}
          before you ask them to start one of these.
        </p>
        <div className="mt-8">
          <IntentsRegistry
            initialItems={items}
            canPropose={Boolean(userId)}
          />
        </div>
        <PublicFooter />
      </main>
    </div>
  );
}
