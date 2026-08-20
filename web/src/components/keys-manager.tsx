"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export type KeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  expiresAt: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export function KeysManager({ initialKeys }: { initialKeys: KeyRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("Manual agent");
  const [error, setError] = useState<string | null>(null);
  const [createdRaw, setCreatedRaw] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function createKey(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreatedRaw(null);
    setCopied(false);

    // The await runs inside the transition so `pending` covers the
    // request, not just what follows it.
    startTransition(async () => {
      try {
        const res = await fetch("/api/keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Failed to create key");
          return;
        }
        setCreatedRaw(data.rawKey);
        setName("Manual agent");
        router.refresh();
      } catch {
        setError("Failed to create key");
      }
    });
  }

  function revokeKey(id: string) {
    setError(null);
    // The await runs inside the transition so `pending` covers the
    // request, not just what follows it.
    startTransition(async () => {
      try {
        const res = await fetch(`/api/keys/${id}`, { method: "DELETE" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error ?? "Failed to revoke key");
          return;
        }
        router.refresh();
      } catch {
        setError("Failed to revoke key");
      }
    });
  }

  async function copyRaw() {
    if (!createdRaw) return;
    await navigator.clipboard.writeText(createdRaw);
    setCopied(true);
  }

  const active = initialKeys.filter((k) => !k.revokedAt);
  const revoked = initialKeys.filter((k) => k.revokedAt);

  return (
    <div className="space-y-8">
      <form onSubmit={createKey} className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-ink">Connection name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="min-w-[14rem] rounded-md border border-line bg-white/80 px-3 py-2 outline-none focus:border-matcha"
            name="connection-name"
            placeholder="e.g. recruiting assistant"
            required
            maxLength={80}
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="button-primary cursor-pointer disabled:opacity-60"
        >
          Create manual credential
        </button>
      </form>

      {createdRaw && (
        <div className="rounded-md border border-honey bg-[rgba(232,210,154,0.35)] p-4">
          <p className="font-semibold text-matcha-deep">
            Copy this credential now—it won&apos;t be shown again.
          </p>
          <code className="mt-2 block break-all rounded bg-white/70 px-3 py-2 text-sm text-ink">
            {createdRaw}
          </code>
          <button
            type="button"
            onClick={copyRaw}
            className="mt-3 cursor-pointer rounded-md border border-line bg-white/80 px-3 py-1.5 text-sm font-medium text-matcha-deep"
          >
            {copied ? "Copied" : "Copy to clipboard"}
          </button>
        </div>
      )}

      {error && (
        <p className="text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}

      <section>
        <h2 className="font-[family-name:var(--font-fraunces)] text-xl font-semibold text-matcha-deep">
          Connected credentials
        </h2>
        {active.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            No manual credentials. Device-paired agents also appear here after
            they finish connecting.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line border-t border-b border-line">
            {active.map((key) => (
              <li
                key={key.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="font-medium text-ink">{key.name}</p>
                  <p className="font-mono text-sm text-muted">
                    {key.keyPrefix}…
                  </p>
                  <p className="text-xs text-muted">
                    Created {new Date(key.createdAt).toLocaleString()}
                    {key.lastUsedAt
                      ? ` · Last used ${new Date(key.lastUsedAt).toLocaleString()}`
                      : " · Never used"}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Can coordinate tasks and read approvals · cannot approve in
                    your place
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => revokeKey(key.id)}
                  className="cursor-pointer rounded-md border border-danger/40 px-3 py-1.5 text-sm font-medium text-danger transition hover:bg-danger/5"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {revoked.length > 0 && (
        <section>
          <h2 className="font-[family-name:var(--font-fraunces)] text-xl font-semibold text-muted">
            Revoked
          </h2>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            {revoked.map((key) => (
              <li key={key.id}>
                {key.name} · {key.keyPrefix}… · revoked{" "}
                {key.revokedAt
                  ? new Date(key.revokedAt).toLocaleString()
                  : ""}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
