"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { PublicLink } from "@/lib/links";
import type { PublicInviteView } from "@/lib/public-invites";
import { PublicInviteQr } from "@/components/public-invite-qr";

export function LinksManager({
  initialLinks,
  initialPublicInvites,
}: {
  initialLinks: PublicLink[];
  initialPublicInvites: PublicInviteView[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [toEmail, setToEmail] = useState("");
  const [toName, setToName] = useState("");
  const [publicLabel, setPublicLabel] = useState("");
  const [publicMaxRedemptions, setPublicMaxRedemptions] = useState("25");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<PublicLink | null>(null);
  const [createdPublic, setCreatedPublic] = useState<PublicInviteView | null>(
    null,
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [acceptCode, setAcceptCode] = useState("");

  async function createInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreated(null);
    setCopiedId(null);

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

  async function createPublicInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreatedPublic(null);
    setCopiedId(null);
    const response = await fetch("/api/public-invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: publicLabel.trim() || undefined,
        maxRedemptions: Number(publicMaxRedemptions),
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error ?? "Failed to create public invite");
      return;
    }
    setCreatedPublic(data.publicInvite);
    setPublicLabel("");
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

  async function approveRequest(id: string) {
    setError(null);
    const response = await fetch(`/api/links/${id}/approve`, {
      method: "POST",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error ?? "Failed to approve connection request");
      return;
    }
    startTransition(() => router.refresh());
  }

  async function revokePublicInvite(id: string) {
    setError(null);
    const response = await fetch(`/api/public-invites/${id}/revoke`, {
      method: "POST",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error ?? "Failed to revoke public invite");
      return;
    }
    if (createdPublic?.id === id) setCreatedPublic(null);
    startTransition(() => router.refresh());
  }

  async function copyInviteUrl(id: string, inviteUrl: string) {
    await navigator.clipboard.writeText(inviteUrl);
    setCopiedId(id);
  }

  const active = initialLinks.filter((l) => l.status === "active");
  const pendingInvites = initialLinks.filter((l) => l.status === "pending");
  const publicRequests = pendingInvites.filter(
    (link) =>
      (link.publicInviteId || link.profileHandle) &&
      link.direction === "outgoing",
  );
  const awaitingApproval = pendingInvites.filter(
    (link) =>
      (link.publicInviteId || link.profileHandle) &&
      link.direction === "incoming",
  );
  const privatePendingInvites = pendingInvites.filter(
    (link) => !link.publicInviteId && !link.profileHandle,
  );
  const revoked = initialLinks.filter((l) => l.status === "revoked");
  const publicInviteMap = new Map(
    initialPublicInvites.map((invite) => [invite.id, invite]),
  );
  if (createdPublic) publicInviteMap.set(createdPublic.id, createdPublic);
  const publicInviteList = [...publicInviteMap.values()];

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <div>
          <h2 className="font-[family-name:var(--font-fraunces)] text-xl font-semibold text-matcha-deep">
            Public invite link or QR
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Anyone with the link can request a connection. You approve every
            person before either agent receives relationship permissions.
          </p>
        </div>
        <form
          onSubmit={createPublicInvite}
          className="flex flex-wrap items-end gap-3"
        >
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-ink">Label (optional)</span>
            <input
              value={publicLabel}
              onChange={(event) => setPublicLabel(event.target.value)}
              maxLength={80}
              placeholder="Conference QR"
              className="field min-w-[16rem]"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-ink">Request limit</span>
            <select
              value={publicMaxRedemptions}
              onChange={(event) =>
                setPublicMaxRedemptions(event.target.value)
              }
              className="field"
            >
              <option value="10">10 people</option>
              <option value="25">25 people</option>
              <option value="50">50 people</option>
              <option value="100">100 people</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={pending}
            className="button-primary cursor-pointer disabled:opacity-60"
          >
            Create public invite
          </button>
        </form>

        {publicInviteList.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {publicInviteList.map((invite) => (
              <article
                key={invite.id}
                className="rounded-xl border border-line bg-[rgba(255,252,246,0.72)] p-4"
              >
                <div className="flex flex-wrap gap-4">
                  {invite.status === "active" ? (
                    <PublicInviteQr
                      inviteUrl={invite.inviteUrl}
                      label={invite.label}
                    />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-matcha-deep">
                      {invite.label || "Public connection invite"}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {invite.redemptionCount} of {invite.maxRedemptions}{" "}
                      requests used · expires{" "}
                      {new Date(invite.expiresAt).toLocaleDateString()}
                    </p>
                    <code className="mt-3 block break-all rounded bg-white/80 px-2 py-2 text-xs text-ink">
                      {invite.inviteUrl}
                    </code>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {invite.status === "active" ? (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              copyInviteUrl(invite.id, invite.inviteUrl)
                            }
                            className="cursor-pointer rounded-md border border-line bg-white px-3 py-1.5 text-xs font-semibold text-matcha-deep"
                          >
                            {copiedId === invite.id
                              ? "Copied"
                              : "Copy public link"}
                          </button>
                          <button
                            type="button"
                            onClick={() => revokePublicInvite(invite.id)}
                            className="cursor-pointer rounded-md border border-danger/40 px-3 py-1.5 text-xs font-semibold text-danger"
                          >
                            Revoke link
                          </button>
                        </>
                      ) : (
                        <span className="text-xs font-semibold text-muted">
                          Revoked
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-fraunces)] text-xl font-semibold text-matcha-deep">
          Invite someone
        </h2>
        <p className="max-w-xl text-sm text-muted">
          Send a private, expiring invitation to someone you know. After they
          accept, either person can end the connection at any time.
        </p>
        <form onSubmit={createInvite} className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-ink">Their email</span>
            <input
              type="email"
              name="invite-email"
              value={toEmail}
              onChange={(e) => setToEmail(e.target.value)}
              className="field min-w-[16rem]"
              placeholder="friend@example.com"
              required
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-ink">Name (optional)</span>
            <input
              name="invite-name"
              value={toName}
              onChange={(e) => setToName(e.target.value)}
              className="field min-w-[12rem]"
              placeholder="Alex"
              maxLength={80}
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="button-primary cursor-pointer disabled:opacity-60"
          >
            Create invite
          </button>
        </form>

        {created && (
          <div className="rounded-md border border-honey bg-[rgba(232,210,154,0.35)] p-4">
            <p className="font-semibold text-matcha-deep">
              Share this private invitation
            </p>
            <code className="mt-2 block break-all rounded bg-white/70 px-3 py-2 text-sm text-ink">
              {created.inviteUrl}
            </code>
            <p className="mt-2 font-mono text-xs text-muted">
              Code: {created.inviteCode}
            </p>
            {created.expiresAt ? (
              <p className="mt-1 text-xs text-muted">
                Expires {new Date(created.expiresAt).toLocaleString()}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => copyInviteUrl(created.id, created.inviteUrl)}
              className="mt-3 cursor-pointer rounded-md border border-line bg-white/80 px-3 py-1.5 text-sm font-medium text-matcha-deep"
            >
              {copiedId === created.id ? "Copied" : "Copy invite URL"}
            </button>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-fraunces)] text-xl font-semibold text-matcha-deep">
          Have an invitation code?
        </h2>
        <form onSubmit={acceptInvite} className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-ink">Invite code</span>
            <input
              value={acceptCode}
              name="invite-code"
              onChange={(e) => setAcceptCode(e.target.value)}
              className="field min-w-[14rem] font-mono"
              placeholder="HM-XXXX-XXXX-XXXX-XXXX"
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

      {publicRequests.length > 0 ? (
        <section>
          <h2 className="font-[family-name:var(--font-fraunces)] text-xl font-semibold text-matcha-deep">
            Connection requests
          </h2>
          <p className="mt-1 text-sm text-muted">
            Review people who used one of your public links.
          </p>
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {publicRequests.map((link) => (
              <li
                key={link.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="font-medium text-ink">
                    {link.toName || link.toEmail || "HoneyMatcha member"}
                  </p>
                  <p className="text-sm text-muted">
                    {link.profileHandle
                      ? `via honeymatcha.io/${link.profileHandle}`
                      : link.toEmail}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => approveRequest(link.id)}
                    disabled={pending}
                    className="cursor-pointer rounded-md bg-matcha-deep px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => revokeLink(link.id)}
                    disabled={pending}
                    className="cursor-pointer rounded-md border border-danger/40 px-3 py-1.5 text-sm font-semibold text-danger disabled:opacity-60"
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {awaitingApproval.length > 0 ? (
        <section>
          <h2 className="font-[family-name:var(--font-fraunces)] text-xl font-semibold text-matcha-deep">
            Awaiting approval
          </h2>
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {awaitingApproval.map((link) => (
              <li
                key={link.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="font-medium text-ink">
                    Connection request sent
                  </p>
                  <p className="text-sm text-muted">
                    The public invite owner must approve it.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => revokeLink(link.id)}
                  className="cursor-pointer rounded-md border border-line px-3 py-1.5 text-sm font-semibold text-muted"
                >
                  Cancel request
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="font-[family-name:var(--font-fraunces)] text-xl font-semibold text-matcha-deep">
          Connected
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
                    {link.peer?.email ?? link.toEmail ?? "—"} · can coordinate
                    meetings
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

      {privatePendingInvites.length > 0 && (
        <section>
          <h2 className="font-[family-name:var(--font-fraunces)] text-xl font-semibold text-matcha-deep">
            Pending invites
          </h2>
          <ul className="mt-3 divide-y divide-line border-t border-b border-line">
            {privatePendingInvites.map((link) => (
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
