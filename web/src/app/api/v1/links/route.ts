import { or, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { links } from "@/db/schema";
import { authenticateAgent, unauthorizedJson } from "@/lib/agent-auth";

export const dynamic = "force-dynamic";

/**
 * Agent list-links stub.
 * GET /api/v1/links — Authorization: Bearer <api_key>
 */
export async function GET(request: Request) {
  const auth = await authenticateAgent(request);
  if (!auth) return unauthorizedJson();

  const db = getDb();
  const rows = await db
    .select({
      id: links.id,
      toEmail: links.toEmail,
      toName: links.toName,
      status: links.status,
      scopes: links.scopes,
      inviteCode: links.inviteCode,
      createdAt: links.createdAt,
      updatedAt: links.updatedAt,
    })
    .from(links)
    .where(
      or(eq(links.fromUserId, auth.user.id), eq(links.toUserId, auth.user.id)),
    );

  return Response.json({
    ok: true,
    links: rows,
  });
}
