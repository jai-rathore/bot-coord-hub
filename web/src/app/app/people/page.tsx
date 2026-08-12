import { headers } from "next/headers";
import { LinksManager } from "@/components/links-manager";
import { listLinksForUser } from "@/lib/links";
import { ensureCurrentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

async function originFromHeaders() {
  const values = await headers();
  const proto = values.get("x-forwarded-proto") ?? "http";
  const host =
    values.get("x-forwarded-host") ??
    values.get("host") ??
    "localhost:3000";
  return `${proto}://${host}`;
}

export default async function PeoplePage() {
  const user = await ensureCurrentUser();
  if (!user) {
    return <p className="text-danger">Unable to resolve your account.</p>;
  }
  const links = await listLinksForUser(user, await originFromHeaders());

  return (
    <div>
      <h1 className="font-[family-name:var(--font-fraunces)] text-3xl font-semibold tracking-[-0.02em] text-matcha-deep">
        People
      </h1>
      <p className="mt-2 max-w-xl text-muted">
        People your agent can coordinate with. Relationship invitations are
        targeted, expire automatically, and can be revoked by either person.
      </p>
      <div className="mt-7">
        <LinksManager initialLinks={links} />
      </div>
    </div>
  );
}
