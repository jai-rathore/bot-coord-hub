import { and, count, eq } from "drizzle-orm";
import { AppNav } from "@/components/app-nav";
import { getDb } from "@/db";
import { confirms } from "@/db/schema";
import { ensureCurrentUser } from "@/lib/users";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Sync Clerk user into Postgres on first /app visit.
  let attentionCount = 0;
  try {
    const user = await ensureCurrentUser();
    if (user) {
      const [row] = await getDb()
        .select({ count: count() })
        .from(confirms)
        .where(
          and(
            eq(confirms.userId, user.id),
            eq(confirms.status, "pending"),
          ),
        );
      attentionCount = Number(row?.count ?? 0);
    }
  } catch {
    // DB may be unavailable in local UI-only runs; pages that need DB surface errors.
  }

  return (
    <div className="flex min-h-full flex-col hm-atmosphere">
      <AppNav attentionCount={attentionCount} />
      <main className="mx-auto w-[min(64rem,calc(100%-2rem))] flex-1 py-8">
        {children}
      </main>
    </div>
  );
}
