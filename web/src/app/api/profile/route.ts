import { claimAgentProfile, updateAgentProfile } from "@/lib/agent-profiles";
import { jsonError, readJsonBody, requestOrigin } from "@/lib/http";
import { ensureCurrentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await ensureCurrentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await readJsonBody<{
      handle?: string;
      displayName?: string;
      headline?: string;
      websiteUrl?: string;
      isPublished?: boolean;
    }>(request);
    const origin = requestOrigin(request);
    const profile = body.handle
      ? await claimAgentProfile({
          user,
          handle: body.handle,
          displayName: body.displayName,
          headline: body.headline,
          websiteUrl: body.websiteUrl,
          origin,
        })
      : await updateAgentProfile({
          user,
          displayName: body.displayName,
          headline: body.headline,
          websiteUrl: body.websiteUrl,
          isPublished: body.isPublished,
          origin,
        });
    return Response.json({ ok: true, profile });
  } catch (error) {
    return jsonError(error, "Failed to save public handle");
  }
}
