import { and, count, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { AppNav } from "@/components/app-nav";
import { getDb } from "@/db";
import { confirms } from "@/db/schema";
import { getProfileForUser } from "@/lib/agent-profiles";
import { ensureCurrentUser } from "@/lib/users";
import { getHomeStatus } from "@/lib/home-status";
import { discoveryFeatureEnabled } from "@/lib/discovery-feature";
import { eventsFeatureEnabled } from "@/lib/events-feature";
import { listEventsWithUpdates } from "@/lib/events/load-updates";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Sync Clerk user into Postgres on first /app visit.
  let attentionCount = 0;
  let eventsUnreadCount = 0;
  let agentConnected = false;
  let handle: string | null = null;
  try {
    const user = await ensureCurrentUser();
    if (user && !(await getProfileForUser(user.id))) {
      redirect("/setup");
    }
    if (user) {
      const [row, home, eventUpdates] = await Promise.all([
        getDb()
          .select({ count: count() })
          .from(confirms)
          .where(
            and(
              eq(confirms.userId, user.id),
              eq(confirms.status, "pending"),
            ),
          )
          .then((rows) => rows[0]),
        getHomeStatus(user),
        eventsFeatureEnabled()
          ? listEventsWithUpdates(user)
          : Promise.resolve({ unreadEventCount: 0 }),
      ]);
      attentionCount = Number(row?.count ?? 0);
      eventsUnreadCount = eventUpdates.unreadEventCount;
      agentConnected = home.agent.connected;
      handle = home.handle;
    }
  } catch (error) {
    // redirect() throws; a bare catch would skip first-login handle setup.
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      String((error as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    // DB may be unavailable in local UI-only runs; pages that need DB surface errors.
  }

  return (
    <div className="flex min-h-full flex-col bg-[radial-gradient(circle_at_8%_0%,rgba(117,161,132,0.12),transparent_25rem),radial-gradient(circle_at_94%_20%,rgba(240,220,168,0.15),transparent_24rem),linear-gradient(180deg,#f9fbf8_0%,#f4f7f3_55%,#f6f3eb_100%)]">
      <AppNav
        attentionCount={attentionCount}
        eventsUnreadCount={eventsUnreadCount}
        discoveryEnabled={discoveryFeatureEnabled()}
        agentConnected={agentConnected}
        handle={handle}
      />
      <main className="mx-auto w-full max-w-[72rem] flex-1 px-5 py-8 sm:px-6 sm:py-12">
        {children}
      </main>
    </div>
  );
}
