import Link from "next/link";

export type SageProactiveUpdate = {
  id: string;
  trigger: string;
  state: string;
  action: string | null;
  createdAt: string;
};

function updateTitle(update: SageProactiveUpdate) {
  if (update.trigger === "deadline") return "Event deadline reviewed";
  if (update.trigger === "approval_result") return "Decision follow-up reviewed";
  if (update.action === "event") return "Event update reviewed";
  if (update.action === "session") return "Coordination update reviewed";
  return "New activity reviewed";
}

function updateStatus(update: SageProactiveUpdate) {
  if (update.state === "completed") {
    return "Sage checked the latest state and kept consequential actions with you.";
  }
  if (update.state === "failed" || update.state === "dead_letter") {
    return "Sage could not finish this review. The original activity is still available.";
  }
  return "Sage is reviewing the latest state now.";
}

export function SageProactiveUpdates({
  updates,
}: {
  updates: SageProactiveUpdate[];
}) {
  if (updates.length === 0) return null;

  return (
    <section aria-labelledby="sage-updates" className="mt-10">
      <div className="flex items-end justify-between gap-3 border-b border-line pb-3">
        <div>
          <p className="section-kicker">Picked up for you</p>
          <h2
            id="sage-updates"
            className="mt-1 font-[family-name:var(--font-fraunces)] text-2xl font-semibold tracking-[-0.03em] text-matcha-deep"
          >
            Sage updates
          </h2>
        </div>
        <Link href="/app/activity" className="text-sm font-semibold text-matcha-deep">
          Open activity <span aria-hidden="true">→</span>
        </Link>
      </div>
      <ul className="divide-y divide-line">
        {updates.map((update) => (
          <li key={update.id} className="flex gap-3 py-4">
            <span
              className={`mt-2 h-2 w-2 shrink-0 rounded-full ${
                update.state === "completed"
                  ? "bg-matcha"
                  : update.state === "failed" || update.state === "dead_letter"
                    ? "bg-danger"
                    : "bg-honey"
              }`}
              aria-hidden="true"
            />
            <span>
              <span className="block text-sm font-semibold text-ink">
                {updateTitle(update)}
              </span>
              <span className="mt-1 block text-sm leading-6 text-muted">
                {updateStatus(update)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
