export default function ConfirmPage() {
  return (
    <div>
      <h1 className="font-[family-name:var(--font-fraunces)] text-3xl font-semibold tracking-[-0.02em] text-matcha-deep">
        Confirm
      </h1>
      <p className="mt-2 max-w-xl text-muted">
        Human confirmation queue for bookings and other high-trust actions.
      </p>
      <p className="mt-6 rounded-md border border-dashed border-line bg-[rgba(255,252,246,0.55)] px-4 py-3 text-sm text-muted">
        TODO: List pending confirmations and write audit rows to{" "}
        <code>confirms</code>. Bookings stay human-approved by default.
      </p>
    </div>
  );
}
