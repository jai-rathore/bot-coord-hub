import { ConfirmQueue } from "@/components/confirm-queue";
import { listConfirmsForUser } from "@/lib/confirms";
import { ensureCurrentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function AttentionPage() {
  const user = await ensureCurrentUser();
  if (!user) {
    return <p className="text-danger">Unable to resolve your account.</p>;
  }
  const confirms = await listConfirmsForUser(user, "pending");

  return (
    <div>
      <h1 className="font-[family-name:var(--font-fraunces)] text-3xl font-semibold tracking-[-0.02em] text-matcha-deep">
        Needs your attention
      </h1>
      <p className="mt-2 max-w-xl text-muted">
        Things your agent paused for you to approve or decline. An agent
        credential cannot decide these in your place.
      </p>
      <div className="mt-7">
        <ConfirmQueue initialConfirms={confirms} />
      </div>
    </div>
  );
}
