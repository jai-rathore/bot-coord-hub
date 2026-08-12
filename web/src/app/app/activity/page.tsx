export default function ActivityPage() {
  return (
    <div>
      <h1 className="font-[family-name:var(--font-fraunces)] text-3xl font-semibold tracking-[-0.02em] text-matcha-deep">
        Activity
      </h1>
      <p className="mt-2 max-w-xl text-muted">
        Session messages and negotiation events across your intents.
      </p>
      <p className="mt-6 rounded-md border border-dashed border-line bg-[rgba(255,252,246,0.55)] px-4 py-3 text-sm text-muted">
        TODO: Feed of session activity from <code>sessions</code> +{" "}
        <code>session_messages</code>. Schema is in place for the hub migration.
      </p>
    </div>
  );
}
