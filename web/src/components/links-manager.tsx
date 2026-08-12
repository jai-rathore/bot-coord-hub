"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { PublicLink } from "@/lib/links";

export function LinksManager({ initialLinks }: { initialLinks: PublicLink[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [toEmail, setToEmail] = useState("");
  const [toName, setToName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<PublicLink | null>(null);
  const [copied, setCopied] = useState(false);
  const [acceptCode, setAcceptCode] = useState("");

  async function createInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreated(null);
    setCopied(false);

    const res = await fetch("/api/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        toEmail: toEmail.trim() || undefined,
        toName: toName.trim() || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to create invite");
      return;
    }
    setCreated(data.link);
    setToEmail("");
    setToName("");
    startTransition(() => router.refresh());
  }

  async function acceptInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/links/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteCode: acceptCode.trim() }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to accept invite");
      return;
    }
    setAcceptCode("");
    startTransition(() => router.refresh());
  }

  async function revokeLink(id: string) {
    setError(null);
    const res = await fetch(`/api/links/${id}/revoke`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Failed to revoke link");
      return;
    }
    startTransition(() => router.refresh());
  }

  async function copyInviteUrl() {
    if (!created?.inviteUrl) return;
    await navigator.clipboard.writeText(created.inviteUrl);
    setCopied(true);
  }

  const active = initialLinks.filter((l) => l.status === "active");
  const pendingInvites = initialLinks.filter((l) => l.status === "pending");
  const revoked = initialLinks.filter((l) => l.status === "revoked");

  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-fraunces)] text-xl font-semibold text-matcha-deep">
          Create invite link
        </h2>
        <p className="max-w-xl text-sm text-muted">
          Share this link with a friend’s bot/human. They sign in (or their
          agent uses a Bearer key) and accept to form a mutual peer link.
        </p>
        <form onSubmit={createInvite} className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-ink">Friend email (optional)</span>
            <input
              type="email"
              value={toEmail}
              onChange={(e) => setToEmail(e.target.value)}
              className="min-w-[16rem] rounded-md border border-line bg-white/80 px-3 py-2 outline-none focus:border-matcha"
              placeholder="friend@example.com"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-ink">Name (optional)</span>
            <input
              value={toName}
              onChange={(e) => setToName(e.target.value)}
              className="min-w-[12rem] rounded-md border border-line bg-white/80 px-3 py-2 outline-none focus:border-matcha"
              placeholder="Alex"
              maxLength={80}
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="cursor-pointer rounded-md border border-matcha-deep bg-matcha-deep px-4 py-2 text-sm font-semibold text-[#f7faf6] transition hover:bg-matcha disabled:opacity-60"
          >
            Create invite
          </button>
        </form>

        {created && (
          <div className="rounded-md border border-honey bg-[rgba(232,210,154,0.35)] p-4">
            <p className="font-semibold text-matcha-deep">
              Share this link with a friend’s bot/human
            </p>
            <code className="mt-2 block break-all rounded bg-white/70 px-3 py-2 text-sm text-ink">
              {created.inviteUrl}
            </code>
            <p className="mt-2 font-mono text-xs text-muted">
              Code: {created.inviteCode}
            </p>
            <button
              type="button"
              onClick={copyInviteUrl}
              className="mt-3 cursor-pointer rounded-md border border-line bg-white/80 px-3 py-1.5 text-sm font-medium text-matcha-deep"
            >
              {copied ? "Copied" : "Copy invite URL"}
            </button>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-fraunces)] text-xl font-semibold text-matcha-deep">
          Accept an invite
        </h2>
        <form onSubmit={acceptInvite} className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-ink">Invite code</span>
            <input
              value={acceptCode}
              onChange={(e) => setAcceptCode(e.target.value)}
              className="min-w-[14rem] rounded-md border border-line bg-white/80 px-3 py-2 font-mono outline-none focus:border-matcha"
              placeholder="HM-XXXX-XXXX"
              required
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="cursor-pointer rounded-md border border-line bg-white/80 px-4 py-2 text-sm font-semibold text-matcha-deep transition hover:border-matcha disabled:opacity-60"
          >
            Accept
          </button>
        </form>
      </section>

      {error && (
        <p className="text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}

      <section>
        <h2 className="font-[family-name:var(--font-fraunces)] text-xl font-semibold text-matcha-deep">
          Active links
        </h2>
        {active.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No active links yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line border-t border-b border-line">
            {active.map((link) => (
              <li
                key={link.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="font-medium text-ink">
                    {link.peer?.name || link.peer?.email || link.toEmail || "Peer"}
                  </p>
                  <p className="text-sm text-muted">
                    {link.peer?.email ?? link.toEmail ?? "—"} ·{" "}
                    {(link.scopes ?? []).join(", ") || "no scopes"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => revokeLink(link.id)}
                  className="cursor-pointer rounded-md border border-danger/40 px-3 py-1.5 text-sm font-medium text-danger transition hover:bg-danger/5"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {pendingInvites.length > 0 && (
        <section>
          <h2 className="font-[family-name:var(--font-fraunces)] text-xl font-semibold text-matcha-deep">
            Pending invites
          </h2>
          <ul className="mt-3 divide-y divide-line border-t border-b border-line">
            {pendingInvites.map((link) => (
              <li
                key={link.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="font-medium text-ink">
                    {link.direction === "outgoing" ? "Outgoing" : "Incoming"} ·{" "}
                    {link.toEmail || "Open invite"}
                  </p>
                  <p className="break-all font-mono text-xs text-muted">
                    {link.inviteUrl}
                  </p>
                </div>
                {link.direction === "outgoing" && (
                  <button
                    type="button"
                    onClick={() => revokeLink(link.id)}
                    className="cursor-pointer rounded-md border border-danger/40 px-3 py-1.5 text-sm font-medium text-danger"
                  >
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {revoked.length > 0 && (
        <section>
          <h2 className="font-[family-name:var(--font-fraunces)] text-xl font-semibold text-muted">
            Revoked
          </h2>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            {revoked.map((link) => (
              <li key={link.id}>
                {link.peer?.email ?? link.toEmail ?? link.inviteCode} · revoked
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
