import { headers } from "next/headers";
import { LinksManager } from "@/components/links-manager";
import { listLinksForUser } from "@/lib/links";
import { ensureCurrentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

async function originFromHeaders() {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export default async function LinksPage() {
  const user = await ensureCurrentUser();
  if (!user) {
    return <p className="text-danger">Unable to resolve your account.</p>;
  }

  let links: Awaited<ReturnType<typeof listLinksForUser>> = [];
  let dbError: string | null = null;

  try {
    links = await listLinksForUser(user, await originFromHeaders());
  } catch (err) {
    dbError = err instanceof Error ? err.message : "Database unavailable";
  }

  return (
    <div>
      <h1 className="font-[family-name:var(--font-fraunces)] text-3xl font-semibold tracking-[-0.02em] text-matcha-deep">
        Links
      </h1>
      <p className="mt-2 max-w-xl text-muted">
        Mutual peer links between people. Create an invite URL, share it with a
        friend’s bot/human, then accept or revoke.
      </p>

      {dbError ? (
        <p className="mt-6 text-sm text-danger" role="alert">
          Could not load links: {dbError}. Check DATABASE_URL.
        </p>
      ) : (
        <div className="mt-6">
          <LinksManager initialLinks={links} />
        </div>
      )}
    </div>
  );
}
