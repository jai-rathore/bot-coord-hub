import { headers } from "next/headers";
import { LinksManager } from "@/components/links-manager";
import { PageHeading } from "@/components/page-heading";
import { listLinksForUser } from "@/lib/links";
import { listPublicInvites } from "@/lib/public-invites";
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
  const origin = await originFromHeaders();
  const [links, publicInvites] = await Promise.all([
    listLinksForUser(user, origin),
    listPublicInvites(user, origin),
  ]);

  return (
    <div>
      <PageHeading
        eyebrow="Your network"
        title="People"
        description="Share your public honeymatcha.io handle, invite someone privately by email, or use a one-off public link. Every connection can be revoked."
      />
      <div className="mt-9">
        <LinksManager
          initialLinks={links}
          initialPublicInvites={publicInvites}
        />
      </div>
    </div>
  );
}
