import { and, count, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { AppNav } from "@/components/app-nav";
import { getDb } from "@/db";
import { confirms } from "@/db/schema";
import { isNextControlFlowError } from "@/lib/next-errors";
import { getProfileForUser } from "@/lib/agent-profiles";
import { ensureCurrentUser } from "@/lib/users";
import { agentIsConnected } from "@/lib/home-status";
import { discoveryFeatureEnabled } from "@/lib/discovery-feature";
import { eventsFeatureEnabled } from "@/lib/events-feature";
import { listEventsWithUpdates } from "@/lib/events/updates";

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
    if (user) {
      // getProfileForUser is request-scoped, so the page below reuses this read
      // rather than issuing its own. It also carries the handle, which the shell
      // previously paid for a second time inside getHomeStatus.
      const profile = await getProfileForUser(user.id);
      if (!profile) redirect("/setup");

      // Isolated so a failure in event updates cannot zero the attention
      // badge or the agent-connected state, and vice versa.
      const [rowResult, connectedResult, eventUpdatesResult] =
        await Promise.allSettled([
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
          agentIsConnected(user.id),
          eventsFeatureEnabled()
            ? listEventsWithUpdates(user)
            : Promise.resolve({ unreadEventCount: 0 }),
        ]);
      if (rowResult.status === "fulfilled") {
        attentionCount = Number(rowResult.value?.count ?? 0);
      } else {
        console.error("[app-shell] attention count failed", rowResult.reason);
      }
      if (connectedResult.status === "fulfilled") {
        agentConnected = connectedResult.value;
      } else {
        console.error(
          "[app-shell] agent connected check failed",
          connectedResult.reason,
        );
      }
      if (eventUpdatesResult.status === "fulfilled") {
        eventsUnreadCount = eventUpdatesResult.value.unreadEventCount;
      } else {
        console.error(
          "[app-shell] event updates failed",
          eventUpdatesResult.reason,
        );
      }
      handle = profile.handle;
    }
  } catch (error) {
    // Next signals redirect(), notFound(), and the static-generation bailout by
    // throwing; all of them have to reach the framework. Previously only
    // redirect() was re-thrown, so the dynamic-usage bailout was swallowed too.
    if (isNextControlFlowError(error)) throw error;
    // DB may be unavailable in local UI-only runs; pages that need DB surface errors.
    // The shell still renders with zeroed badges, but the cause is logged
    // rather than swallowed — this ran on every /app navigation.
    console.error("[app-shell] layout data load failed", error);
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
      <main className="has-tab-bar mx-auto w-full max-w-[72rem] flex-1 px-5 pt-8 sm:px-6 sm:pt-12">
        {children}
      </main>
    </div>
  );
}
