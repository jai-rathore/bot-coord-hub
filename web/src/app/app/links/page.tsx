export default function LinksPage() {
  return (
    <div>
      <h1 className="font-[family-name:var(--font-fraunces)] text-3xl font-semibold tracking-[-0.02em] text-matcha-deep">
        Links
      </h1>
      <p className="mt-2 max-w-xl text-muted">
        Mutual peer links between people. Invite / accept / revoke will land
        here.
      </p>
      <p className="mt-6 rounded-md border border-dashed border-line bg-[rgba(255,252,246,0.55)] px-4 py-3 text-sm text-muted">
        TODO: Invite peer by email, accept invite codes, list active links, and
        revoke. Schema tables <code>links</code> are ready; agent stub already
        lists links at <code>GET /api/v1/links</code>.
      </p>
    </div>
  );
}
