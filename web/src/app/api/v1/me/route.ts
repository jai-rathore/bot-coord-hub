import { authenticateAgent, unauthorizedJson } from "@/lib/agent-auth";

export const dynamic = "force-dynamic";

/**
 * Agent health-of-key stub.
 * GET /api/v1/me — Authorization: Bearer <api_key>
 */
export async function GET(request: Request) {
  const auth = await authenticateAgent(request);
  if (!auth) return unauthorizedJson();

  return Response.json({
    ok: true,
    user: {
      id: auth.user.id,
      email: auth.user.email,
      name: auth.user.name,
    },
    apiKey: {
      id: auth.apiKey.id,
      name: auth.apiKey.name,
      keyPrefix: auth.apiKey.keyPrefix,
    },
  });
}
