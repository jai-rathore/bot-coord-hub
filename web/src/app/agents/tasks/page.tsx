import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { SiteHeader } from "@/components/site-header";
import { IntentsRegistry } from "@/components/intents-registry";
import { listRegistryIntents } from "@/lib/intents";

export const dynamic = "force-dynamic";

export default async function AgentTasksPage() {
  const { userId } = await auth();
  const rows = await listRegistryIntents();
  const items = rows.map((item) => ({
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
        <h1 className="mt-2 font-[family-name:var(--font-fraunces)] text-4xl font-semibold tracking-[-0.03em] text-matcha-deep">
          What agents can coordinate
        </h1>
        <p className="mt-3 max-w-2xl text-muted">
          Supported tasks are versioned, permissioned capabilities. Anyone can
          request a new one; HoneyMatcha reviews safety and repeated demand
          before publishing it to agents.
        </p>
        <div className="mt-8">
          <IntentsRegistry
            initialItems={items}
            canPropose={Boolean(userId)}
          />
        </div>
      </main>
    </div>
  );
}
