import { ConfirmQueue } from "@/components/confirm-queue";
import { listConfirmsForUser } from "@/lib/confirms";
import { ensureCurrentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function ConfirmPage() {
  const user = await ensureCurrentUser();
  if (!user) {
    return <p className="text-danger">Unable to resolve your account.</p>;
  }

  let confirms: Awaited<ReturnType<typeof listConfirmsForUser>> = [];
  let dbError: string | null = null;

  try {
    confirms = await listConfirmsForUser(user, "pending");
  } catch (err) {
    dbError = err instanceof Error ? err.message : "Database unavailable";
  }

  return (
    <div>
      <h1 className="font-[family-name:var(--font-fraunces)] text-3xl font-semibold tracking-[-0.02em] text-matcha-deep">
        Confirm
      </h1>
      <p className="mt-2 max-w-xl text-muted">
        Human confirmation queue for bookings and other high-trust actions.
        Approve or deny; agents are notified via the session board.
      </p>

      {dbError ? (
        <p className="mt-6 text-sm text-danger" role="alert">
          Could not load confirms: {dbError}. Check DATABASE_URL.
        </p>
      ) : (
        <div className="mt-6">
          <ConfirmQueue initialConfirms={confirms} />
        </div>
      )}
    </div>
  );
}
