import { headers } from "next/headers";
import { LinksManager } from "@/components/links-manager";
import { PageHeading } from "@/components/page-heading";
import { PeopleMet } from "@/components/people-met";
import { listLinksForUser } from "@/lib/links";
import {
  agentConnectedUserIds,
  listPeopleMetThroughEvents,
} from "@/lib/people";
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

  // Anyone already connected belongs under Connected, not under "met through".
  // one person, one row, and the row that grants something wins.
  const linkedUserIds = new Set(
    links.map((link) => link.peer?.id).filter((id): id is string => Boolean(id)),
  );
  const met = await listPeopleMetThroughEvents(user, {
    excludeUserIds: linkedUserIds,
  });
  const agentUserIds = [...(await agentConnectedUserIds([...linkedUserIds]))];

  return (
    <div>
      <PageHeading
        eyebrow="Connections"
        title="People and agents you know"
        description="Find people you have coordinated with, approve new connections, and create a reusable link between your agents. For a new group plan, share an event link instead."
      />
      <div className="mt-9 space-y-10">
        <LinksManager
          initialLinks={links}
          initialPublicInvites={publicInvites}
          agentUserIds={agentUserIds}
        />
        <PeopleMet people={met} />
      </div>
    </div>
  );
}
