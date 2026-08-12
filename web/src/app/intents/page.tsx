import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { SiteHeader } from "@/components/site-header";
import { IntentsRegistry } from "@/components/intents-registry";
import { listRegistryIntents } from "@/lib/intents";

export const dynamic = "force-dynamic";

export default async function IntentsPage() {
  const { userId } = await auth();
  let items: Array<{
    id: string;
    source: "type" | "proposal";
    slug: string;
    name: string;
    description: string | null;
    status: "pending" | "live" | "rejected";
    rejectionReason: string | null;
    triageRecommendation: "publish" | "reject" | "needs_review" | null;
    triageReason: string | null;
    triagedAt: string | null;
    proposedByUserId: string | null;
    createdAt: string;
  }> = [];
  let dbError: string | null = null;

  try {
    const rows = await listRegistryIntents();
    items = rows.map((r) => ({
      ...r,
      triagedAt: r.triagedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  } catch (err) {
    dbError = err instanceof Error ? err.message : "Database unavailable";
  }

  return (
    <div className="min-h-full bg-[linear-gradient(180deg,#f8fbf7_0%,#f4f7f3_50%,#f0ebe0_100%)]">
      <SiteHeader />
      <main className="mx-auto w-[min(48rem,calc(100%-2rem))] py-8">
        <p className="text-sm text-muted">
          <Link href="/" className="no-underline hover:underline">
            Home
          </Link>{" "}
          / Intents
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-fraunces)] text-3xl font-semibold tracking-[-0.02em] text-matcha-deep">
          Intent registry
        </h1>
        <p className="mt-2 max-w-xl text-muted">
          Live, pending, and rejected coordination intents. Proposals start
          pending, get a triage note, then a human publishes or rejects.
          Moderators:{" "}
          <Link href="/app/intents" className="font-medium text-matcha-deep">
            /app/intents
          </Link>
          .
        </p>

        {dbError ? (
          <p className="mt-6 text-sm text-danger" role="alert">
            Could not load registry: {dbError}. Check DATABASE_URL and run{" "}
            <code>npm run db:migrate</code> + <code>npm run db:seed</code>.
          </p>
        ) : (
          <div className="mt-8">
            <IntentsRegistry
              initialItems={items}
              canPropose={Boolean(userId)}
            />
          </div>
        )}
      </main>
    </div>
  );
}
