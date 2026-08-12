import { AppNav } from "@/components/app-nav";
import { ensureCurrentUser } from "@/lib/users";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Sync Clerk user into Postgres on first /app visit.
  try {
    await ensureCurrentUser();
  } catch {
    // DB may be unavailable in local UI-only runs; pages that need DB surface errors.
  }

  return (
    <div className="flex min-h-full flex-col bg-[linear-gradient(180deg,#f8fbf7_0%,#f4f7f3_40%,#f0ebe0_100%)]">
      <AppNav />
      <main className="mx-auto w-[min(64rem,calc(100%-2rem))] flex-1 py-8">
        {children}
      </main>
    </div>
  );
}
