import { headers } from "next/headers";
import { LinksManager } from "@/components/links-manager";
import { PageHeading } from "@/components/page-heading";
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
      <PageHeading
        eyebrow="Your network"
        title="People"
        description="People your Grok Bot can coordinate with. Invitations are private, expire automatically, and can be revoked by either person."
      />
      <div className="mt-9">
        <LinksManager initialLinks={links} />
      </div>
    </div>
  );
}
